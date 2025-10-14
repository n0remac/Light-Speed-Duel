package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"LightSpeedDuel/internal/dag"
	. "LightSpeedDuel/internal/game"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
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

type wsMsg struct {
	Type string `json:"type"`
	// join
	Name string  `json:"name,omitempty"`
	Room string  `json:"room,omitempty"`
	MapW float64 `json:"map_w,omitempty"`
	MapH float64 `json:"map_h,omitempty"`
	// waypoint
	X     float64 `json:"x,omitempty"`
	Y     float64 `json:"y,omitempty"`
	Speed float64 `json:"speed,omitempty"`
	Index int     `json:"index,omitempty"`
	// missile config
	MissileSpeed float64 `json:"missile_speed,omitempty"`
	MissileAgro  float64 `json:"missile_agro,omitempty"`
	RouteID      string  `json:"route_id,omitempty"`
	RouteName    string  `json:"route_name,omitempty"`
	// dag
	NodeID string `json:"node_id,omitempty"`
	// mission wave spawning
	WaveIndex int `json:"wave_index,omitempty"`
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

	mapW := WorldW
	mapH := WorldH
	if mode == "campaign" {
		mapW = 32000
		mapH = 18000
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
	playerID := RandId("p")
	player := &Player{ID: playerID, Name: "Anon"}

	room.Mu.Lock()
	if room.HumanPlayerCountLocked() >= RoomMaxPlayers {
		room.Mu.Unlock()
		_ = conn.WriteJSON(map[string]any{"type": "full", "message": "room full"})
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

	defaultMissileSpeed := ShipMaxSpeed * 0.75
	player.MissileConfig = SanitizeMissileConfig(MissileConfig{
		Speed:      defaultMissileSpeed,
		AgroRadius: 800,
	})
	player.EnsureMissileRoutes()
	player.EnsureDagState()
	player.EnsureInventory()

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
	room.Mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		defer cancel()
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var m wsMsg
			if err := json.Unmarshal(data, &m); err != nil {
				continue
			}
			switch m.Type {
			case "join":
				name := strings.TrimSpace(m.Name)
				if name == "" {
					name = "Anon"
				}
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.Name = name
				}
				room.Mu.Unlock()
			case "spawn_bot":
				room.Mu.Lock()
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
				room.Mu.Unlock()
			case "add_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					wp := RouteWaypoint{
						Pos:   Vec2{X: Clamp(m.X, 0, room.WorldWidth), Y: Clamp(m.Y, 0, room.WorldHeight)},
						Speed: Clamp(m.Speed, 0, ShipMaxSpeed),
					}
					room.AppendRouteWaypoint(p.Ship, wp)
				}
				room.Mu.Unlock()
			case "update_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.UpdateRouteWaypointSpeed(p.Ship, m.Index, m.Speed)
				}
				room.Mu.Unlock()
			case "move_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					newPos := Vec2{X: Clamp(m.X, 0, room.WorldWidth), Y: Clamp(m.Y, 0, room.WorldHeight)}
					room.MoveRouteWaypoint(p.Ship, m.Index, newPos)
				}
				room.Mu.Unlock()
			case "delete_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.DeleteRouteWaypointsFrom(p.Ship, m.Index)
				}
				room.Mu.Unlock()
			case "clear_waypoints":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.ClearRouteWaypoints(p.Ship)
				}
				room.Mu.Unlock()
			case "configure_missile":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					cfg := p.MissileConfig
					if m.MissileSpeed > 0 {
						cfg.Speed = m.MissileSpeed
					}
					if m.MissileAgro >= 0 {
						cfg.AgroRadius = m.MissileAgro
					}
					p.MissileConfig = SanitizeMissileConfig(cfg)
				}
				room.Mu.Unlock()
			case "add_missile_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					point := Vec2{X: Clamp(m.X, 0, room.WorldWidth), Y: Clamp(m.Y, 0, room.WorldHeight)}
					defaultSpeed := Clamp(p.MissileConfig.Speed, MissileMinSpeed, MissileMaxSpeed)
					speed := Clamp(m.Speed, MissileMinSpeed, MissileMaxSpeed)
					if speed <= 0 {
						speed = defaultSpeed
					}
					wp := RouteWaypoint{
						Pos:   point,
						Speed: speed,
					}
					p.AddWaypointToRoute(routeID, wp)
				}
				room.Mu.Unlock()
			case "update_missile_waypoint_speed":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					speed := Clamp(m.Speed, MissileMinSpeed, MissileMaxSpeed)
					if speed <= 0 {
						speed = Clamp(p.MissileConfig.Speed, MissileMinSpeed, MissileMaxSpeed)
					}
					p.UpdateWaypointSpeedInRoute(routeID, m.Index, speed)
				}
				room.Mu.Unlock()
			case "move_missile_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					if route := p.MissileRouteByID(routeID); route != nil {
						if m.Index >= 0 && m.Index < len(route.Waypoints) {
							route.Waypoints[m.Index].Pos = Vec2{
								X: Clamp(m.X, 0, room.WorldWidth),
								Y: Clamp(m.Y, 0, room.WorldHeight),
							}
						}
					}
				}
				room.Mu.Unlock()
			case "delete_missile_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					if route := p.MissileRouteByID(routeID); route != nil {
						index := m.Index
						if index < 0 || index >= len(route.Waypoints) {
							index = len(route.Waypoints) - 1
						}
						if index >= 0 {
							p.DeleteWaypointFromRoute(routeID, index)
						}
					}
				}
				room.Mu.Unlock()
			case "clear_missile_route":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					p.ClearMissileRoute(routeID)
				}
				room.Mu.Unlock()
			case "add_missile_route":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.AddMissileRoute(m.RouteName)
				}
				room.Mu.Unlock()
			case "rename_missile_route":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.RenameMissileRoute(m.RouteID, m.RouteName)
				}
				room.Mu.Unlock()
			case "delete_missile_route":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.DeleteMissileRoute(m.RouteID)
				}
				room.Mu.Unlock()
			case "set_active_missile_route":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.SetActiveMissileRoute(m.RouteID)
				}
				room.Mu.Unlock()
			case "launch_missile":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					cfg := SanitizeMissileConfig(p.MissileConfig)
					p.MissileConfig = cfg
					p.EnsureMissileRoutes()
					routeID := m.RouteID
					if routeID == "" {
						routeID = p.ActiveMissileRouteID
					}
					var waypoints []RouteWaypoint
					if route := p.MissileRouteByID(routeID); route != nil {
						waypoints = append([]RouteWaypoint(nil), route.Waypoints...)
					}
					if len(waypoints) == 0 {
						room.Mu.Unlock()
						continue
					}
					now := room.Now
					if p.MissileReadyAt > 0 && now < p.MissileReadyAt {
						room.Mu.Unlock()
						continue
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
						room.Mu.Unlock()
						continue
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
				room.Mu.Unlock()
			case "mission_spawn_wave":
				if mode != "campaign" {
					continue
				}
				waveIndex := m.WaveIndex
				if waveIndex < 1 || waveIndex > 3 {
					continue
				}
				room.Mu.Lock()
				if room.SetMissionWaveSpawnedLocked(waveIndex) {
					spawnMissionWave(room, waveIndex)
				}
				room.Mu.Unlock()
			case "dag_start":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureDagState()
					graph := dag.GetGraph()
					if graph != nil {
						effects := NewCraftingEffects(p)
						nodeID := dag.NodeID(m.NodeID)
						if err := dag.Start(graph, p.DagState, nodeID, room.Now, effects); err != nil {
							log.Printf("dag_start error for player %s node %s: %v", playerID, nodeID, err)
						}
					}
				}
				room.Mu.Unlock()
			case "dag_cancel":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.EnsureDagState()
					graph := dag.GetGraph()
					if graph != nil {
						effects := NewCraftingEffects(p)
						nodeID := dag.NodeID(m.NodeID)
						if err := dag.Cancel(graph, p.DagState, nodeID, effects); err != nil {
							log.Printf("dag_cancel error for player %s node %s: %v", playerID, nodeID, err)
						}
					}
				}
				room.Mu.Unlock()
			case "dag_list":
				room.Mu.Lock()
				var dagDTO *dagStateDTO
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
							})
						}
						dagDTO = &dagStateDTO{Nodes: nodes}
					}
				}
				room.Mu.Unlock()
				// Send dag list response
				if dagDTO != nil {
					_ = conn.WriteJSON(map[string]any{
						"type": "dag_list",
						"dag":  dagDTO,
					})
				}
			}
		}
	}()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-lc.sendTick.C:
				room.Mu.Lock()
				now := room.Now
				p := room.Players[playerID]

				missileCfg := missileConfigDTO{
					SpeedMin: MissileMinSpeed,
					SpeedMax: MissileMaxSpeed,
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

				var meEntity EntityID
				var meTransform *Transform

				if p != nil {
					cfg := SanitizeMissileConfig(p.MissileConfig)
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
							})
						}
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
				}
				_ = conn.WriteJSON(msg)
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

func spawnMissionWave(room *Room, waveIndex int) {
	beacons := missionBeaconPositions(room)
	if len(beacons) < 4 {
		return
	}
	switch waveIndex {
	case 1:
		heat := HeatParams{
			Max:         40,
			WarnAt:      28,
			OverheatAt:  40,
			MarkerSpeed: 60,
			KUp:         20,
			KDown:       14,
			Exp:         HeatExp,
		}
		total := 18 + rand.Intn(7) // 18-24
		points := []Vec2{
			lerpVec(beacons[0], beacons[1], 0.25),
			lerpVec(beacons[0], beacons[1], 0.5),
			lerpVec(beacons[0], beacons[1], 0.75),
		}
		radius := math.Max(room.WorldWidth*0.025, 600)
		distributed := total
		for idx, center := range points {
			if distributed <= 0 {
				break
			}
			remainingSlots := len(points) - idx
			group := distributed / remainingSlots
			if group <= 0 {
				group = distributed
			}
			room.SpawnMinefield(int(center.X), int(center.Y), group, radius, heat, 160)
			distributed -= group
		}
	case 2:
		minesHeat := HeatParams{
			Max:         50,
			WarnAt:      35,
			OverheatAt:  50,
			MarkerSpeed: 100,
			KUp:         24,
			KDown:       12,
			Exp:         HeatExp,
		}
		total := 28 + rand.Intn(9) // 28-36
		mineCount := int(math.Round(float64(total) * 0.65))
		if mineCount < 12 {
			mineCount = 12
		}
		if mineCount > total {
			mineCount = total
		}
		patrollerCount := total - mineCount
		points := []Vec2{
			lerpVec(beacons[1], beacons[2], 0.2),
			lerpVec(beacons[1], beacons[2], 0.45),
			lerpVec(beacons[1], beacons[2], 0.7),
		}
		radius := math.Max(room.WorldWidth*0.02, 500)
		distributed := mineCount
		for idx, center := range points {
			if distributed <= 0 {
				break
			}
			remainingSlots := len(points) - idx
			group := distributed / remainingSlots
			if group <= 0 {
				group = distributed
			}
			room.SpawnMinefield(int(center.X), int(center.Y), group, radius, minesHeat, 200)
			distributed -= group
		}
		if patrollerCount > 0 {
			path := []Vec2{
				lerpVec(beacons[1], beacons[2], 0.15),
				lerpVec(beacons[1], beacons[2], 0.5),
				lerpVec(beacons[1], beacons[2], 0.85),
			}
			room.SpawnPatrollers(path, patrollerCount, [2]float64{20, 40}, 320, minesHeat, 200)
		}
	case 3:
		seekersHeat := HeatParams{
			Max:         68,
			WarnAt:      46,
			OverheatAt:  68,
			MarkerSpeed: 120,
			KUp:         20,
			KDown:       15,
			Exp:         HeatExp,
		}
		seekers := 6 + rand.Intn(5) // 6-10
		center := lerpVec(beacons[2], beacons[3], 0.55)
		ring := math.Max(room.WorldWidth*0.035, 900)
		room.SpawnSeekers(int(center.X), int(center.Y), seekers, ring, [2]float64{60, 100}, [2]float64{600, 900}, seekersHeat, 260)

		supportHeat := HeatParams{
			Max:         55,
			WarnAt:      38,
			OverheatAt:  55,
			MarkerSpeed: 90,
			KUp:         22,
			KDown:       13,
			Exp:         HeatExp,
		}
		mines := 12 + rand.Intn(5)
		room.SpawnMinefield(int(center.X), int(center.Y), mines, ring*0.8, supportHeat, 220)
	}
}

func missionBeaconPositions(room *Room) []Vec2 {
	w := room.WorldWidth
	h := room.WorldHeight
	return []Vec2{
		{X: 0.15 * w, Y: 0.55 * h},
		{X: 0.40 * w, Y: 0.50 * h},
		{X: 0.65 * w, Y: 0.47 * h},
		{X: 0.85 * w, Y: 0.44 * h},
	}
}

func lerpVec(a, b Vec2, t float64) Vec2 {
	return Vec2{
		X: a.X + (b.X-a.X)*t,
		Y: a.Y + (b.Y-a.Y)*t,
	}
}
