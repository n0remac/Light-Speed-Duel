package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"LightSpeedDuel/internal/dag"
	"LightSpeedDuel/internal/game"
	. "LightSpeedDuel/internal/game"
	pb "LightSpeedDuel/internal/proto/ws"

	"github.com/gorilla/websocket"
	"google.golang.org/protobuf/proto"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type inboundMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// sendProtoMessage wraps a protobuf message in an envelope and sends it as a binary WebSocket frame
func sendProtoMessage(conn *websocket.Conn, payload proto.Message) error {
	var envelope pb.WsEnvelope

	switch msg := payload.(type) {
	case *pb.StateUpdate:
		envelope.Payload = &pb.WsEnvelope_StateUpdate{StateUpdate: msg}
	case *pb.RoomFullError:
		envelope.Payload = &pb.WsEnvelope_RoomFull{RoomFull: msg}
	case *pb.DagListResponse:
		envelope.Payload = &pb.WsEnvelope_DagListResponse{DagListResponse: msg}
	case *pb.MissionBeaconSnapshot:
		envelope.Payload = &pb.WsEnvelope_MissionBeaconSnapshot{MissionBeaconSnapshot: msg}
	case *pb.MissionBeaconDelta:
		envelope.Payload = &pb.WsEnvelope_MissionBeaconDelta{MissionBeaconDelta: msg}
	default:
		return fmt.Errorf("unknown message type: %T", payload)
	}

	// Marshal to bytes
	data, err := proto.Marshal(&envelope)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	// Send as binary frame
	return conn.WriteMessage(websocket.BinaryMessage, data)
}

func parseFloatOverride(values url.Values, key string) (*float64, bool) {
	raw := values.Get(key)
	if raw == "" {
		return nil, false
	}
	val, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return nil, false
	}
	return &val, true
}

func parseHeatOverrides(values url.Values) (HeatParamOverrides, bool) {
	var overrides HeatParamOverrides
	var found bool

	if v, ok := parseFloatOverride(values, "heatMax"); ok {
		overrides.Max = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatWarn"); ok {
		overrides.WarnAt = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatOverheat"); ok {
		overrides.OverheatAt = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatStall"); ok {
		overrides.StallSeconds = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatMarker"); ok {
		overrides.MarkerSpeed = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatExp"); ok {
		overrides.Exp = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatKUp"); ok {
		overrides.KUp = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatKDown"); ok {
		overrides.KDown = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatSpikeChance"); ok {
		overrides.MissileSpikeChance = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatSpikeMin"); ok {
		overrides.MissileSpikeMin = v
		found = true
	}
	if v, ok := parseFloatOverride(values, "heatSpikeMax"); ok {
		overrides.MissileSpikeMax = v
		found = true
	}
	return overrides, found
}

type stateMsg struct {
	Type               string            `json:"type"`
	Now                float64           `json:"now"`
	Me                 ghost             `json:"me"`
	Ghosts             []ghost           `json:"ghosts"`
	Meta               roomMeta          `json:"meta"`
	Missiles           []missileDTO      `json:"missiles"`
	MissileConfig      missileConfigDTO  `json:"missile_config"`
	MissileWaypoints   []waypointDTO     `json:"missile_waypoints"`
	MissileRoutes      []missileRouteDTO `json:"missile_routes"`
	ActiveMissileRoute string            `json:"active_missile_route"`
	NextMissileReady   float64           `json:"next_missile_ready"`
	Dag                *dagStateDTO      `json:"dag,omitempty"`       // DAG progression state
	Inventory          *inventoryDTO     `json:"inventory,omitempty"` // Player's crafted items
	Story              *storyStateDTO    `json:"story,omitempty"`
}

type roomMeta struct {
	C float64 `json:"c"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type ghost struct {
	ID                   string           `json:"id"`
	X                    float64          `json:"x"`
	Y                    float64          `json:"y"`
	VX                   float64          `json:"vx"`
	VY                   float64          `json:"vy"`
	T                    float64          `json:"t"`
	Self                 bool             `json:"self"`
	Waypoints            []waypointDTO    `json:"waypoints,omitempty"`
	CurrentWaypointIndex int              `json:"current_waypoint_index,omitempty"`
	HP                   int              `json:"hp"`
	Kills                int              `json:"kills"`
	Heat                 *shipHeatViewDTO `json:"heat,omitempty"`
}

type storyStateDTO struct {
	ActiveNode string            `json:"active_node,omitempty"`
	Dialogue   *storyDialogueDTO `json:"dialogue,omitempty"` // Full dialogue content
	Available  []string          `json:"available,omitempty"`
	Flags      map[string]bool   `json:"flags,omitempty"`
	Events     []storyEventDTO   `json:"recent_events,omitempty"`
}

type storyEventDTO struct {
	ChapterID string  `json:"chapter"`
	NodeID    string  `json:"node"`
	Timestamp float64 `json:"timestamp"`
}

type liveConn struct {
	conn     *websocket.Conn
	sendTick *time.Ticker
}

func serveWS(h *Hub, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	roomID := query.Get("room")
	if roomID == "" {
		roomID = "default"
	}

	mode := strings.ToLower(query.Get("mode"))
	missionKey := ""

	mapW := WorldW
	mapH := WorldH
	if mode == "campaign" {
		mapW = 32000
		mapH = 18000
		missionKey = normalizeMissionID(query.Get("mission"))
		if missionKey == "" {
			missionKey = normalizeMissionID("1")
		}
	} else {
		if mapWStr := query.Get("mapW"); mapWStr != "" {
			if parsed, err := fmt.Sscanf(mapWStr, "%f", &mapW); err == nil && parsed == 1 && mapW > 0 {
				// Successfully parsed mapW
			} else {
				mapW = WorldW
			}
		}
		if mapHStr := query.Get("mapH"); mapHStr != "" {
			if parsed, err := fmt.Sscanf(mapHStr, "%f", &mapH); err == nil && parsed == 1 && mapH > 0 {
				// Successfully parsed mapH
			} else {
				mapH = WorldH
			}
		}
	}

	heatOverrides, hasHeatOverrides := parseHeatOverrides(query)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade:", err)
		return
	}
	lc := &liveConn{
		conn:     conn,
		sendTick: time.NewTicker(time.Duration(1000.0/UpdateRateHz) * time.Millisecond),
	}

	room := h.GetRoom(roomID)
	var director *BeaconDirector
	playerID := RandId("p")
	player := &Player{
		ID:                playerID,
		Name:              "Anon",
		StoryFlags:        make(map[string]bool),
		ActiveStoryNodeID: "",
	}

	room.Mu.Lock()
	if room.HumanPlayerCountLocked() >= RoomMaxPlayers {
		room.Mu.Unlock()
		_ = sendProtoMessage(conn, &pb.RoomFullError{Message: "room full"})
		conn.Close()
		return
	}

	// Set world size if this is the first player (room is empty)
	if room.HumanPlayerCountLocked() == 0 && len(room.Players) == 0 {
		room.SetWorldSize(mapW, mapH)
		if hasHeatOverrides {
			base := room.HeatParamsLocked()
			newParams := applyHeatOverrides(base, heatOverrides)
			room.SetHeatParamsLocked(newParams)
			log.Printf("room %s heat overrides: marker %.1f warn %.1f overheat %.1f", room.ID, newParams.MarkerSpeed, newParams.WarnAt, newParams.OverheatAt)
		}
	}
	if mode == "campaign" {
		director = room.EnsureBeaconDirectorLocked(missionKey)
	}

	defaultMissileSpeed := ShipMaxSpeed * 0.75
	player.MissileConfig = SanitizeMissileConfig(MissileConfig{
		Speed:      defaultMissileSpeed,
		AgroRadius: 800,
	})
	player.EnsureMissileRoutes()
	player.EnsureDagState()
	player.EnsureInventory()
	player.EnsureStoryState()

	existingHumans := room.HumanPlayerCountLocked()
	startPos := Vec2{
		X: (room.WorldWidth * 0.25) + float64(existingHumans)*200.0,
		Y: (room.WorldHeight * 0.5) + float64(existingHumans)*-200.0,
	}
	if mode == "campaign" {
		startPos = Vec2{
			X: Clamp(room.WorldWidth*0.08, 0, room.WorldWidth),
			Y: Clamp(room.WorldHeight*0.50, 0, room.WorldHeight),
		}
	}

	shipEntity := room.SpawnShip(playerID, startPos)
	player.Ship = shipEntity
	room.Players[playerID] = player
	if mode == "campaign" {
		room.HandleMissionStoryEventLocked(player, "mission:start", 0)
		if graph := dag.GetGraph(); graph != nil {
			effects := game.NewRoomDagEffects(room, player)
			room.EvaluatePlayerDagLocked(graph, player, effects) // Make method public or add helper
		}
		if director != nil {
			if template := director.MissionTemplate(); template != nil {
				room.BroadcastMissionOffer(player, template)
			}
		}
	}
	room.Mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		defer cancel()
		for {
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}

			// Try protobuf first (binary messages)
			if msgType == websocket.BinaryMessage {
				var envelope pb.WsEnvelope
				if err := proto.Unmarshal(data, &envelope); err != nil {
					log.Printf("protobuf unmarshal error: %v", err)
					continue
				}

				// Dispatch based on payload type
				switch payload := envelope.Payload.(type) {
				case *pb.WsEnvelope_Join:
					handleJoin(room, playerID, payload.Join)
				case *pb.WsEnvelope_SpawnBot:
					handleSpawnBot(room, playerID)
				case *pb.WsEnvelope_AddWaypoint:
					handleAddWaypoint(room, playerID, payload.AddWaypoint)
				case *pb.WsEnvelope_UpdateWaypoint:
					handleUpdateWaypoint(room, playerID, payload.UpdateWaypoint)
				case *pb.WsEnvelope_MoveWaypoint:
					handleMoveWaypoint(room, playerID, payload.MoveWaypoint)
				case *pb.WsEnvelope_DeleteWaypoint:
					handleDeleteWaypoint(room, playerID, payload.DeleteWaypoint)
				case *pb.WsEnvelope_ClearWaypoints:
					handleClearWaypoints(room, playerID)
				case *pb.WsEnvelope_ConfigureMissile:
					handleConfigureMissile(room, playerID, payload.ConfigureMissile)
				case *pb.WsEnvelope_AddMissileWaypoint:
					handleAddMissileWaypoint(room, playerID, payload.AddMissileWaypoint)
				case *pb.WsEnvelope_UpdateMissileWaypointSpeed:
					handleUpdateMissileWaypointSpeed(room, playerID, payload.UpdateMissileWaypointSpeed)
				case *pb.WsEnvelope_MoveMissileWaypoint:
					handleMoveMissileWaypoint(room, playerID, payload.MoveMissileWaypoint)
				case *pb.WsEnvelope_DeleteMissileWaypoint:
					handleDeleteMissileWaypoint(room, playerID, payload.DeleteMissileWaypoint)
				case *pb.WsEnvelope_ClearMissileRoute:
					handleClearMissileRoute(room, playerID, payload.ClearMissileRoute)
				case *pb.WsEnvelope_AddMissileRoute:
					handleAddMissileRoute(room, playerID, payload.AddMissileRoute)
				case *pb.WsEnvelope_RenameMissileRoute:
					handleRenameMissileRoute(room, playerID, payload.RenameMissileRoute)
				case *pb.WsEnvelope_DeleteMissileRoute:
					handleDeleteMissileRoute(room, playerID, payload.DeleteMissileRoute)
				case *pb.WsEnvelope_SetActiveMissileRoute:
					handleSetActiveMissileRoute(room, playerID, payload.SetActiveMissileRoute)
				case *pb.WsEnvelope_LaunchMissile:
					handleLaunchMissile(room, playerID, payload.LaunchMissile)

				// Phase 2: DAG commands
				case *pb.WsEnvelope_DagStart:
					handleDagStart(room, playerID, payload.DagStart)
				case *pb.WsEnvelope_DagCancel:
					handleDagCancel(room, playerID, payload.DagCancel)
				case *pb.WsEnvelope_DagStoryAck:
					handleDagStoryAck(room, playerID, payload.DagStoryAck)
				case *pb.WsEnvelope_DagList:
					handleDagList(room, playerID, conn)

				// Phase 2: Mission commands
				case *pb.WsEnvelope_MissionSpawnWave:
					handleMissionSpawnWave(room, playerID, payload.MissionSpawnWave, mode)
				case *pb.WsEnvelope_MissionStoryEvent:
					handleMissionStoryEvent(room, playerID, payload.MissionStoryEvent, mode)

				default:
					log.Printf("unknown protobuf payload type: %T", payload)
				}
			} else if msgType == websocket.TextMessage {
				var inbound inboundMessage
				if err := json.Unmarshal(data, &inbound); err != nil {
					log.Printf("invalid JSON message: %v", err)
					continue
				}
				switch inbound.Type {
				case "mission:accept":
					var payload MissionAcceptDTO
					if err := json.Unmarshal(inbound.Payload, &payload); err != nil {
						log.Printf("invalid mission:accept payload: %v", err)
						continue
					}
					room.Mu.Lock()
					dir := room.BeaconDirectorLocked()
					p := room.Players[playerID]
					if dir != nil && p != nil {
						if err := dir.AcceptMission(room, p, payload.MissionID); err != nil {
							log.Printf("mission accept error for player %s: %v", playerID, err)
						} else {
							room.BroadcastObjectiveProgress(p, "", 0)
						}
					}
					room.Mu.Unlock()
				case "debug:request-encounter-info":
					room.Mu.Lock()
					director := room.BeaconDirectorLocked()
					if director == nil && mode == "campaign" {
						director = room.EnsureBeaconDirectorLocked("")
					}
					player := room.Players[playerID]
					beaconDTO := game.DebugBeaconsDTO{Beacons: []game.DebugBeaconInfo{}}
					encounterDTO := game.DebugEncountersDTO{Encounters: []game.DebugEncounterInfo{}}
					if director != nil {
						beaconDTO, encounterDTO = director.BuildDebugSnapshot(room.WorldWidth, room.WorldHeight)
					}
					if player != nil {
						player.SendMessage("debug:beacons", beaconDTO)
						player.SendMessage("debug:encounters", encounterDTO)
					}
					room.Mu.Unlock()
				default:
					log.Printf("unknown text message type: %s", inbound.Type)
				}
			} else {
				log.Printf("Received unsupported WebSocket message type %d", msgType)
			}
		}
	}()

	go func() {
		var lastMissionSnapshotVersion uint64
		var lastMissionFrameVersion uint64
		for {
			select {
			case <-ctx.Done():
				return
			case <-lc.sendTick.C:
				var outbound []OutboundMessage
				room.Mu.Lock()
				now := room.Now
				p := room.Players[playerID]

				// Compute per-player missile speed cap from capabilities
				effMissileMax := MissileMaxSpeed
				if p != nil && p.Capabilities.MissileSpeedMultiplier > 0 {
					effMissileMax = MissileMaxSpeed * p.Capabilities.MissileSpeedMultiplier
				}
				missileCfg := missileConfigDTO{
					SpeedMin: MissileMinSpeed,
					SpeedMax: effMissileMax,
					AgroMin:  MissileMinAgroRadius,
				}
				var missileWaypoints []waypointDTO
				var missileRoutesDTO []missileRouteDTO
				var activeRouteID string
				var meGhost ghost
				var ghosts []ghost
				var missiles []missileDTO
				var nextMissileReady float64
				var dagDTO *dagStateDTO
				var invDTO *inventoryDTO
				var storyDTO *storyStateDTO

				var meEntity EntityID
				var meTransform *Transform

				if p != nil {
					// Apply missile heat capacity scaling and speed cap based on capabilities
					effMissileMax := MissileMaxSpeed
					if p.Capabilities.MissileSpeedMultiplier > 0 {
						effMissileMax = MissileMaxSpeed * p.Capabilities.MissileSpeedMultiplier
					}
					cfg := p.MissileConfig
					// Scale heat capacity thresholds and marker speed
					if p.Capabilities.MissileHeatCapacity > 0 {
						scale := p.Capabilities.MissileHeatCapacity
						hp := cfg.HeatParams
						if hp.Max <= 0 {
							hp = DefaultMissileHeatParams()
						}
						hp.Max *= scale
						hp.WarnAt *= scale
						hp.OverheatAt *= scale
						hp.MarkerSpeed *= scale
						cfg.HeatParams = hp
					}
					cfg = SanitizeMissileConfigWithCap(cfg, MissileMinSpeed, effMissileMax)
					p.MissileConfig = cfg
					p.EnsureMissileRoutes()
					missileCfg.Speed = cfg.Speed
					missileCfg.AgroRadius = cfg.AgroRadius
					missileCfg.Lifetime = cfg.Lifetime
					missileCfg.HeatConfig = &heatParamsDTO{
						Max:         cfg.HeatParams.Max,
						WarnAt:      cfg.HeatParams.WarnAt,
						OverheatAt:  cfg.HeatParams.OverheatAt,
						MarkerSpeed: cfg.HeatParams.MarkerSpeed,
						KUp:         cfg.HeatParams.KUp,
						KDown:       cfg.HeatParams.KDown,
						Exp:         cfg.HeatParams.Exp,
					}
					activeRouteID = p.ActiveMissileRouteID
					nextMissileReady = p.MissileReadyAt

					if route := p.ActiveMissileRoute(); route != nil {
						if len(route.Waypoints) > 0 {
							missileWaypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								missileWaypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y, Speed: wp.Speed}
							}
						}
					}

					for _, route := range p.MissileRoutes {
						dto := missileRouteDTO{ID: route.ID, Name: route.Name}
						if len(route.Waypoints) > 0 {
							dto.Waypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								dto.Waypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y, Speed: wp.Speed}
							}
						}
						missileRoutesDTO = append(missileRoutesDTO, dto)
					}

					meEntity = p.Ship
					if tr := room.World.Transform(meEntity); tr != nil {
						meTransform = tr
						shipData := room.World.ShipData(meEntity)
						history := room.World.HistoryComponent(meEntity)
						route := room.World.Route(meEntity)
						follower := room.World.RouteFollower(meEntity)
						heat := room.World.HeatData(meEntity)
						meGhost = ghost{
							ID:   fmt.Sprintf("ship-%s", p.ID),
							X:    tr.Pos.X,
							Y:    tr.Pos.Y,
							VX:   tr.Vel.X,
							VY:   tr.Vel.Y,
							T:    now,
							Self: true,
						}
						if shipData != nil {
							meGhost.HP = shipData.HP
						}
						meGhost.Kills = p.Kills
						if route != nil && len(route.Waypoints) > 0 {
							// Always send complete waypoints array for consistent indexing
							meGhost.Waypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								meGhost.Waypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y, Speed: wp.Speed}
							}
							// Send current waypoint index so client knows which waypoints have been passed
							if follower != nil {
								meGhost.CurrentWaypointIndex = follower.Index
							}
						}
						if history != nil {
							meGhost.T = now
						}
						// Include heat data for player's own ship
						if heat != nil {
							meGhost.Heat = &shipHeatViewDTO{
								V:  heat.S.Value,
								M:  heat.P.Max,
								W:  heat.P.WarnAt,
								O:  heat.P.OverheatAt,
								MS: heat.P.MarkerSpeed,
								SU: heat.S.StallUntil,
								KU: heat.P.KUp,
								KD: heat.P.KDown,
								EX: heat.P.Exp,
							}
						}
					}

					// Build DAG state DTO
					p.EnsureDagState()
					p.EnsureStoryState()
					var storyAvailable []string
					if graph := dag.GetGraph(); graph != nil && p.DagState != nil {
						var nodes []dagNodeDTO
						for nodeID, node := range graph.Nodes {
							status := p.DagState.GetStatus(nodeID)
							remaining := p.DagState.RemainingTime(nodeID, now)
							nodes = append(nodes, dagNodeDTO{
								ID:         string(nodeID),
								Kind:       string(node.Kind),
								Label:      node.Label,
								Status:     string(status),
								RemainingS: remaining,
								DurationS:  node.DurationS,
								Repeatable: node.Repeatable,
								Effects:    node.Effects,
							})
							if node.Kind == dag.NodeKindStory && status == dag.StatusAvailable {
								storyAvailable = append(storyAvailable, string(nodeID))
							}
						}
						// Stable ordering for client rendering
						sort.Slice(nodes, func(i, j int) bool { return nodes[i].ID < nodes[j].ID })
						dagDTO = &dagStateDTO{Nodes: nodes}
					}

					// Build inventory DTO
					p.EnsureInventory()
					if p.Inventory != nil && len(p.Inventory.Items) > 0 {
						items := make([]inventoryItemDTO, len(p.Inventory.Items))
						for i, item := range p.Inventory.Items {
							items[i] = inventoryItemDTO{
								Type:         item.Type,
								VariantID:    item.VariantID,
								HeatCapacity: item.HeatCapacity,
								Quantity:     item.Quantity,
							}
						}
						invDTO = &inventoryDTO{Items: items}
					}

					flags := copyStoryFlags(p.StoryFlags)
					if flags == nil {
						flags = make(map[string]bool)
					}
					storyDTO = &storyStateDTO{
						ActiveNode: p.ActiveStoryNodeID,
						Flags:      flags,
						Available:  storyAvailable,
					}

					// Serialize dialogue for active node
					if p.ActiveStoryNodeID != "" {
						if graph := dag.GetGraph(); graph != nil {
							nodeID := dag.NodeID(p.ActiveStoryNodeID)
							if node := graph.GetNode(nodeID); node != nil && node.Dialogue != nil {
								d := node.Dialogue

								// Convert choices
								var choices []storyDialogueChoiceDTO
								for _, choice := range d.Choices {
									choices = append(choices, storyDialogueChoiceDTO{
										ID:   choice.ID,
										Text: choice.Text,
									})
								}

								// Convert tutorial tip
								var tip *storyTutorialTipDTO
								if d.TutorialTip != nil {
									tip = &storyTutorialTipDTO{
										Title: d.TutorialTip.Title,
										Text:  d.TutorialTip.Text,
									}
								}

								// Build dialogue DTO
								storyDTO.Dialogue = &storyDialogueDTO{
									Speaker:       d.Speaker,
									Text:          d.Text,
									Intent:        d.Intent,
									ContinueLabel: d.ContinueLabel,
									Choices:       choices,
									TutorialTip:   tip,
								}

								log.Printf("[story] Sending dialogue for node %s to player %s (speaker: %s, choices: %d)",
									p.ActiveStoryNodeID, p.ID, storyDTO.Dialogue.Speaker, len(storyDTO.Dialogue.Choices))
							}
						}
					}
				}

				if storyDTO != nil {
					events := p.ConsumeStoryEvents()
					if len(events) > 0 {
						dtos := make([]storyEventDTO, len(events))
						for i, ev := range events {
							dtos[i] = storyEventDTO{
								ChapterID: ev.Chapter,
								NodeID:    ev.Node,
								Timestamp: ev.Timestamp,
							}
						}
						storyDTO.Events = dtos
					}
				}

				if missileCfg.Speed <= 0 {
					missileCfg.Speed = MissileMinSpeed
				}
				if missileCfg.AgroRadius < MissileMinAgroRadius {
					missileCfg.AgroRadius = MissileMinAgroRadius
				}
				missileCfg.Lifetime = MissileLifetimeFor(missileCfg.Speed, missileCfg.AgroRadius)

				if meTransform != nil {
					mePos := meTransform.Pos
					// Render other ships using perception system
					room.World.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner, CompHistory}, func(e EntityID) {
						if e == meEntity {
							return
						}
						owner := room.World.Owner(e)
						shipData := room.World.ShipData(e)
						if owner == nil || shipData == nil {
							return
						}
						// Use perception system to get what player sees of this ship
						snap, ok := PerceiveEntity(mePos, e, room.World, now)
						if !ok {
							return
						}
						kills := 0
						if otherPlayer := room.Players[owner.PlayerID]; otherPlayer != nil {
							kills = otherPlayer.Kills
						}
						ghosts = append(ghosts, ghost{
							ID:    fmt.Sprintf("ship-%s", owner.PlayerID),
							X:     snap.Pos.X,
							Y:     snap.Pos.Y,
							VX:    snap.Vel.X,
							VY:    snap.Vel.Y,
							T:     snap.T,
							HP:    shipData.HP,
							Kills: kills,
							Self:  false,
						})
					})

					// Render missiles using perception system
					room.World.ForEach([]ComponentKey{CompTransform, CompMissile, CompOwner, CompHistory}, func(e EntityID) {
						owner := room.World.Owner(e)
						missile := room.World.MissileData(e)
						if owner == nil || missile == nil {
							return
						}
						// Use perception system to get what player sees of this missile
						// This handles light delay and prevents showing missiles before light reaches viewer
						snap, ok := PerceiveEntity(mePos, e, room.World, now)
						if !ok {
							return
						}
						targetID := ""
						if missile.Target != 0 {
							if targetOwner := room.World.Owner(missile.Target); targetOwner != nil {
								targetID = fmt.Sprintf("ship-%s", targetOwner.PlayerID)
							}
						}

						// Get heat component data for missile
						var heatView *shipHeatViewDTO
						if heat := room.World.HeatData(e); heat != nil {
							heatView = &shipHeatViewDTO{
								V:  heat.S.Value,
								M:  heat.P.Max,
								W:  heat.P.WarnAt,
								O:  heat.P.OverheatAt,
								MS: heat.P.MarkerSpeed,
								SU: heat.S.StallUntil,
								KU: heat.P.KUp,
								KD: heat.P.KDown,
								EX: heat.P.Exp,
							}
						}

						missiles = append(missiles, missileDTO{
							ID:         fmt.Sprintf("miss-%d", e),
							Owner:      owner.PlayerID,
							Self:       owner.PlayerID == playerID,
							X:          snap.Pos.X,
							Y:          snap.Pos.Y,
							VX:         snap.Vel.X,
							VY:         snap.Vel.Y,
							T:          snap.T,
							AgroRadius: missile.AgroRadius,
							Lifetime:   missile.Lifetime,
							LaunchTime: missile.LaunchTime,
							ExpiresAt:  missile.LaunchTime + missile.Lifetime,
							TargetID:   targetID,
							Heat:       heatView,
						})
					})
				}

				var snapshotProto *pb.MissionBeaconSnapshot
				var deltaProto *pb.MissionBeaconDelta
				var nextSnapshotVersion uint64
				var nextDeltaVersion uint64
				if room.BeaconDirectorLocked() != nil {
					snapshot, snapVersion := room.MissionSnapshotForBroadcastLocked()
					if snapVersion > 0 && snapVersion != lastMissionSnapshotVersion {
						snapshotProto = missionSnapshotToProto(snapshot, room.Now)
						nextSnapshotVersion = snapVersion
					}
					deltas, encounters, frameVersion := room.MissionFrameForBroadcastLocked()
					if frameVersion > 0 && frameVersion != lastMissionFrameVersion {
						deltaProto = missionDeltaToProto(deltas, encounters, room.Now)
						nextDeltaVersion = frameVersion
					}
				}
				if p != nil {
					outbound = p.ConsumePendingMessages()
				}

				room.Mu.Unlock()

				msg := stateMsg{
					Type:               "state",
					Now:                now,
					Me:                 meGhost,
					Ghosts:             ghosts,
					Meta:               roomMeta{C: C, W: room.WorldWidth, H: room.WorldHeight},
					Missiles:           missiles,
					MissileConfig:      missileCfg,
					MissileWaypoints:   missileWaypoints,
					MissileRoutes:      missileRoutesDTO,
					ActiveMissileRoute: activeRouteID,
					NextMissileReady:   nextMissileReady,
					Dag:                dagDTO,
					Inventory:          invDTO,
					Story:              storyDTO,
				}
				// Convert to protobuf and send
				stateProto := stateToProto(msg)
				if err := sendProtoMessage(conn, stateProto); err != nil {
					log.Printf("send error: %v", err)
					return
				}
				if snapshotProto != nil {
					if err := sendProtoMessage(conn, snapshotProto); err != nil {
						log.Printf("send snapshot error: %v", err)
						return
					}
					lastMissionSnapshotVersion = nextSnapshotVersion
				}
				if deltaProto != nil {
					if err := sendProtoMessage(conn, deltaProto); err != nil {
						log.Printf("send beacon delta error: %v", err)
						return
					}
					lastMissionFrameVersion = nextDeltaVersion
				}
				for _, event := range outbound {
					frame := map[string]interface{}{
						"type":    event.Type,
						"payload": event.Payload,
					}
					if err := conn.WriteJSON(frame); err != nil {
						log.Printf("send json event error: %v", err)
						return
					}
				}
			}
		}
	}()

	<-ctx.Done()
	lc.sendTick.Stop()
	conn.Close()

	room.Mu.Lock()
	if _, ok := room.Players[playerID]; ok {
		room.RemovePlayerEntitiesLocked(playerID)
		delete(room.Players, playerID)
	}
	if room.HumanPlayerCountLocked() == 0 {
		room.RemoveAllBotsLocked()
	}
	room.Mu.Unlock()
}

// Protobuf message handlers

func handleJoin(room *Room, playerID string, msg *pb.ClientJoin) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	name := strings.TrimSpace(msg.Name)
	if name == "" {
		name = "Anon"
	}
	if p := room.Players[playerID]; p != nil {
		p.Name = name
	}
}

func handleSpawnBot(room *Room, playerID string) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		// Spawn bot at random location on opposite side from player
		spawnPos := Vec2{X: room.WorldWidth * 0.75, Y: room.WorldHeight * 0.5}
		if tr := room.World.Transform(p.Ship); tr != nil {
			// Spawn on opposite side with some randomness
			spawnPos = Vec2{
				X: Clamp(room.WorldWidth-tr.Pos.X, 0, room.WorldWidth),
				Y: Clamp(room.WorldHeight-tr.Pos.Y, 0, room.WorldHeight),
			}
		}
		room.AddBotLocked("Sentinel AI", NewDefensiveBehavior(), spawnPos)
	}
}

func handleAddWaypoint(room *Room, playerID string, msg *pb.AddWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		wp := RouteWaypoint{
			Pos:   Vec2{X: Clamp(msg.X, 0, room.WorldWidth), Y: Clamp(msg.Y, 0, room.WorldHeight)},
			Speed: Clamp(msg.Speed, 0, ShipMaxSpeed),
		}
		room.AppendRouteWaypoint(p.Ship, wp)
	}
}

func handleUpdateWaypoint(room *Room, playerID string, msg *pb.UpdateWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		room.UpdateRouteWaypointSpeed(p.Ship, int(msg.Index), msg.Speed)
	}
}

func handleMoveWaypoint(room *Room, playerID string, msg *pb.MoveWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		newPos := Vec2{X: Clamp(msg.X, 0, room.WorldWidth), Y: Clamp(msg.Y, 0, room.WorldHeight)}
		room.MoveRouteWaypoint(p.Ship, int(msg.Index), newPos)
	}
}

func handleDeleteWaypoint(room *Room, playerID string, msg *pb.DeleteWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		room.DeleteRouteWaypointsFrom(p.Ship, int(msg.Index))
	}
}

func handleClearWaypoints(room *Room, playerID string) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		room.ClearRouteWaypoints(p.Ship)
	}
}

func handleConfigureMissile(room *Room, playerID string, msg *pb.ConfigureMissile) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		cfg := p.MissileConfig
		if msg.MissileSpeed > 0 {
			cfg.Speed = msg.MissileSpeed
		}
		if msg.MissileAgro >= 0 {
			cfg.AgroRadius = msg.MissileAgro
		}
		p.MissileConfig = SanitizeMissileConfig(cfg)
	}
}

func handleAddMissileWaypoint(room *Room, playerID string, msg *pb.AddMissileWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		routeID := msg.RouteId
		if routeID == "" {
			routeID = p.ActiveMissileRouteID
		}
		if route := p.MissileRouteByID(routeID); route != nil {
			wp := RouteWaypoint{
				Pos:   Vec2{X: Clamp(msg.X, 0, room.WorldWidth), Y: Clamp(msg.Y, 0, room.WorldHeight)},
				Speed: Clamp(msg.Speed, 0, ShipMaxSpeed),
			}
			route.Waypoints = append(route.Waypoints, wp)
		}
	}
}

func handleUpdateMissileWaypointSpeed(room *Room, playerID string, msg *pb.UpdateMissileWaypointSpeed) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		routeID := msg.RouteId
		if routeID == "" {
			routeID = p.ActiveMissileRouteID
		}
		speed := Clamp(msg.Speed, MissileMinSpeed, MissileMaxSpeed)
		if speed <= 0 {
			speed = Clamp(p.MissileConfig.Speed, MissileMinSpeed, MissileMaxSpeed)
		}
		p.UpdateWaypointSpeedInRoute(routeID, int(msg.Index), speed)
	}
}

func handleMoveMissileWaypoint(room *Room, playerID string, msg *pb.MoveMissileWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		routeID := msg.RouteId
		if routeID == "" {
			routeID = p.ActiveMissileRouteID
		}
		if route := p.MissileRouteByID(routeID); route != nil {
			idx := int(msg.Index)
			if idx >= 0 && idx < len(route.Waypoints) {
				route.Waypoints[idx].Pos = Vec2{
					X: Clamp(msg.X, 0, room.WorldWidth),
					Y: Clamp(msg.Y, 0, room.WorldHeight),
				}
			}
		}
	}
}

func handleDeleteMissileWaypoint(room *Room, playerID string, msg *pb.DeleteMissileWaypoint) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		routeID := msg.RouteId
		if routeID == "" {
			routeID = p.ActiveMissileRouteID
		}
		p.DeleteWaypointFromRoute(routeID, int(msg.Index))
	}
}

func handleClearMissileRoute(room *Room, playerID string, msg *pb.ClearMissileRoute) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		p.ClearMissileRoute(msg.RouteId)
	}
}

func handleAddMissileRoute(room *Room, playerID string, msg *pb.AddMissileRoute) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		p.AddMissileRoute(msg.Name)
	}
}

func handleRenameMissileRoute(room *Room, playerID string, msg *pb.RenameMissileRoute) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		p.RenameMissileRoute(msg.RouteId, msg.Name)
	}
}

func handleDeleteMissileRoute(room *Room, playerID string, msg *pb.DeleteMissileRoute) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		p.DeleteMissileRoute(msg.RouteId)
	}
}

func handleSetActiveMissileRoute(room *Room, playerID string, msg *pb.SetActiveMissileRoute) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureMissileRoutes()
		p.SetActiveMissileRoute(msg.RouteId)
	}
}

func handleLaunchMissile(room *Room, playerID string, msg *pb.LaunchMissile) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		// Apply capabilities at launch time too
		effMissileMax := MissileMaxSpeed
		if p.Capabilities.MissileSpeedMultiplier > 0 {
			effMissileMax = MissileMaxSpeed * p.Capabilities.MissileSpeedMultiplier
		}
		cfg := p.MissileConfig
		// Scale missile heat capacity and marker speed
		if p.Capabilities.MissileHeatCapacity > 0 {
			scale := p.Capabilities.MissileHeatCapacity
			hp := cfg.HeatParams
			if hp.Max <= 0 {
				hp = DefaultMissileHeatParams()
			}
			hp.Max *= scale
			hp.WarnAt *= scale
			hp.OverheatAt *= scale
			hp.MarkerSpeed *= scale
			cfg.HeatParams = hp
		}
		cfg = SanitizeMissileConfigWithCap(cfg, MissileMinSpeed, effMissileMax)
		p.MissileConfig = cfg
		p.EnsureMissileRoutes()
		routeID := msg.RouteId
		if routeID == "" {
			routeID = p.ActiveMissileRouteID
		}
		var waypoints []RouteWaypoint
		if route := p.MissileRouteByID(routeID); route != nil {
			waypoints = append([]RouteWaypoint(nil), route.Waypoints...)
		}
		if len(waypoints) == 0 {
			return
		}
		now := room.Now
		if p.MissileReadyAt > 0 && now < p.MissileReadyAt {
			return
		}

		// Check if player has missiles in inventory
		p.EnsureInventory()
		hasMissiles := false
		var missileToConsume *InventoryItem
		for i := range p.Inventory.Items {
			item := &p.Inventory.Items[i]
			if item.Type == "missile" && item.Quantity > 0 {
				hasMissiles = true
				missileToConsume = item
				break
			}
		}
		if !hasMissiles {
			log.Printf("Player %s attempted to launch missile but has none in inventory", playerID)
			return
		}

		if tr := room.World.Transform(p.Ship); tr != nil {
			speed := tr.Vel.Len()
			if id := room.LaunchMissile(playerID, p.Ship, cfg, waypoints, tr.Pos, tr.Vel); id != 0 {
				p.MissileReadyAt = now + MissileCooldownForSpeed(speed)
				// Consume one missile from inventory
				p.Inventory.RemoveItem(missileToConsume.Type, missileToConsume.VariantID, missileToConsume.HeatCapacity, 1)
				log.Printf("Player %s launched missile, consumed 1x %s (heat: %.0f)", playerID, missileToConsume.VariantID, missileToConsume.HeatCapacity)
			}
		}
	}
}

// ========== Phase 2: DAG Command Handlers ==========

func handleDagStart(room *Room, playerID string, msg *pb.DagStart) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureDagState()
		p.EnsureStoryState()
		graph := dag.GetGraph()
		if graph != nil {
			effects := NewRoomDagEffects(room, p)
			nodeID := dag.NodeID(msg.NodeId)
			if err := dag.Start(graph, p.DagState, nodeID, room.Now, effects); err != nil {
				log.Printf("dag_start error for player %s node %s: %v", playerID, nodeID, err)
			}
		}
	}
}

func handleDagCancel(room *Room, playerID string, msg *pb.DagCancel) {
	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureDagState()
		p.EnsureStoryState()
		graph := dag.GetGraph()
		if graph != nil {
			effects := NewRoomDagEffects(room, p)
			nodeID := dag.NodeID(msg.NodeId)
			if err := dag.Cancel(graph, p.DagState, nodeID, effects); err != nil {
				log.Printf("dag_cancel error for player %s node %s: %v", playerID, nodeID, err)
			}
		}
	}
}

func handleDagStoryAck(room *Room, playerID string, msg *pb.DagStoryAck) {
	log.Printf("[story] Received dag_story_ack from player %s for node %s (choice: %s)",
		playerID, msg.NodeId, msg.ChoiceId)

	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		p.EnsureStoryState()
		if msg.NodeId != "" {
			nodeID := dag.NodeID(msg.NodeId)
			graph := dag.GetGraph()
			if graph == nil {
				log.Printf("[story] No graph available for ack from player %s", playerID)
				return
			}
			node := graph.GetNode(nodeID)
			effects := NewRoomDagEffects(room, p)
			if node != nil && node.Kind == dag.NodeKindStory {
				status := p.DagState.GetStatus(nodeID)
				if status == dag.StatusInProgress {
					if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
						log.Printf("[story] Complete error for player %s node %s: %v", playerID, nodeID, err)
					} else {
						if msg.ChoiceId != "" {
							room.HandleStoryChoiceBranching(p, nodeID, msg.ChoiceId, graph)
						}
						log.Printf("[story] Successfully completed node %s for player %s", nodeID, playerID)
					}
				}
			}
		}
	}
}

func handleDagList(room *Room, playerID string, conn *websocket.Conn) {
	room.Mu.Lock()
	var dagProto *pb.DagState
	if p := room.Players[playerID]; p != nil {
		p.EnsureDagState()
		if graph := dag.GetGraph(); graph != nil && p.DagState != nil {
			now := room.Now
			var nodes []dagNodeDTO
			for nodeID, node := range graph.Nodes {
				status := p.DagState.GetStatus(nodeID)
				remaining := p.DagState.RemainingTime(nodeID, now)
				nodes = append(nodes, dagNodeDTO{
					ID:         string(nodeID),
					Kind:       string(node.Kind),
					Label:      node.Label,
					Status:     string(status),
					RemainingS: remaining,
					DurationS:  node.DurationS,
					Repeatable: node.Repeatable,
					Effects:    node.Effects,
				})
			}
			// Stable ordering for client rendering
			sort.Slice(nodes, func(i, j int) bool { return nodes[i].ID < nodes[j].ID })
			dagDTO := dagStateDTO{Nodes: nodes}
			dagProto = dagStateToProto(dagDTO)
		}
	}
	room.Mu.Unlock()

	// Send response
	if dagProto != nil {
		response := &pb.DagListResponse{Dag: dagProto}
		sendProtoMessage(conn, response)
	}
}

// ========== Phase 2: Mission Event Handlers ==========

func normalizeMissionID(raw string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" || trimmed == "1" {
		return "campaign-1"
	}
	return trimmed
}

func handleMissionSpawnWave(room *Room, playerID string, msg *pb.MissionSpawnWave, mode string) {
	if mode != "campaign" {
		return
	}

	waveIndex := int(msg.WaveIndex)
	if waveIndex < 1 || waveIndex > 3 {
		return
	}

	room.Mu.Lock()
	defer room.Mu.Unlock()

	room.EnsureBeaconDirectorLocked("campaign-1")
	if p := room.Players[playerID]; p != nil {
		room.HandleMissionStoryEventLocked(p, "mission:beacon-locked", waveIndex)
	}
}

func handleMissionStoryEvent(room *Room, playerID string, msg *pb.MissionStoryEvent, mode string) {
	if mode != "campaign" {
		return
	}

	event := strings.ToLower(strings.TrimSpace(msg.Event))
	beacon := int(msg.Beacon)

	room.Mu.Lock()
	defer room.Mu.Unlock()

	if p := room.Players[playerID]; p != nil {
		room.HandleMissionStoryEventLocked(p, event, beacon)
	}
}

func copyStoryFlags(src map[string]bool) map[string]bool {
	if len(src) == 0 {
		return nil
	}
	dst := make(map[string]bool, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func missionBeaconFallbackPositions(room *Room) []Vec2 {
	if room == nil {
		return nil
	}
	w := room.WorldWidth
	h := room.WorldHeight
	return []Vec2{
		{X: 0.15 * w, Y: 0.55 * h},
		{X: 0.40 * w, Y: 0.50 * h},
		{X: 0.65 * w, Y: 0.47 * h},
		{X: 0.85 * w, Y: 0.44 * h},
	}
}

func missionSnapshotToProto(snapshot BeaconSnapshot, now float64) *pb.MissionBeaconSnapshot {
	beacons := make([]*pb.MissionBeaconDefinition, len(snapshot.Beacons))
	for i, b := range snapshot.Beacons {
		beacons[i] = &pb.MissionBeaconDefinition{
			Id:      b.ID,
			Ordinal: int32(b.Ordinal),
			X:       b.X,
			Y:       b.Y,
			Radius:  b.Radius,
			Seed:    b.Seed,
		}
	}
	players := make([]*pb.MissionBeaconPlayer, len(snapshot.Players))
	for i, p := range snapshot.Players {
		cooldowns := make(map[string]float64, len(p.Cooldowns))
		for k, v := range p.Cooldowns {
			cooldowns[k] = v
		}
		players[i] = &pb.MissionBeaconPlayer{
			PlayerId:     p.PlayerID,
			CurrentIndex: int32(p.CurrentIndex),
			HoldAccum:    p.HoldAccum,
			HoldRequired: p.HoldRequired,
			ActiveBeacon: p.ActiveBeacon,
			Discovered:   append([]string(nil), p.Discovered...),
			Completed:    append([]string(nil), p.Completed...),
			Cooldowns:    cooldowns,
		}
	}
	encounters := make([]*pb.MissionBeaconEncounter, len(snapshot.Encounters))
	for i, enc := range snapshot.Encounters {
		encounters[i] = &pb.MissionBeaconEncounter{
			EncounterId: enc.ID,
			BeaconId:    enc.BeaconID,
			WaveIndex:   int32(enc.WaveIndex),
			SpawnedAt:   enc.SpawnedAt,
			ExpiresAt:   enc.ExpiresAt,
		}
	}
	serverTime := snapshot.ServerTime
	if serverTime == 0 {
		serverTime = now
	}
	return &pb.MissionBeaconSnapshot{
		MissionId:  snapshot.MissionID,
		LayoutSeed: snapshot.LayoutSeed,
		ServerTime: serverTime,
		Beacons:    beacons,
		Players:    players,
		Encounters: encounters,
	}
}

func missionDeltaToProto(deltas []BeaconDelta, encounters []EncounterDelta, now float64) *pb.MissionBeaconDelta {
	if len(deltas) == 0 && len(encounters) == 0 {
		return nil
	}
	msg := &pb.MissionBeaconDelta{}
	for _, d := range deltas {
		ts := d.Timestamp
		if ts == 0 {
			ts = now
		}
		msg.Players = append(msg.Players, &pb.MissionBeaconPlayerDelta{
			Type:          missionDeltaTypeToProto(d.Type),
			PlayerId:      d.PlayerID,
			BeaconId:      d.BeaconID,
			Ordinal:       int32(d.Ordinal),
			HoldAccum:     d.HoldAccum,
			HoldRequired:  d.HoldRequired,
			CooldownUntil: d.CooldownUntil,
			ServerTime:    ts,
		})
	}
	for _, enc := range encounters {
		evt := &pb.MissionBeaconEncounterEvent{
			Type:        missionEncounterTypeToProto(enc.Type),
			EncounterId: enc.Encounter.ID,
			BeaconId:    enc.Encounter.BeaconID,
			WaveIndex:   int32(enc.Encounter.WaveIndex),
			SpawnedAt:   enc.Encounter.SpawnedAt,
			ExpiresAt:   enc.Encounter.ExpiresAt,
			Reason:      enc.Reason,
		}
		msg.Encounters = append(msg.Encounters, evt)
	}
	return msg
}

func missionDeltaTypeToProto(t BeaconDeltaType) pb.MissionBeaconDeltaType {
	switch t {
	case BeaconDeltaDiscovered:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_DISCOVERED
	case BeaconDeltaHoldProgress:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_HOLD_PROGRESS
	case BeaconDeltaHoldReset:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_HOLD_RESET
	case BeaconDeltaBeaconLocked:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_LOCKED
	case BeaconDeltaCooldownSet:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_COOLDOWN
	case BeaconDeltaMissionCompleted:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_MISSION_COMPLETED
	default:
		return pb.MissionBeaconDeltaType_MISSION_BEACON_DELTA_UNSPECIFIED
	}
}

func missionEncounterTypeToProto(t EncounterDeltaType) pb.MissionEncounterEventType {
	switch t {
	case EncounterDeltaSpawned:
		return pb.MissionEncounterEventType_MISSION_ENCOUNTER_EVENT_SPAWNED
	case EncounterDeltaCleared:
		return pb.MissionEncounterEventType_MISSION_ENCOUNTER_EVENT_CLEARED
	case EncounterDeltaTimeout:
		return pb.MissionEncounterEventType_MISSION_ENCOUNTER_EVENT_TIMEOUT
	case EncounterDeltaPurged:
		return pb.MissionEncounterEventType_MISSION_ENCOUNTER_EVENT_PURGED
	default:
		return pb.MissionEncounterEventType_MISSION_ENCOUNTER_EVENT_UNSPECIFIED
	}
}
