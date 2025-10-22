package game

import (
	"fmt"
	"log"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"LightSpeedDuel/internal/dag"
)

type MissileRouteDef struct {
	ID        string
	Name      string
	Waypoints []RouteWaypoint
}

type Player struct {
	ID                   string
	Name                 string
	Ship                 EntityID
	MissileConfig        MissileConfig
	MissileRoutes        []*MissileRouteDef
	ActiveMissileRouteID string
	MissileReadyAt       float64
	IsBot                bool
	Kills                int
	DagState             *dag.State // Progression state for crafting/upgrades
	Inventory            *Inventory // Player's crafted items
	StoryFlags           map[string]bool
	ActiveStoryNodeID    string
	PendingStoryEvents   []StoryEvent
	Capabilities         dag.PlayerCapabilities
	PendingMessages      []OutboundMessage
}

// SendMessage queues an outbound event for the connected player.
func (p *Player) SendMessage(event string, payload interface{}) {
	if p == nil || event == "" {
		return
	}
	p.PendingMessages = append(p.PendingMessages, OutboundMessage{
		Type:    event,
		Payload: payload,
	})
}

// ConsumePendingMessages drains queued outbound events for transport.
func (p *Player) ConsumePendingMessages() []OutboundMessage {
	if p == nil || len(p.PendingMessages) == 0 {
		return nil
	}
	out := make([]OutboundMessage, len(p.PendingMessages))
	copy(out, p.PendingMessages)
	p.PendingMessages = nil
	return out
}

type Room struct {
	ID                     string
	Now                    float64
	World                  *World
	Players                map[string]*Player
	Mu                     sync.Mutex
	Bots                   map[string]*AIAgent
	stopChan               chan struct{}
	stopped                bool
	WorldWidth             float64
	WorldHeight            float64
	heatDefaults           HeatParams
	missionWaves           map[int]bool
	missionDirector        *BeaconDirector
	missionSnapshotVersion uint64
	missionSnapshot        BeaconSnapshot
	missionFrameVersion    uint64
	missionFrameDeltas     []BeaconDelta
	missionFrameEncounters []EncounterDelta
}

func newRoom(id string, defaults HeatParams) *Room {
	sanitized := SanitizeHeatParams(defaults)
	return &Room{
		ID:              id,
		World:           newWorld(),
		Players:         map[string]*Player{},
		Bots:            map[string]*AIAgent{},
		stopChan:        make(chan struct{}),
		stopped:         false,
		WorldWidth:      WorldW,
		WorldHeight:     WorldH,
		heatDefaults:    sanitized,
		missionWaves:    map[int]bool{},
		missionDirector: nil,
	}
}

type Hub struct {
	Rooms        map[string]*Room
	Mu           sync.Mutex
	heatDefaults HeatParams
}

func NewHub(defaultHeat HeatParams) *Hub {
	return &Hub{
		Rooms:        map[string]*Room{},
		heatDefaults: SanitizeHeatParams(defaultHeat),
	}
}

func (h *Hub) GetRoom(id string) *Room {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	r, ok := h.Rooms[id]
	if !ok {
		r = newRoom(id, h.heatDefaults)
		h.Rooms[id] = r
		r.Start()
	}
	return r
}

func (h *Hub) CleanupEmptyRooms() {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	for id, r := range h.Rooms {
		if r.IsEmpty() {
			r.Stop()
			delete(h.Rooms, id)
		}
	}
}

func (r *Room) SetWorldSize(w, h float64) {
	if w > 0 {
		r.WorldWidth = w
	}
	if h > 0 {
		r.WorldHeight = h
	}
	if r.missionDirector != nil {
		r.missionDirector.MarkLayoutDirty()
	}
}

func (r *Room) HeatParams() HeatParams {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	return r.heatDefaults
}

func (r *Room) HeatParamsLocked() HeatParams {
	return r.heatDefaults
}

func (r *Room) applyHeatParams(params HeatParams) {
	sanitized := SanitizeHeatParams(params)
	r.heatDefaults = sanitized
	r.World.ForEach([]ComponentKey{CompHeat}, func(id EntityID) {
		if heat := r.World.HeatData(id); heat != nil {
			heat.P = sanitized
			if heat.S.Value > sanitized.Max {
				heat.S.Value = sanitized.Max
			}
			if heat.S.Value < 0 {
				heat.S.Value = 0
			}
		}
	})
}

func (r *Room) SetHeatParams(params HeatParams) {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	r.applyHeatParams(params)
}

func (r *Room) MissionWaveSpawnedLocked(index int) bool {
	if index <= 0 {
		return false
	}
	if r.missionWaves == nil {
		return false
	}
	return r.missionWaves[index]
}

func (r *Room) SetMissionWaveSpawnedLocked(index int) bool {
	if index <= 0 {
		return false
	}
	if r.missionWaves == nil {
		r.missionWaves = map[int]bool{}
	}
	if r.missionWaves[index] {
		return false
	}
	r.missionWaves[index] = true
	return true
}

func (r *Room) SetHeatParamsLocked(params HeatParams) {
	r.applyHeatParams(params)
}

func (r *Room) EnsureBeaconDirectorLocked(missionID string) *BeaconDirector {
	if missionID == "" {
		missionID = "campaign-1"
	}
	if r.missionDirector != nil && r.missionDirector.MissionID() == missionID {
		return r.missionDirector
	}
	director, ok := NewBeaconDirector(r.ID, missionID, r.WorldWidth, r.WorldHeight)
	if !ok {
		return nil
	}
	r.missionDirector = director
	return director
}

func (r *Room) BeaconDirectorLocked() *BeaconDirector {
	return r.missionDirector
}

func (r *Room) MissionSnapshotForBroadcastLocked() (BeaconSnapshot, uint64) {
	snapshot := BeaconSnapshot{
		MissionID:  r.missionSnapshot.MissionID,
		LayoutSeed: r.missionSnapshot.LayoutSeed,
		ServerTime: r.missionSnapshot.ServerTime,
	}
	if len(r.missionSnapshot.Beacons) > 0 {
		snapshot.Beacons = make([]BeaconSnapshotBeacon, len(r.missionSnapshot.Beacons))
		copy(snapshot.Beacons, r.missionSnapshot.Beacons)
	}
	if len(r.missionSnapshot.Players) > 0 {
		snapshot.Players = make([]BeaconSnapshotPlayer, len(r.missionSnapshot.Players))
		copy(snapshot.Players, r.missionSnapshot.Players)
	}
	if len(r.missionSnapshot.Encounters) > 0 {
		snapshot.Encounters = make([]EncounterSummary, len(r.missionSnapshot.Encounters))
		copy(snapshot.Encounters, r.missionSnapshot.Encounters)
	}
	return snapshot, r.missionSnapshotVersion
}

func (r *Room) MissionFrameForBroadcastLocked() ([]BeaconDelta, []EncounterDelta, uint64) {
	var deltasCopy []BeaconDelta
	var encountersCopy []EncounterDelta
	if len(r.missionFrameDeltas) > 0 {
		deltasCopy = make([]BeaconDelta, len(r.missionFrameDeltas))
		copy(deltasCopy, r.missionFrameDeltas)
	}
	if len(r.missionFrameEncounters) > 0 {
		encountersCopy = make([]EncounterDelta, len(r.missionFrameEncounters))
		copy(encountersCopy, r.missionFrameEncounters)
	}
	return deltasCopy, encountersCopy, r.missionFrameVersion
}

func (r *Room) Tick() {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	r.Now += Dt

	if r.missionDirector != nil {
		r.missionDirector.Tick(r)

		snapshotDirty := r.missionDirector.SnapshotDirty()
		if r.missionSnapshotVersion == 0 || snapshotDirty {
			r.missionSnapshotVersion++
			r.missionSnapshot = r.missionDirector.Snapshot(r.Now, r.WorldWidth, r.WorldHeight)
			r.missionDirector.ClearSnapshotDirty()
		}

		deltas := r.missionDirector.PendingDeltas()
		encounters := r.missionDirector.PendingEncounterDeltas()
		if len(deltas) > 0 || len(encounters) > 0 {
			r.missionFrameVersion++
			if len(deltas) > 0 {
				r.missionFrameDeltas = make([]BeaconDelta, len(deltas))
				copy(r.missionFrameDeltas, deltas)
			} else {
				r.missionFrameDeltas = nil
			}
			if len(encounters) > 0 {
				r.missionFrameEncounters = make([]EncounterDelta, len(encounters))
				copy(r.missionFrameEncounters, encounters)
			} else {
				r.missionFrameEncounters = nil
			}
		}
	}

	r.updateAI()
	updateMissileGuidance(r, Dt)
	updateRouteFollowers(r, Dt)
	resolveMissileCollisions(r)
	updateMissileHeat(r, Dt)
	r.updateDagStates()

	// Run garbage collection every second to clean up old destroyed entities
	tickCount := int(r.Now * SimHz)
	if tickCount%int(SimHz) == 0 {
		r.cleanupDestroyedEntitiesLocked()
	}
}

// updateDagStates evaluates and updates DAG progression for all players.
func (r *Room) updateDagStates() {
	graph := dag.GetGraph()
	if graph == nil {
		return // DAG not initialized yet
	}

	for _, player := range r.Players {
		if player == nil {
			continue
		}
		effects := NewRoomDagEffects(r, player)
		r.EvaluatePlayerDagLocked(graph, player, effects)
	}
}

func (r *Room) EvaluatePlayerDagLocked(graph *dag.Graph, player *Player, effects dag.Effects) {
	if graph == nil || player == nil {
		return
	}
	player.EnsureDagState()
	player.EnsureStoryState()
	result := dag.Evaluator(graph, player.DagState, r.Now)
	for nodeID, newStatus := range result.StatusUpdates {
		player.DagState.SetStatus(nodeID, newStatus)
	}
	for _, nodeID := range result.DueCompletions {
		if err := dag.Complete(graph, player.DagState, nodeID, effects); err != nil {
			log.Printf("dag completion error for player %s node %s: %v", player.ID, nodeID, err)
		}
	}

	// Recompute and apply capabilities each tick (cheap; small node set)
	caps := dag.CalculateCapabilities(player.DagState)
	player.Capabilities = caps

	// Apply ship movement cap
	if player.Ship != 0 {
		if mov := r.World.Movement(player.Ship); mov != nil {
			base := ShipMaxSpeed
			if caps.ShipSpeedMultiplier <= 0 {
				caps.ShipSpeedMultiplier = 1.0
			}
			mov.MaxSpeed = base * caps.ShipSpeedMultiplier
		}
		// Apply ship heat capacity scaling relative to room defaults
		if heat := r.World.HeatData(player.Ship); heat != nil {
			base := r.heatDefaults
			scale := caps.ShipHeatCapacity
			if scale <= 0 {
				scale = 1.0
			}
			heat.P.Max = base.Max * scale
			heat.P.WarnAt = base.WarnAt * scale
			heat.P.OverheatAt = base.OverheatAt * scale
			// also scale marker speed so the neutral marker reflects increased capacity
			heat.P.MarkerSpeed = base.MarkerSpeed * scale
			// keep dynamics unchanged
		}
	}
}

func (r *Room) tryStartStoryNodeLocked(player *Player, nodeID dag.NodeID) {
	graph := dag.GetGraph()
	if graph == nil || player == nil || nodeID == "" {
		return
	}
	effects := NewRoomDagEffects(r, player)
	r.EvaluatePlayerDagLocked(graph, player, effects)

	status := player.DagState.GetStatus(nodeID)
	log.Printf("[story] Player %s attempting to start node %s (status: %s)", player.ID, nodeID, status)

	if status != dag.StatusAvailable {
		log.Printf("[story] Node %s not available for player %s (status: %s), skipping", nodeID, player.ID, status)
		return
	}

	if err := dag.Start(graph, player.DagState, nodeID, r.Now, effects); err != nil {
		log.Printf("[story] Start error for player %s node %s: %v", player.ID, nodeID, err)
		return
	}

	log.Printf("[story] Successfully started node %s for player %s", nodeID, player.ID)
	// Re-evaluate to unlock downstream nodes immediately.
	r.EvaluatePlayerDagLocked(graph, player, effects)
}

func (r *Room) HandleMissionStoryEventLocked(player *Player, event string, beaconIndex int) {
	nodeID := storyNodeForMissionEvent(event, beaconIndex)
	if nodeID == "" {
		return
	}

	r.tryStartStoryNodeLocked(player, nodeID)
}

func storyNodeForMissionEvent(event string, beaconIndex int) dag.NodeID {
	switch event {
	case "mission:start":
		return dag.NodeID("story.signal-static-1.start")
	case "mission:beacon-locked":
		switch beaconIndex {
		case 1:
			return dag.NodeID("story.signal-static-1.beacon-1-lock")
		case 2:
			return dag.NodeID("story.signal-static-1.beacon-2-lock")
		case 3:
			return dag.NodeID("story.signal-static-1.beacon-3-lock")
		case 4:
			// Allow optional beacon 4 message to map to completion as fallback.
			return dag.NodeID("story.signal-static-1.complete")
		}
	case "mission:completed":
		return dag.NodeID("story.signal-static-1.complete")
	}
	return ""
}

// HandleStoryChoiceBranching activates follow-up story nodes and effects based on player choice.
func (r *Room) HandleStoryChoiceBranching(p *Player, parentNodeID dag.NodeID, choiceID string, graph *dag.Graph) {
	if r == nil || p == nil || graph == nil || choiceID == "" {
		return
	}
	baseID := string(parentNodeID)
	childID := baseID + "-" + choiceID
	if strings.HasSuffix(baseID, "-lock") {
		childID = strings.TrimSuffix(baseID, "-lock") + "-" + choiceID
	}

	childNodeID := dag.NodeID(childID)
	childNode := graph.GetNode(childNodeID)
	if childNode == nil {
		log.Printf("[story] No child node found for choice %s on %s", choiceID, parentNodeID)
		return
	}

	log.Printf("[story] Player %s chose %s on %s -> activating %s", p.ID, choiceID, parentNodeID, childNodeID)
	r.tryStartStoryNodeLocked(p, childNodeID)
	status := p.DagState.GetStatus(childNodeID)
	if status == dag.StatusLocked {
		log.Printf("[story] Child node %s remained locked after choice %s", childNodeID, choiceID)
		return
	}
	r.handleStoryNodeEffects(p, childNode)
}

// handleStoryNodeEffects processes special payload directives for story outcomes.
func (r *Room) handleStoryNodeEffects(p *Player, node *dag.Node) {
	if r == nil || p == nil || node == nil {
		return
	}

	if upgradeID := node.Payload["grant_upgrade"]; upgradeID != "" {
		r.grantUpgradeToPlayer(p, dag.NodeID(upgradeID))
	}

	if spawn := strings.ToLower(strings.TrimSpace(node.Payload["spawn_encounter"])); spawn == "true" {
		waveIndex := 0
		if waveStr := node.Payload["encounter_wave"]; waveStr != "" {
			if parsed, err := strconv.Atoi(waveStr); err == nil {
				waveIndex = parsed
			} else {
				log.Printf("[story] Invalid encounter_wave %q on node %s", waveStr, node.ID)
			}
		}

		if waveIndex > 0 {
			beaconOrdinal := 0
			if ordStr := node.Payload["encounter_beacon"]; ordStr != "" {
				if parsed, err := strconv.Atoi(ordStr); err == nil {
					beaconOrdinal = parsed
				} else {
					log.Printf("[story] Invalid encounter_beacon %q on node %s", ordStr, node.ID)
				}
			}

			director := r.EnsureBeaconDirectorLocked("campaign-1")
			if director == nil {
				log.Printf("[story] Cannot spawn encounter for node %s: no beacon director", node.ID)
				return
			}

			beaconID := ""
			if beaconOrdinal > 0 && beaconOrdinal <= len(director.beacons) {
				beaconID = director.beacons[beaconOrdinal-1].ID
			}
			director.launchEncounter(r, beaconID, waveIndex)
		}
	}
}

// grantUpgradeToPlayer force-completes an upgrade node as an immediate reward.
func (r *Room) grantUpgradeToPlayer(p *Player, upgradeNodeID dag.NodeID) {
	if r == nil || p == nil || upgradeNodeID == "" {
		return
	}

	p.EnsureDagState()
	graph := dag.GetGraph()
	if graph == nil {
		log.Printf("[story] Cannot grant upgrade %s: DAG not initialized", upgradeNodeID)
		return
	}

	node := graph.GetNode(upgradeNodeID)
	if node == nil {
		log.Printf("[story] Cannot grant upgrade %s: node not found", upgradeNodeID)
		return
	}
	if node.Kind != dag.NodeKindUpgrade {
		log.Printf("[story] Node %s is not an upgrade, skipping reward", upgradeNodeID)
		return
	}

	effects := NewRoomDagEffects(r, p)
	r.EvaluatePlayerDagLocked(graph, p, effects)

	status := p.DagState.GetStatus(upgradeNodeID)
	if status == dag.StatusCompleted {
		return
	}
	if status == dag.StatusLocked {
		p.DagState.SetStatus(upgradeNodeID, dag.StatusAvailable)
	}

	if err := dag.Start(graph, p.DagState, upgradeNodeID, r.Now, effects); err != nil {
		log.Printf("[story] Failed to start upgrade %s for player %s: %v", upgradeNodeID, p.ID, err)
		return
	}
	if err := dag.Complete(graph, p.DagState, upgradeNodeID, effects); err != nil {
		log.Printf("[story] Failed to complete upgrade %s for player %s: %v", upgradeNodeID, p.ID, err)
		return
	}

	// Recompute capabilities after completing the upgrade.
	r.EvaluatePlayerDagLocked(graph, p, effects)

	log.Printf("[story] Granted upgrade %s to player %s", upgradeNodeID, p.ID)
}

// BroadcastMissionOffer queues a mission offer payload for the player.
func (r *Room) BroadcastMissionOffer(p *Player, template *MissionTemplate) {
	if r == nil || p == nil || template == nil {
		return
	}
	offer := MissionOffer{
		MissionID:   template.ID,
		TemplateID:  template.ID,
		DisplayName: template.DisplayName,
		Archetype:   archetypeToString(template.Archetype),
		Objectives:  generateObjectiveDescriptions(template),
		StoryNodeID: template.StoryNodeID,
		Timeout:     template.FailureTimeout,
	}
	p.SendMessage("mission:offer", offer)
}

// BroadcastObjectiveProgress queues mission update payloads for incremental progress.
func (r *Room) BroadcastObjectiveProgress(p *Player, objectiveID string, progress float64) {
	if r == nil || p == nil || r.missionDirector == nil {
		return
	}
	update := MissionUpdate{
		MissionID:  r.missionDirector.CurrentMissionID,
		Status:     "active",
		Objectives: r.buildObjectiveStates(p),
		ServerTime: r.Now,
	}
	p.SendMessage("mission:update", update)
}

// BroadcastObjectiveComplete handles objective completion and potential mission completion.
func (r *Room) BroadcastObjectiveComplete(p *Player, objectiveID string) {
	if r == nil || p == nil || r.missionDirector == nil {
		return
	}

	status := "active"
	if len(r.missionDirector.ActiveObjectives) == 0 {
		status = "completed"
		r.HandleMissionStoryEventLocked(p, "mission:completed", 0)
	}

	update := MissionUpdate{
		MissionID:  r.missionDirector.CurrentMissionID,
		Status:     status,
		Objectives: r.buildObjectiveStates(p),
		ServerTime: r.Now,
	}
	p.SendMessage("mission:update", update)
}

func (r *Room) buildObjectiveStates(p *Player) []ObjectiveState {
	if r == nil || r.missionDirector == nil {
		return nil
	}
	ids := make([]string, 0, len(r.missionDirector.ActiveObjectives))
	for id := range r.missionDirector.ActiveObjectives {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	states := make([]ObjectiveState, 0, len(ids))
	for _, id := range ids {
		evaluator := r.missionDirector.ActiveObjectives[id]
		if evaluator == nil {
			continue
		}
		complete, progress := evaluator.Evaluate(r, p)
		states = append(states, ObjectiveState{
			ID:          id,
			Type:        getEvaluatorType(evaluator),
			Progress:    Clamp(progress, 0, 1),
			Complete:    complete,
			Description: generateObjectiveDescription(evaluator),
		})
	}
	return states
}

func archetypeToString(arch MissionArchetype) string {
	switch arch {
	case ArchetypeTravel:
		return "travel"
	case ArchetypeEscort:
		return "escort"
	case ArchetypeKill:
		return "kill"
	case ArchetypeHazard:
		return "hazard"
	default:
		return "unknown"
	}
}

func generateObjectiveDescriptions(template *MissionTemplate) []string {
	if template == nil {
		return nil
	}
	switch template.Archetype {
	case ArchetypeTravel:
		count, _ := floatFromParam(template.ObjectiveParams["beaconCount"])
		hold, _ := floatFromParam(template.ObjectiveParams["holdTime"])
		if count > 0 && hold > 0 {
			return []string{fmt.Sprintf("Secure %.0f beacons (hold %.0fs each)", count, hold)}
		}
		if count > 0 {
			return []string{fmt.Sprintf("Secure %.0f beacons", count)}
		}
		return []string{"Secure mission beacons"}
	case ArchetypeEscort:
		return []string{"Escort the target safely to the destination"}
	case ArchetypeKill:
		count, _ := floatFromParam(template.ObjectiveParams["requiredKills"])
		tag := ""
		if v, ok := template.ObjectiveParams["targetTag"]; ok {
			if s, ok := v.(string); ok {
				tag = s
			}
		}
		if count > 0 && tag != "" {
			return []string{fmt.Sprintf("Destroy %.0f %s targets", count, tag)}
		}
		if count > 0 {
			return []string{fmt.Sprintf("Destroy %.0f hostiles", count)}
		}
		return []string{"Eliminate hostiles"}
	case ArchetypeHazard:
		return []string{"Clear hazardous mines in the area"}
	default:
		return []string{"Complete mission objectives"}
	}
}

func getEvaluatorType(eval ObjectiveEvaluator) string {
	switch eval.(type) {
	case *DistanceEvaluator:
		return "distance"
	case *KillCountEvaluator:
		return "kill"
	case *TimerEvaluator:
		return "timer"
	case *HazardClearEvaluator:
		return "hazard"
	default:
		return "unknown"
	}
}

func floatFromParam(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func generateObjectiveDescription(eval ObjectiveEvaluator) string {
	switch e := eval.(type) {
	case *DistanceEvaluator:
		if e == nil {
			return "Reach the waypoint"
		}
		threshold := e.Threshold
		if threshold <= 0 {
			return "Reach the waypoint"
		}
		return fmt.Sprintf("Reach the waypoint within %.0f units", threshold)
	case *KillCountEvaluator:
		if e == nil {
			return "Eliminate hostiles"
		}
		if e.RequiredKills <= 0 {
			return "Eliminate hostiles"
		}
		if e.TargetTag != "" {
			return fmt.Sprintf("Destroy %d %s targets", e.RequiredKills, e.TargetTag)
		}
		return fmt.Sprintf("Destroy %d hostiles", e.RequiredKills)
	case *TimerEvaluator:
		if e == nil || e.RequiredTime <= 0 {
			return "Survive the encounter"
		}
		return fmt.Sprintf("Survive for %.0f seconds", e.RequiredTime)
	case *HazardClearEvaluator:
		if e == nil {
			return "Clear hazardous area"
		}
		if e.Radius > 0 {
			return fmt.Sprintf("Clear hazards within %.0f units", e.Radius)
		}
		return "Clear hazardous area"
	default:
		return "Complete mission objective"
	}
}

func (r *Room) cleanupDestroyedEntitiesLocked() {
	world := r.World
	var toRemove []EntityID

	// Find all entities that were destroyed more than HistoryKeepS ago
	world.ForEach([]ComponentKey{CompDestroyed}, func(id EntityID) {
		destroyed := world.DestroyedData(id)
		if destroyed != nil && r.Now-destroyed.DestroyedAt > HistoryKeepS {
			toRemove = append(toRemove, id)
		}
	})

	// Actually remove the entities
	for _, id := range toRemove {
		world.RemoveEntity(id)
	}
}

func (r *Room) Start() {
	go func() {
		ticker := time.NewTicker(time.Duration(1000.0/SimHz) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-r.stopChan:
				return
			case <-ticker.C:
				r.Tick()
			}
		}
	}()
}

func (r *Room) Stop() {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if !r.stopped {
		r.stopped = true
		close(r.stopChan)
	}
}

func (r *Room) IsEmpty() bool {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	return len(r.Players) == 0
}

func (r *Room) humanPlayerCountUnlocked() int {
	count := 0
	for _, p := range r.Players {
		if p != nil && !p.IsBot {
			count++
		}
	}
	return count
}

func (r *Room) removePlayerEntitiesUnlocked(playerID string) {
	var toRemove []EntityID
	r.World.ForEach([]ComponentKey{CompOwner}, func(e EntityID) {
		owner := r.World.Owner(e)
		if owner != nil && owner.PlayerID == playerID {
			toRemove = append(toRemove, e)
		}
	})
	for _, e := range toRemove {
		r.World.RemoveEntity(e)
	}
}

func (r *Room) addBotUnlocked(name string, behavior AIBehavior, startPos Vec2) *Player {
	id := RandId("bot")
	for {
		if _, exists := r.Players[id]; !exists {
			break
		}
		id = RandId("bot")
	}
	player := &Player{
		ID:            id,
		Name:          name,
		MissileConfig: SanitizeMissileConfig(MissileConfig{Speed: ShipMaxSpeed * 0.7, AgroRadius: 900}),
		IsBot:         true,
	}
	player.EnsureMissileRoutes()
	player.EnsureDagState()
	player.EnsureInventory()
	// Seed bots with basic missiles (10x)
	player.Inventory.AddItem("missile", "basic", 80, 10)
	shipID := r.SpawnShip(id, startPos)
	player.Ship = shipID
	r.Players[id] = player
	r.Bots[id] = NewAIAgent(id, behavior)
	return player
}

func (r *Room) removeBotUnlocked(id string) {
	delete(r.Bots, id)
	if _, ok := r.Players[id]; ok {
		r.removePlayerEntitiesUnlocked(id)
		delete(r.Players, id)
	}
}

func (r *Room) removeAllBotsUnlocked() {
	for id := range r.Bots {
		r.removeBotUnlocked(id)
	}
}

func (r *Room) HumanPlayerCountLocked() int {
	return r.humanPlayerCountUnlocked()
}

func (r *Room) AddBotLocked(name string, behavior AIBehavior, startPos Vec2) *Player {
	return r.addBotUnlocked(name, behavior, startPos)
}

func (r *Room) RemoveAllBotsLocked() {
	r.removeAllBotsUnlocked()
}

func (r *Room) RemovePlayerEntitiesLocked(playerID string) {
	r.removePlayerEntitiesUnlocked(playerID)
}

func (r *Room) SpawnShip(owner string, startPos Vec2) EntityID {
	id := r.World.NewEntity()
	r.World.SetComponent(id, CompTransform, &Transform{Pos: startPos})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: ShipMaxSpeed})
	r.World.SetComponent(id, CompShip, &ShipComponent{HP: ShipMaxHP})
	r.World.SetComponent(id, CompRoute, &RouteComponent{})
	r.World.SetComponent(id, CompRouteFollower, &RouteFollower{})
	r.World.SetComponent(id, CompOwner, &OwnerComponent{PlayerID: owner, Neutral: false})
	history := newHistory(HistoryKeepS, SimHz)
	history.push(Snapshot{T: r.Now, Pos: startPos})
	r.World.SetComponent(id, CompHistory, &HistoryComponent{History: history})
	params := r.heatDefaults
	// Initialize heat component with room default parameters
	r.World.SetComponent(id, CompHeat, &HeatComponent{
		P: params,
		S: HeatState{
			Value:      0,
			StallUntil: 0,
		},
	})
	return id
}

func (r *Room) LaunchMissile(owner string, shipID EntityID, cfg MissileConfig, waypoints []RouteWaypoint, startPos Vec2, startVel Vec2) EntityID {
	if len(waypoints) == 0 {
		return 0
	}
	id := r.World.NewEntity()
	// Missiles spawn at ship position with zero velocity
	r.World.SetComponent(id, CompTransform, &Transform{Pos: startPos, Vel: Vec2{}})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: cfg.Speed})
	missile := &MissileComponent{
		AgroRadius: cfg.AgroRadius,
		LaunchTime: r.Now,
		Lifetime:   cfg.Lifetime,
	}
	r.World.SetComponent(id, CompMissile, missile)
	copied := make([]RouteWaypoint, len(waypoints))
	for i, wp := range waypoints {
		copied[i] = wp
		if copied[i].Speed <= 0 {
			copied[i].Speed = cfg.Speed
		}
	}
	r.World.SetComponent(id, CompRoute, &RouteComponent{Waypoints: copied})
	r.World.SetComponent(id, CompRouteFollower, &RouteFollower{})
	normalizedOwner := strings.TrimSpace(owner)
	neutralOwner := normalizedOwner == "" || strings.EqualFold(normalizedOwner, "mission")
	if neutralOwner && strings.EqualFold(normalizedOwner, "mission") {
		normalizedOwner = "mission"
	}
	r.World.SetComponent(id, CompOwner, &OwnerComponent{PlayerID: normalizedOwner, Neutral: neutralOwner})

	// Add heat component with missile-specific parameters
	r.World.SetComponent(id, CompHeat, &HeatComponent{
		P: cfg.HeatParams,
		S: HeatState{
			Value:      0.0, // Missiles start at zero heat
			StallUntil: 0.0, // Not used for missiles (they explode instead)
		},
	})

	// Copy ship's history so missile appears at same perceived position as ship
	// This ensures all observers see missile spawn from where they perceive the ship
	var history *History
	if shipHist := r.World.HistoryComponent(shipID); shipHist != nil && shipHist.History != nil {
		history = shipHist.History.clone()
	} else {
		history = newHistory(HistoryKeepS, SimHz)
	}
	// Add current spawn snapshot
	history.push(Snapshot{T: r.Now, Pos: startPos, Vel: Vec2{}})
	r.World.SetComponent(id, CompHistory, &HistoryComponent{History: history})
	return id
}

func (r *Room) handleShipDestruction(shipID EntityID, attackerID string) {
	// Find which player owns this ship
	owner := r.World.Owner(shipID)
	if owner == nil {
		return
	}

	player := r.Players[owner.PlayerID]
	if player == nil {
		return
	}

	// Increment kill count for attacker if they destroyed a bot
	if attackerID != "" && player.IsBot {
		if attacker := r.Players[attackerID]; attacker != nil && !attacker.IsBot {
			attacker.Kills++
		}
	}

	if player.IsBot {
		// Ignore repeat destruction events once the ship is already marked destroyed.
		if r.World.DestroyedData(shipID) != nil {
			return
		}

		// Mark the old ship as destroyed so its history persists for observers.
		r.World.SetComponent(shipID, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})

		// Ensure we have an AI agent registered for this bot and reset its planning timer.
		agent := r.Bots[owner.PlayerID]
		if agent == nil {
			agent = NewAIAgent(owner.PlayerID, NewDefensiveBehavior())
			r.Bots[owner.PlayerID] = agent
		} else {
			agent.Behavior = NewDefensiveBehavior()
		}
		agent.nextPlanAt = 0

		// Spawn a replacement ship for the same bot player at a new random location.
		randX := r.WorldWidth * (0.2 + 0.6*rand.Float64())
		randY := r.WorldHeight * (0.2 + 0.6*rand.Float64())
		newShip := r.SpawnShip(owner.PlayerID, Vec2{X: randX, Y: randY})

		player.Ship = newShip
		player.MissileReadyAt = 0
		player.EnsureMissileRoutes()
		return
	} else {
		// Player: respawn at center
		r.reSpawnShip(shipID)
	}
}

func (r *Room) reSpawnShip(id EntityID) {
	respawnPos := Vec2{X: r.WorldWidth * 0.5, Y: r.WorldHeight * 0.5}

	if tr := r.World.Transform(id); tr != nil {
		tr.Pos = respawnPos
		tr.Vel = Vec2{}
	}
	if route := r.World.Route(id); route != nil {
		route.Waypoints = nil
	}
	if follower := r.World.RouteFollower(id); follower != nil {
		follower.Index = 0
		follower.Hold = false
		follower.hasOverride = false
	}
	if ship := r.World.ShipData(id); ship != nil {
		ship.HP = ShipMaxHP
	}
	// Reset heat on respawn
	if heat := r.World.HeatData(id); heat != nil {
		heat.P = r.heatDefaults
		heat.S.Value = 0
		heat.S.StallUntil = 0
	}
	// Clear old history and start fresh from respawn position
	// This prevents missiles from tracking/colliding with old positions
	if hist := r.World.HistoryComponent(id); hist != nil {
		hist.History = newHistory(HistoryKeepS, SimHz)
		hist.History.push(Snapshot{T: r.Now, Pos: respawnPos})
	}
}

func RandId(prefix string) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return prefix + "-" + string(b)
}

func (p *Player) missileRouteIndex(id string) int {
	for i, route := range p.MissileRoutes {
		if route.ID == id {
			return i
		}
	}
	return -1
}

func (p *Player) MissileRouteByID(id string) *MissileRouteDef {
	if id == "" {
		return nil
	}
	if idx := p.missileRouteIndex(id); idx >= 0 {
		return p.MissileRoutes[idx]
	}
	return nil
}

func (p *Player) ActiveMissileRoute() *MissileRouteDef {
	if route := p.MissileRouteByID(p.ActiveMissileRouteID); route != nil {
		return route
	}
	if len(p.MissileRoutes) > 0 {
		return p.MissileRoutes[0]
	}
	return nil
}

func (p *Player) EnsureMissileRoutes() {
	if len(p.MissileRoutes) == 0 {
		route := &MissileRouteDef{ID: RandId("mr"), Name: "Route 1"}
		p.MissileRoutes = []*MissileRouteDef{route}
		p.ActiveMissileRouteID = route.ID
	}
	if p.ActiveMissileRouteID == "" || p.MissileRouteByID(p.ActiveMissileRouteID) == nil {
		p.ActiveMissileRouteID = p.MissileRoutes[0].ID
	}
}

// EnsureDagState initializes the DAG state if not already present.
func (p *Player) EnsureDagState() {
	if p.DagState == nil {
		p.DagState = dag.NewState()
	}
}

// EnsureStoryState initializes the story-related fields if not already present.
func (p *Player) EnsureStoryState() {
	if p.StoryFlags == nil {
		p.StoryFlags = make(map[string]bool)
	}
	if p.PendingStoryEvents == nil {
		p.PendingStoryEvents = make([]StoryEvent, 0, 4)
	}
}

func (p *Player) enqueueStoryEvent(event StoryEvent) {
	p.PendingStoryEvents = append(p.PendingStoryEvents, event)
}

func (p *Player) ConsumeStoryEvents() []StoryEvent {
	if len(p.PendingStoryEvents) == 0 {
		return nil
	}
	events := make([]StoryEvent, len(p.PendingStoryEvents))
	copy(events, p.PendingStoryEvents)
	// Reset in place to avoid releasing underlying array immediately.
	for i := range p.PendingStoryEvents {
		p.PendingStoryEvents[i] = StoryEvent{}
	}
	p.PendingStoryEvents = p.PendingStoryEvents[:0]
	return events
}

// EnsureInventory initializes the inventory if not already present.
func (p *Player) EnsureInventory() {
	if p.Inventory == nil {
		p.Inventory = NewInventory()
	}
}

func (p *Player) generateRouteName() string {
	p.EnsureMissileRoutes()
	n := len(p.MissileRoutes) + 1
	for {
		candidate := fmt.Sprintf("Route %d", n)
		exists := false
		for _, route := range p.MissileRoutes {
			if strings.EqualFold(route.Name, candidate) {
				exists = true
				break
			}
		}
		if !exists {
			return candidate
		}
		n++
	}
}

func (p *Player) AddMissileRoute(name string) *MissileRouteDef {
	p.EnsureMissileRoutes()
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = p.generateRouteName()
	}
	route := &MissileRouteDef{ID: RandId("mr"), Name: trimmed}
	p.MissileRoutes = append(p.MissileRoutes, route)
	p.ActiveMissileRouteID = route.ID
	return route
}

func (p *Player) RenameMissileRoute(id, name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return false
	}
	if route := p.MissileRouteByID(id); route != nil {
		route.Name = trimmed
		return true
	}
	return false
}

func (p *Player) DeleteMissileRoute(id string) bool {
	p.EnsureMissileRoutes()
	idx := p.missileRouteIndex(id)
	if idx == -1 {
		return false
	}
	if len(p.MissileRoutes) <= 1 {
		p.MissileRoutes[idx].Waypoints = nil
		return true
	}
	p.MissileRoutes = append(p.MissileRoutes[:idx], p.MissileRoutes[idx+1:]...)
	if p.ActiveMissileRouteID == id {
		p.ActiveMissileRouteID = p.MissileRoutes[0].ID
	}
	return true
}

func (p *Player) ClearMissileRoute(id string) bool {
	if route := p.MissileRouteByID(id); route != nil {
		route.Waypoints = nil
		return true
	}
	return false
}

func (p *Player) SetActiveMissileRoute(id string) bool {
	if route := p.MissileRouteByID(id); route != nil {
		p.ActiveMissileRouteID = route.ID
		return true
	}
	return false
}

func (p *Player) AddWaypointToRoute(id string, wp RouteWaypoint) bool {
	if route := p.MissileRouteByID(id); route != nil {
		if wp.Speed <= 0 {
			max := MissileMaxSpeed * p.Capabilities.MissileSpeedMultiplier
			wp.Speed = Clamp(p.MissileConfig.Speed, MissileMinSpeed, max)
		}
		route.Waypoints = append(route.Waypoints, wp)
		return true
	}
	return false
}

func (p *Player) UpdateWaypointSpeedInRoute(id string, index int, speed float64) bool {
	if route := p.MissileRouteByID(id); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			max := MissileMaxSpeed * p.Capabilities.MissileSpeedMultiplier
			route.Waypoints[index].Speed = Clamp(speed, MissileMinSpeed, max)
			return true
		}
	}
	return false
}

func (p *Player) MoveWaypointInRoute(id string, index int, pos Vec2) bool {
	if route := p.MissileRouteByID(id); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Pos = pos
			return true
		}
	}
	return false
}

func (p *Player) DeleteWaypointFromRoute(id string, index int) bool {
	if route := p.MissileRouteByID(id); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints = append(route.Waypoints[:index], route.Waypoints[index+1:]...)
			return true
		}
	}
	return false
}

type StoryEvent struct {
	Chapter   string
	Node      string
	Timestamp float64
}
