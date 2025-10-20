package game

import (
	"fmt"
	"hash/fnv"
	"math"
	"math/rand"
	"sort"
	"strings"
)

// BeaconDirector owns deterministic mission beacon layout, per-player progression,
// and encounter lifecycle for campaign missions. State is held in-memory so reconnects
// during the process lifetime preserve progress. Restarting the backend still incurs
// a mission penalty until durable storage is introduced.
type BeaconDirector struct {
	missionID string
	spec      MissionSpec
	seed      int64

	beacons            []BeaconLayout
	player             map[string]*playerBeaconProgress
	encounters         map[string]*EncounterState
	encounterCooldowns map[string]float64
	spawnTableID       string
	rng                *rand.Rand

	nextEncounterID int

	layoutDirty   bool // require snapshot rebuild (e.g. on init/world resize)
	snapshotDirty bool // signals snapshot needed for lobby subscribers

	pendingDeltas     []BeaconDelta
	pendingEncounters []EncounterDelta
	holdBroadcastStep float64
	holdEpsilon       float64

	CurrentMissionID  string
	ActiveObjectives  map[string]ObjectiveEvaluator
	ObjectiveProgress map[string]float64
	currentTemplate   *MissionTemplate
}

// MissionSpec configures a campaign mission's beacons and encounter behaviour.
type MissionSpec struct {
	ID                  string
	HoldSeconds         float64
	RevisitCooldown     float64
	MaxActiveEncounters int
	EncounterTimeout    float64
	BeaconCount         int
	MinDistance         float64
	MaxAttempts         int
	DensityFactor       float64
	DesignerPins        []BeaconPin
	SpawnTableID        string
}

// BeaconLayout is a concrete beacon placement (normalized coordinates) derived from a template seed.
type BeaconLayout struct {
	ID         string
	Ordinal    int
	Normalized Vec2
	Radius     float64
	Seed       int64
	Tags       map[string]bool
	Pinned     bool
}

// playerBeaconProgress tracks per-player mission progression.
type playerBeaconProgress struct {
	PlayerID          string
	CurrentIndex      int
	HoldAccum         float64
	HoldRequired      float64
	LastUpdate        float64
	ActiveBeaconID    string
	LastBroadcastHold float64
	HoldBeaconID      string
	Cooldowns         map[string]float64
	Discovered        map[string]bool
	Completed         map[string]bool
	LastSeen          float64
}

// EncounterState tracks spawned backend encounters so we can cleanly despawn them.
type EncounterState struct {
	ID          string
	BeaconID    string
	EncounterID string
	WaveIndex   int
	RuleIndex   int
	EntityIDs   []EntityID
	SpawnedAt   float64
	ExpiresAt   float64
	Reason      string
}

// Debug DTOs for beacon and encounter snapshots.
type DebugBeaconsDTO struct {
	Beacons []DebugBeaconInfo `json:"beacons"`
}

type DebugBeaconInfo struct {
	ID     string   `json:"id"`
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	Tags   []string `json:"tags"`
	Pinned bool     `json:"pinned"`
}

type DebugEncountersDTO struct {
	Encounters []DebugEncounterInfo `json:"encounters"`
}

type DebugEncounterInfo struct {
	EncounterID string  `json:"encounterId"`
	BeaconID    string  `json:"beaconId"`
	SpawnTime   float64 `json:"spawnTime"`
	Lifetime    float64 `json:"lifetime"`
	EntityCount int     `json:"entityCount"`
}

// BeaconDeltaType enumerates per-tick beacon events.
type BeaconDeltaType int

const (
	BeaconDeltaNone BeaconDeltaType = iota
	BeaconDeltaDiscovered
	BeaconDeltaHoldProgress
	BeaconDeltaHoldReset
	BeaconDeltaBeaconLocked
	BeaconDeltaCooldownSet
	BeaconDeltaMissionCompleted
)

// BeaconDelta captures per-player updates for websocket consumers.
type BeaconDelta struct {
	Type          BeaconDeltaType
	PlayerID      string
	BeaconID      string
	Ordinal       int
	HoldAccum     float64
	HoldRequired  float64
	CooldownUntil float64
	Timestamp     float64
}

// EncounterDeltaType enumerates encounter lifecycle changes.
type EncounterDeltaType int

const (
	EncounterDeltaSpawned EncounterDeltaType = iota + 1
	EncounterDeltaCleared
	EncounterDeltaTimeout
	EncounterDeltaPurged
)

// EncounterDelta records encounter transitions for websocket publishing.
type EncounterDelta struct {
	Type      EncounterDeltaType
	Encounter EncounterSummary
	Reason    string
}

// EncounterSummary is a lightweight representation of encounter state.
type EncounterSummary struct {
	ID        string
	BeaconID  string
	WaveIndex int
	SpawnedAt float64
	ExpiresAt float64
	Active    bool
}

// MissionSpec registry. Additional campaign phases can extend this table.
var missionSpecs = map[string]MissionSpec{
	"campaign-1": {
		ID:                  "campaign-1",
		HoldSeconds:         10,
		RevisitCooldown:     30,
		MaxActiveEncounters: 2,
		EncounterTimeout:    120,
		BeaconCount:         4,
		MinDistance:         2500,
		MaxAttempts:         30,
		DensityFactor:       1.0,
		DesignerPins:        nil,
		SpawnTableID:        "campaign-1-standard",
	},
}

// deriveSeed returns a deterministic seed derived from room & mission identifiers.
func deriveSeed(roomID, missionID string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(roomID))
	_, _ = h.Write([]byte("::"))
	_, _ = h.Write([]byte(strings.ToLower(missionID)))
	return int64(h.Sum64())
}

// NewBeaconDirector builds a mission director for the provided room/mission context.
func NewBeaconDirector(roomID, missionID string, worldW, worldH float64) (*BeaconDirector, bool) {
	spec, ok := missionSpecs[missionID]
	if !ok {
		spec, ok = missionSpecs["campaign-1"]
		if !ok {
			return nil, false
		}
	}
	seed := deriveSeed(roomID, spec.ID)
	layout := instantiateLayout(spec, seed, worldW, worldH)
	var tmpl *MissionTemplate
	if candidate, err := GetTemplate(spec.ID); err == nil {
		tmpl = candidate
	}
	return &BeaconDirector{
		missionID:          spec.ID,
		spec:               spec,
		seed:               seed,
		beacons:            layout,
		player:             make(map[string]*playerBeaconProgress),
		encounters:         make(map[string]*EncounterState),
		encounterCooldowns: make(map[string]float64),
		spawnTableID:       spec.SpawnTableID,
		rng:                rand.New(rand.NewSource(seed)),
		layoutDirty:        true,
		snapshotDirty:      true,
		holdBroadcastStep:  0.1,
		holdEpsilon:        0.0001,
		CurrentMissionID:   spec.ID,
		ActiveObjectives:   make(map[string]ObjectiveEvaluator),
		ObjectiveProgress:  make(map[string]float64),
		currentTemplate:    tmpl,
	}, true
}

// instantiateLayout converts templates into jittered normalized coordinates.
func instantiateLayout(spec MissionSpec, seed int64, worldW, worldH float64) []BeaconLayout {
	if worldW <= 0 {
		worldW = WorldW
	}
	if worldH <= 0 {
		worldH = WorldH
	}

	bounds := Rect{
		MinX: 0,
		MinY: 0,
		MaxX: worldW,
		MaxY: worldH,
	}

	config := SamplerConfig{
		MinDistance:   spec.MinDistance,
		MaxAttempts:   spec.MaxAttempts,
		DensityFactor: spec.DensityFactor,
		WorldBounds:   bounds,
		Seed:          seed,
		DesignerPins:  spec.DesignerPins,
		BiomeTaggers: []BiomeTagger{
			QuadrantTagger(bounds),
		},
	}

	count := spec.BeaconCount
	if count <= 0 {
		count = len(spec.DesignerPins)
		if count == 0 {
			count = 1
		}
	}

	candidates := NewPoissonDiscSampler(config).Sample(count)
	layout := make([]BeaconLayout, len(candidates))
	width := bounds.MaxX - bounds.MinX
	height := bounds.MaxY - bounds.MinY

	for idx, candidate := range candidates {
		id := fmt.Sprintf("beacon-%d", idx+1)

		normalized := Vec2{}
		if width > 0 {
			normalized.X = Clamp((candidate.X-bounds.MinX)/width, 0, 1)
		}
		if height > 0 {
			normalized.Y = Clamp((candidate.Y-bounds.MinY)/height, 0, 1)
		}

		radius := candidate.Radius
		if radius <= 0 {
			radius = 300
		}

		layout[idx] = BeaconLayout{
			ID:         id,
			Ordinal:    idx,
			Normalized: normalized,
			Radius:     radius,
			Seed:       seed + int64(idx),
			Tags:       copyTags(candidate.Tags),
			Pinned:     candidate.Pinned,
		}
	}

	return layout
}

// MissionID returns the active mission identifier.
func (d *BeaconDirector) MissionID() string {
	if d == nil {
		return ""
	}
	return d.missionID
}

// LayoutSeed is exposed so clients can derive deterministic positions offline.
func (d *BeaconDirector) LayoutSeed() uint64 {
	if d == nil {
		return 0
	}
	if d.seed < 0 {
		return uint64(^d.seed + 1)
	}
	return uint64(d.seed)
}

// Positions returns physical positions for each beacon with the provided world bounds.
func (d *BeaconDirector) Positions(worldW, worldH float64) []Vec2 {
	if d == nil {
		return nil
	}
	out := make([]Vec2, len(d.beacons))
	for i, beacon := range d.beacons {
		out[i] = Vec2{
			X: Clamp(beacon.Normalized.X, 0, 1) * worldW,
			Y: Clamp(beacon.Normalized.Y, 0, 1) * worldH,
		}
	}
	return out
}

// Snapshot builds a view of mission state for websocket consumers.
func (d *BeaconDirector) Snapshot(now float64, worldW, worldH float64) BeaconSnapshot {
	if d == nil {
		return BeaconSnapshot{}
	}
	beacons := make([]BeaconSnapshotBeacon, len(d.beacons))
	for i, layout := range d.beacons {
		pos := Vec2{
			X: Clamp(layout.Normalized.X, 0, 1) * worldW,
			Y: Clamp(layout.Normalized.Y, 0, 1) * worldH,
		}
		beacons[i] = BeaconSnapshotBeacon{
			ID:      layout.ID,
			Ordinal: layout.Ordinal,
			X:       pos.X,
			Y:       pos.Y,
			Radius:  layout.Radius,
			Seed:    layout.Seed,
		}
	}

	players := make([]BeaconSnapshotPlayer, 0, len(d.player))
	for _, ps := range d.player {
		if ps == nil {
			continue
		}
		var discovered []string
		for id, ok := range ps.Discovered {
			if ok {
				discovered = append(discovered, id)
			}
		}
		var completed []string
		for id, ok := range ps.Completed {
			if ok {
				completed = append(completed, id)
			}
		}
		cooldowns := make(map[string]float64, len(ps.Cooldowns))
		for id, until := range ps.Cooldowns {
			cooldowns[id] = until
		}
		players = append(players, BeaconSnapshotPlayer{
			PlayerID:     ps.PlayerID,
			ActiveBeacon: ps.ActiveBeaconID,
			CurrentIndex: ps.CurrentIndex,
			HoldAccum:    ps.HoldAccum,
			HoldRequired: ps.HoldRequired,
			Discovered:   discovered,
			Completed:    completed,
			Cooldowns:    cooldowns,
			LastSeen:     ps.LastSeen,
		})
	}

	encounters := make([]EncounterSummary, 0, len(d.encounters))
	for _, enc := range d.encounters {
		if enc == nil {
			continue
		}
		encounters = append(encounters, EncounterSummary{
			ID:        enc.ID,
			BeaconID:  enc.BeaconID,
			WaveIndex: enc.WaveIndex,
			SpawnedAt: enc.SpawnedAt,
			ExpiresAt: enc.ExpiresAt,
			Active:    true,
		})
	}

	return BeaconSnapshot{
		MissionID:  d.missionID,
		LayoutSeed: d.LayoutSeed(),
		ServerTime: now,
		Beacons:    beacons,
		Players:    players,
		Encounters: encounters,
	}
}

// BeaconSnapshot captures the authoritative mission state for websocket broadcast.
type BeaconSnapshot struct {
	MissionID  string
	LayoutSeed uint64
	ServerTime float64
	Beacons    []BeaconSnapshotBeacon
	Players    []BeaconSnapshotPlayer
	Encounters []EncounterSummary
}

// BeaconSnapshotBeacon describes a beacon placement in the snapshot payload.
type BeaconSnapshotBeacon struct {
	ID      string
	Ordinal int
	X       float64
	Y       float64
	Radius  float64
	Seed    int64
}

// BeaconSnapshotPlayer summarizes a player's mission state.
type BeaconSnapshotPlayer struct {
	PlayerID     string
	ActiveBeacon string
	CurrentIndex int
	HoldAccum    float64
	HoldRequired float64
	Discovered   []string
	Completed    []string
	Cooldowns    map[string]float64
	LastSeen     float64
}

// PendingDeltas returns and clears the queued beacon deltas.
func (d *BeaconDirector) PendingDeltas() []BeaconDelta {
	if d == nil || len(d.pendingDeltas) == 0 {
		return nil
	}
	out := d.pendingDeltas
	d.pendingDeltas = nil
	return out
}

// PendingEncounterDeltas returns encounter lifecycle events.
func (d *BeaconDirector) PendingEncounterDeltas() []EncounterDelta {
	if d == nil || len(d.pendingEncounters) == 0 {
		return nil
	}
	out := d.pendingEncounters
	d.pendingEncounters = nil
	return out
}

// SnapshotDirty indicates whether a new snapshot should be broadcast.
func (d *BeaconDirector) SnapshotDirty() bool {
	if d == nil {
		return false
	}
	return d.snapshotDirty || d.layoutDirty
}

// ClearSnapshotDirty resets the snapshot dirty flags after broadcasting.
func (d *BeaconDirector) ClearSnapshotDirty() {
	if d == nil {
		return
	}
	d.snapshotDirty = false
	d.layoutDirty = false
}

// MarkLayoutDirty triggers a snapshot rebuild (e.g. after world size change).
func (d *BeaconDirector) MarkLayoutDirty() {
	if d == nil {
		return
	}
	d.layoutDirty = true
}

// Tick updates beacon progression, collects deltas, and cleans up encounters.
func (d *BeaconDirector) Tick(r *Room) {
	if d == nil || r == nil {
		return
	}
	d.pruneExpiredEncounters(r)
	for playerID, p := range r.Players {
		if p == nil {
			continue
		}
		if p.IsBot {
			continue
		}
		state := d.ensurePlayerState(playerID)
		state.LastSeen = r.Now
		d.updatePlayerProgress(r, p, state)
	}

	if len(d.ActiveObjectives) > 0 {
		completed := make([]string, 0)
		for objID, evaluator := range d.ActiveObjectives {
			for _, p := range r.Players {
				if p == nil || p.IsBot {
					continue
				}
				complete, progress := evaluator.Evaluate(r, p)
				progress = Clamp(progress, 0, 1)
				last := d.ObjectiveProgress[objID]
				if math.Abs(progress-last) > 0.01 {
					d.ObjectiveProgress[objID] = progress
					r.BroadcastObjectiveProgress(p, objID, progress)
				}
				if complete {
					r.BroadcastObjectiveComplete(p, objID)
					completed = append(completed, objID)
					break
				}
			}
		}
		if len(completed) > 0 {
			for _, id := range completed {
				delete(d.ActiveObjectives, id)
				delete(d.ObjectiveProgress, id)
			}
		}
	}

	if d.spawnTableID != "" {
		d.checkEncounterSpawns(r)
	}
}

func (d *BeaconDirector) checkEncounterSpawns(r *Room) {
	if d == nil || r == nil || d.spawnTableID == "" {
		return
	}
	table, err := GetSpawnTable(d.spawnTableID)
	if err != nil {
		return
	}

	for playerID, p := range r.Players {
		if p == nil || p.IsBot {
			continue
		}
		state := d.ensurePlayerState(playerID)
		if state == nil {
			continue
		}
		shipTransform := r.World.Transform(p.Ship)
		if shipTransform == nil {
			continue
		}

		for idx := range d.beacons {
			beacon := &d.beacons[idx]
			if beacon == nil || !state.Discovered[beacon.ID] {
				continue
			}
			if d.hasActiveEncounterAtBeacon(beacon.ID) {
				continue
			}

			center := d.beaconWorldPosition(beacon, r)
			offset := shipTransform.Pos.Sub(center)
			if offset.Dot(offset) > (beacon.Radius*2)*(beacon.Radius*2) {
				continue
			}

			if d.rng.Float64() > 0.05 {
				continue
			}

			encounterID, ruleIdx, err := table.SelectEncounter(beacon, p.StoryFlags, d.rng)
			if err != nil {
				continue
			}
			template, err := GetEncounter(encounterID)
			if err != nil {
				continue
			}

			if template.MaxConcurrency > 0 && d.countEncountersForTemplate(encounterID) >= template.MaxConcurrency {
				continue
			}

			rule := SpawnRule{}
			if ruleIdx >= 0 && ruleIdx < len(table.Rules) {
				rule = table.Rules[ruleIdx]
				if rule.MaxConcurrent > 0 && d.countEncountersForRule(ruleIdx) >= rule.MaxConcurrent {
					continue
				}
				if !d.cooldownReady(fmt.Sprintf("rule:%d", ruleIdx), r.Now) {
					continue
				}
			}

			if !d.cooldownReady("encounter:"+encounterID, r.Now) {
				continue
			}

			d.spawnEncounterFromTemplate(r, encounterID, ruleIdx, beacon, template, rule)
		}
	}
}

func (d *BeaconDirector) spawnEncounterFromTemplate(r *Room, encounterID string, ruleIdx int, beacon *BeaconLayout, template *EncounterTemplate, rule SpawnRule) {
	if d == nil || r == nil || beacon == nil || template == nil {
		return
	}
	center := d.beaconWorldPosition(beacon, r)
	seed := beacon.Seed + int64(ruleIdx+1)*31 + int64(d.nextEncounterID+1)*17
	entities := SpawnFromTemplate(r, template, center, seed)
	if len(entities) == 0 {
		return
	}

	encID := fmt.Sprintf("enc-%d", d.nextEncounterID+1)
	d.nextEncounterID++
	lifetime := template.Lifetime
	if lifetime <= 0 {
		lifetime = d.spec.EncounterTimeout
	}
	state := &EncounterState{
		ID:          encID,
		BeaconID:    beacon.ID,
		EncounterID: encounterID,
		WaveIndex:   0,
		RuleIndex:   ruleIdx,
		EntityIDs:   entities,
		SpawnedAt:   r.Now,
		ExpiresAt:   r.Now + lifetime,
	}
	d.encounters[encID] = state
	d.pendingEncounters = append(d.pendingEncounters, EncounterDelta{
		Type: EncounterDeltaSpawned,
		Encounter: EncounterSummary{
			ID:        state.ID,
			BeaconID:  state.BeaconID,
			WaveIndex: state.WaveIndex,
			SpawnedAt: state.SpawnedAt,
			ExpiresAt: state.ExpiresAt,
			Active:    true,
		},
	})
	d.snapshotDirty = true

	d.setCooldown("encounter:"+encounterID, r.Now, template.Cooldown)
	if ruleIdx >= 0 && rule.Cooldown > 0 {
		d.setCooldown(fmt.Sprintf("rule:%d", ruleIdx), r.Now, rule.Cooldown)
	}
}

func (d *BeaconDirector) beaconWorldPosition(beacon *BeaconLayout, r *Room) Vec2 {
	worldW := r.WorldWidth
	worldH := r.WorldHeight
	return Vec2{
		X: Clamp(beacon.Normalized.X, 0, 1) * worldW,
		Y: Clamp(beacon.Normalized.Y, 0, 1) * worldH,
	}
}

func (d *BeaconDirector) hasActiveEncounterAtBeacon(beaconID string) bool {
	for _, enc := range d.encounters {
		if enc == nil {
			continue
		}
		if enc.BeaconID == beaconID {
			return true
		}
	}
	return false
}

func (d *BeaconDirector) countEncountersForTemplate(encounterID string) int {
	count := 0
	for _, enc := range d.encounters {
		if enc == nil {
			continue
		}
		if enc.EncounterID == encounterID {
			count++
		}
	}
	return count
}

func (d *BeaconDirector) countEncountersForRule(ruleIdx int) int {
	if ruleIdx < 0 {
		return 0
	}
	count := 0
	for _, enc := range d.encounters {
		if enc == nil {
			continue
		}
		if enc.RuleIndex == ruleIdx {
			count++
		}
	}
	return count
}

func (d *BeaconDirector) cooldownReady(key string, now float64) bool {
	if d.encounterCooldowns == nil || key == "" {
		return true
	}
	if until, ok := d.encounterCooldowns[key]; ok && now < until {
		return false
	}
	return true
}

func (d *BeaconDirector) setCooldown(key string, now, duration float64) {
	if key == "" || duration <= 0 {
		if d.encounterCooldowns != nil {
			delete(d.encounterCooldowns, key)
		}
		return
	}
	if d.encounterCooldowns == nil {
		d.encounterCooldowns = make(map[string]float64)
	}
	d.encounterCooldowns[key] = now + duration
}

// BuildDebugSnapshot returns DTOs describing current beacon layout and active encounters.
func (d *BeaconDirector) BuildDebugSnapshot(worldW, worldH float64) (DebugBeaconsDTO, DebugEncountersDTO) {
	var beaconDTO DebugBeaconsDTO
	var encounterDTO DebugEncountersDTO

	if d == nil {
		beaconDTO.Beacons = []DebugBeaconInfo{}
		encounterDTO.Encounters = []DebugEncounterInfo{}
		return beaconDTO, encounterDTO
	}

	positions := d.Positions(worldW, worldH)
	for idx, beacon := range d.beacons {
		var pos Vec2
		if idx < len(positions) {
			pos = positions[idx]
		}

		tags := make([]string, 0, len(beacon.Tags))
		for tag := range beacon.Tags {
			tags = append(tags, tag)
		}
		sort.Strings(tags)

		beaconDTO.Beacons = append(beaconDTO.Beacons, DebugBeaconInfo{
			ID:     beacon.ID,
			X:      pos.X,
			Y:      pos.Y,
			Tags:   tags,
			Pinned: beacon.Pinned,
		})
	}
	sort.Slice(beaconDTO.Beacons, func(i, j int) bool {
		return beaconDTO.Beacons[i].ID < beaconDTO.Beacons[j].ID
	})

	for _, enc := range d.encounters {
		if enc == nil {
			continue
		}
		lifetime := enc.ExpiresAt - enc.SpawnedAt
		if lifetime < 0 {
			lifetime = 0
		}
		encounterDTO.Encounters = append(encounterDTO.Encounters, DebugEncounterInfo{
			EncounterID: enc.EncounterID,
			BeaconID:    enc.BeaconID,
			SpawnTime:   enc.SpawnedAt,
			Lifetime:    lifetime,
			EntityCount: len(enc.EntityIDs),
		})
	}
	sort.Slice(encounterDTO.Encounters, func(i, j int) bool {
		return encounterDTO.Encounters[i].EncounterID < encounterDTO.Encounters[j].EncounterID
	})

	if beaconDTO.Beacons == nil {
		beaconDTO.Beacons = []DebugBeaconInfo{}
	}
	if encounterDTO.Encounters == nil {
		encounterDTO.Encounters = []DebugEncounterInfo{}
	}

	return beaconDTO, encounterDTO
}

// MissionTemplate returns the current template reference, fetching from registry if needed.
func (d *BeaconDirector) MissionTemplate() *MissionTemplate {
	if d == nil {
		return nil
	}
	if d.currentTemplate != nil {
		return d.currentTemplate
	}
	if tmpl, err := GetTemplate(d.missionID); err == nil {
		d.currentTemplate = tmpl
		return tmpl
	}
	return nil
}

// AcceptMission configures active objectives for the mission and sets the current template.
func (d *BeaconDirector) AcceptMission(r *Room, p *Player, missionID string) error {
	if d == nil || r == nil || p == nil {
		return fmt.Errorf("cannot accept mission: invalid context")
	}
	if missionID == "" {
		missionID = d.missionID
	}
	tmpl, err := GetTemplate(missionID)
	if err != nil {
		return err
	}
	if err := tmpl.Validate(); err != nil {
		return err
	}
	if d.ActiveObjectives == nil {
		d.ActiveObjectives = make(map[string]ObjectiveEvaluator)
	}
	if d.ObjectiveProgress == nil {
		d.ObjectiveProgress = make(map[string]float64)
	}
	for id := range d.ActiveObjectives {
		delete(d.ActiveObjectives, id)
	}
	for id := range d.ObjectiveProgress {
		delete(d.ObjectiveProgress, id)
	}

	d.currentTemplate = tmpl
	d.CurrentMissionID = tmpl.ID

	switch tmpl.Archetype {
	case ArchetypeTravel, ArchetypeEscort:
		for _, beacon := range d.beacons {
			objID := fmt.Sprintf("reach-%s", beacon.ID)
			target := Vec2{
				X: Clamp(beacon.Normalized.X, 0, 1) * r.WorldWidth,
				Y: Clamp(beacon.Normalized.Y, 0, 1) * r.WorldHeight,
			}
			threshold := beacon.Radius
			if threshold <= 0 {
				threshold = math.Max(r.WorldWidth, r.WorldHeight) * 0.05
			}
			d.ActiveObjectives[objID] = &DistanceEvaluator{
				TargetX:    target.X,
				TargetY:    target.Y,
				Threshold:  threshold,
				Identifier: objID,
			}
			d.ObjectiveProgress[objID] = 0
		}
	case ArchetypeKill:
		required, ok := floatFromParam(tmpl.ObjectiveParams["requiredKills"])
		if !ok || required <= 0 {
			required = 1
		}
		tag := ""
		if v, ok := tmpl.ObjectiveParams["targetTag"]; ok {
			if s, ok := v.(string); ok {
				tag = s
			}
		}
		if tag == "" {
			tag = "enemy"
		}
		objID := fmt.Sprintf("kill-%s", tag)
		d.ActiveObjectives[objID] = &KillCountEvaluator{
			TargetTag:     tag,
			RequiredKills: int(math.Ceil(required)),
		}
		d.ObjectiveProgress[objID] = 0
	case ArchetypeHazard:
		radius, _ := floatFromParam(tmpl.ObjectiveParams["radius"])
		if radius <= 0 {
			radius = 500
		}
		cx, ok := floatFromParam(tmpl.ObjectiveParams["centerX"])
		if !ok {
			cx = r.WorldWidth * 0.5
		}
		cy, ok := floatFromParam(tmpl.ObjectiveParams["centerY"])
		if !ok {
			cy = r.WorldHeight * 0.5
		}
		objID := "hazard-clear"
		d.ActiveObjectives[objID] = &HazardClearEvaluator{
			CenterX: cx,
			CenterY: cy,
			Radius:  radius,
		}
		d.ObjectiveProgress[objID] = 0
	}

	return nil
}

func (d *BeaconDirector) ensurePlayerState(playerID string) *playerBeaconProgress {
	if d == nil {
		return nil
	}
	if state, ok := d.player[playerID]; ok && state != nil {
		return state
	}
	state := &playerBeaconProgress{
		PlayerID:       playerID,
		CurrentIndex:   0,
		HoldAccum:      0,
		HoldRequired:   d.spec.HoldSeconds,
		LastUpdate:     0,
		ActiveBeaconID: d.activeBeaconID(0),
		Cooldowns:      make(map[string]float64),
		Discovered:     make(map[string]bool),
		Completed:      make(map[string]bool),
	}
	d.player[playerID] = state
	d.snapshotDirty = true
	return state
}

func (d *BeaconDirector) activeBeaconID(index int) string {
	if d == nil || index < 0 || index >= len(d.beacons) {
		return ""
	}
	return d.beacons[index].ID
}

func (d *BeaconDirector) updatePlayerProgress(r *Room, p *Player, state *playerBeaconProgress) {
	if state == nil {
		return
	}

	state.HoldRequired = d.spec.HoldSeconds
	targetIndex := state.CurrentIndex
	if targetIndex >= len(d.beacons) {
		// Mission complete, nothing to update aside from cooldown timer cleanup.
		state.ActiveBeaconID = ""
		state.LastUpdate = r.Now
		return
	}

	beacon := d.beacons[targetIndex]
	state.ActiveBeaconID = beacon.ID

	if state.LastUpdate == 0 {
		state.LastUpdate = r.Now
		return
	}

	dt := r.Now - state.LastUpdate
	if dt < 0 {
		dt = 0
	}
	state.LastUpdate = r.Now

	shipTransform := r.World.Transform(p.Ship)
	if shipTransform == nil {
		d.resetHoldProgress(state, beacon, r.Now)
		return
	}

	targetPos := Vec2{
		X: Clamp(beacon.Normalized.X, 0, 1) * r.WorldWidth,
		Y: Clamp(beacon.Normalized.Y, 0, 1) * r.WorldHeight,
	}
	offset := shipTransform.Pos.Sub(targetPos)
	distSq := offset.Dot(offset)

	discoverRadius := beacon.Radius * 1.8
	if distSq <= discoverRadius*discoverRadius && !state.Discovered[beacon.ID] {
		state.Discovered[beacon.ID] = true
		d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
			Type:      BeaconDeltaDiscovered,
			PlayerID:  p.ID,
			BeaconID:  beacon.ID,
			Ordinal:   beacon.Ordinal,
			Timestamp: r.Now,
		})
	}

	if until, ok := state.Cooldowns[beacon.ID]; ok && r.Now < until {
		d.resetHoldProgress(state, beacon, r.Now)
		return
	}

	if distSq <= beacon.Radius*beacon.Radius {
		state.HoldBeaconID = beacon.ID
		state.HoldAccum = Clamp(state.HoldAccum+dt, 0, state.HoldRequired)
		progressDelta := math.Abs(state.HoldAccum - state.LastBroadcastHold)
		if state.HoldAccum >= state.HoldRequired-d.holdEpsilon {
			d.lockBeacon(r, p, state, beacon)
		} else if progressDelta >= d.holdBroadcastStep {
			state.LastBroadcastHold = state.HoldAccum
			d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
				Type:         BeaconDeltaHoldProgress,
				PlayerID:     p.ID,
				BeaconID:     beacon.ID,
				Ordinal:      beacon.Ordinal,
				HoldAccum:    state.HoldAccum,
				HoldRequired: state.HoldRequired,
				Timestamp:    r.Now,
			})
		}
	} else {
		if state.HoldAccum > 0 {
			state.HoldAccum = 0
			state.LastBroadcastHold = 0
			d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
				Type:         BeaconDeltaHoldReset,
				PlayerID:     p.ID,
				BeaconID:     beacon.ID,
				Ordinal:      beacon.Ordinal,
				HoldRequired: state.HoldRequired,
				Timestamp:    r.Now,
			})
		}
		state.HoldBeaconID = ""
	}
}

func (d *BeaconDirector) resetHoldProgress(state *playerBeaconProgress, beacon BeaconLayout, now float64) {
	if state == nil {
		return
	}
	if state.HoldAccum > 0 {
		state.HoldAccum = 0
		state.LastBroadcastHold = 0
		d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
			Type:      BeaconDeltaHoldReset,
			PlayerID:  state.PlayerID,
			BeaconID:  beacon.ID,
			Ordinal:   beacon.Ordinal,
			Timestamp: now,
		})
	}
	state.HoldBeaconID = ""
}

func (d *BeaconDirector) lockBeacon(r *Room, p *Player, state *playerBeaconProgress, beacon BeaconLayout) {
	state.Completed[beacon.ID] = true
	state.HoldAccum = 0
	state.LastBroadcastHold = 0
	state.Cooldowns[beacon.ID] = r.Now + d.spec.RevisitCooldown

	d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
		Type:          BeaconDeltaBeaconLocked,
		PlayerID:      p.ID,
		BeaconID:      beacon.ID,
		Ordinal:       beacon.Ordinal,
		HoldAccum:     0,
		HoldRequired:  state.HoldRequired,
		CooldownUntil: state.Cooldowns[beacon.ID],
		Timestamp:     r.Now,
	})

	state.CurrentIndex++
	state.HoldBeaconID = ""
	state.ActiveBeaconID = d.activeBeaconID(state.CurrentIndex)

	r.HandleMissionStoryEventLocked(p, "mission:beacon-locked", beacon.Ordinal+1)

	if state.CurrentIndex >= len(d.beacons) {
		state.ActiveBeaconID = ""
		d.pendingDeltas = append(d.pendingDeltas, BeaconDelta{
			Type:      BeaconDeltaMissionCompleted,
			PlayerID:  p.ID,
			BeaconID:  beacon.ID,
			Ordinal:   beacon.Ordinal,
			Timestamp: r.Now,
		})
		r.HandleMissionStoryEventLocked(p, "mission:completed", 0)
	} else {
		// Launch campaign encounter tied to this beacon completion.
		nextWave := beacon.Ordinal + 1
		if nextWave >= 1 && nextWave <= 3 {
			d.launchEncounter(r, beacon.ID, nextWave)
		}
	}
	d.snapshotDirty = true
}

// TriggerEncounterForWaveLocked allows legacy clients to request an encounter spawn.
// It maps the wave index (1-based) to the corresponding beacon prior to launch.
func (d *BeaconDirector) TriggerEncounterForWaveLocked(r *Room, waveIndex int) {
	if d == nil || r == nil {
		return
	}
	ordinal := waveIndex - 1
	beaconID := ""
	if ordinal >= 0 && ordinal < len(d.beacons) {
		beaconID = d.beacons[ordinal].ID
	}
	d.launchEncounter(r, beaconID, waveIndex)
}

func (d *BeaconDirector) launchEncounter(r *Room, beaconID string, waveIndex int) {
	if !r.SetMissionWaveSpawnedLocked(waveIndex) {
		return
	}

	d.pruneExpiredEncounters(r)
	if d.spec.MaxActiveEncounters > 0 && d.activeEncounterCount() >= d.spec.MaxActiveEncounters {
		d.forceExpireOldestEncounter(r)
	}

	entityIDs := r.SpawnMissionWave(waveIndex, d.Positions(r.WorldWidth, r.WorldHeight))
	if len(entityIDs) == 0 {
		return
	}

	encID := fmt.Sprintf("enc-%d", d.nextEncounterID+1)
	d.nextEncounterID++
	state := &EncounterState{
		ID:          encID,
		BeaconID:    beaconID,
		EncounterID: fmt.Sprintf("wave-%d", waveIndex),
		WaveIndex:   waveIndex,
		RuleIndex:   -1,
		EntityIDs:   entityIDs,
		SpawnedAt:   r.Now,
		ExpiresAt:   r.Now + d.spec.EncounterTimeout,
	}
	d.encounters[encID] = state
	d.pendingEncounters = append(d.pendingEncounters, EncounterDelta{
		Type: EncounterDeltaSpawned,
		Encounter: EncounterSummary{
			ID:        state.ID,
			BeaconID:  state.BeaconID,
			WaveIndex: state.WaveIndex,
			SpawnedAt: state.SpawnedAt,
			ExpiresAt: state.ExpiresAt,
			Active:    true,
		},
	})
	d.snapshotDirty = true
}

func (d *BeaconDirector) activeEncounterCount() int {
	count := 0
	for _, enc := range d.encounters {
		if enc != nil {
			count++
		}
	}
	return count
}

func (d *BeaconDirector) forceExpireOldestEncounter(r *Room) {
	var oldest *EncounterState
	var oldestID string
	for id, enc := range d.encounters {
		if enc == nil {
			continue
		}
		if oldest == nil || enc.SpawnedAt < oldest.SpawnedAt {
			oldest = enc
			oldestID = id
		}
	}
	if oldest != nil {
		d.endEncounter(r, oldestID, oldest, EncounterDeltaPurged, "purged")
	}
}

func (d *BeaconDirector) pruneExpiredEncounters(r *Room) {
	if len(d.encounters) == 0 {
		return
	}
	gc := make([]string, 0)
	for id, enc := range d.encounters {
		if enc == nil {
			gc = append(gc, id)
			continue
		}
		alive := false
		for _, entityID := range enc.EntityIDs {
			if r.World.Exists(entityID) {
				alive = true
				break
			}
		}
		if alive && r.Now < enc.ExpiresAt {
			continue
		}
		reason := EncounterDeltaCleared
		desc := "cleared"
		if r.Now >= enc.ExpiresAt && alive {
			reason = EncounterDeltaTimeout
			desc = "timeout"
		}
		d.endEncounter(r, id, enc, reason, desc)
		gc = append(gc, id)
	}
	for _, id := range gc {
		delete(d.encounters, id)
	}
	if len(gc) > 0 {
		d.snapshotDirty = true
	}
}

func (d *BeaconDirector) endEncounter(r *Room, id string, enc *EncounterState, delta EncounterDeltaType, reason string) {
	for _, entityID := range enc.EntityIDs {
		if r.World.Exists(entityID) {
			r.World.RemoveEntity(entityID)
		}
	}
	d.pendingEncounters = append(d.pendingEncounters, EncounterDelta{
		Type: delta,
		Encounter: EncounterSummary{
			ID:        enc.ID,
			BeaconID:  enc.BeaconID,
			WaveIndex: enc.WaveIndex,
			SpawnedAt: enc.SpawnedAt,
			ExpiresAt: enc.ExpiresAt,
			Active:    false,
		},
		Reason: reason,
	})
}
