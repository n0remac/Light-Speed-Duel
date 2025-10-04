package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	. "LightSpeedDuel/internal/game"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type wsMsg struct {
	Type string `json:"type"`
	// join
	Name string `json:"name,omitempty"`
	Room string `json:"room,omitempty"`
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
}

type roomMeta struct {
	C float64 `json:"c"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type ghost struct {
	ID        string        `json:"id"`
	X         float64       `json:"x"`
	Y         float64       `json:"y"`
	VX        float64       `json:"vx"`
	VY        float64       `json:"vy"`
	T         float64       `json:"t"`
	Self      bool          `json:"self"`
	Waypoints []waypointDTO `json:"waypoints,omitempty"`
	HP        int           `json:"hp"`
}

type liveConn struct {
	conn     *websocket.Conn
	sendTick *time.Ticker
}

func serveWS(h *Hub, w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "default"
	}
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

	defaultMissileSpeed := ShipMaxSpeed * 0.75
	player.MissileConfig = SanitizeMissileConfig(MissileConfig{
		Speed:      defaultMissileSpeed,
		AgroRadius: 800,
	})
	player.EnsureMissileRoutes()

	existingHumans := room.HumanPlayerCountLocked()
	startPos := Vec2{
		X: (WorldW * 0.25) + float64(existingHumans)*200.0,
		Y: (WorldH * 0.5) + float64(existingHumans)*-200.0,
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
					spawnPos := Vec2{X: WorldW * 0.75, Y: WorldH * 0.5}
					if tr := room.World.Transform(p.Ship); tr != nil {
						spawnPos = Vec2{
							X: Clamp(WorldW-tr.Pos.X, 0, WorldW),
							Y: Clamp(WorldH-tr.Pos.Y, 0, WorldH),
						}
					}
					room.RemoveAllBotsLocked()
					room.AddBotLocked("Sentinel AI", NewDefensiveBehavior(), spawnPos)
				}
				room.Mu.Unlock()
			case "add_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					wp := ShipWaypoint{
						Pos:   Vec2{X: Clamp(m.X, 0, WorldW), Y: Clamp(m.Y, 0, WorldH)},
						Speed: Clamp(m.Speed, 0, ShipMaxSpeed),
					}
					room.AppendShipWaypoint(p.Ship, wp)
				}
				room.Mu.Unlock()
			case "update_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.UpdateShipWaypoint(p.Ship, m.Index, m.Speed)
				}
				room.Mu.Unlock()
			case "delete_waypoint":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.DeleteShipWaypointsFrom(p.Ship, m.Index)
				}
				room.Mu.Unlock()
			case "clear_waypoints":
				room.Mu.Lock()
				if p := room.Players[playerID]; p != nil {
					room.ClearShipWaypoints(p.Ship)
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
					point := Vec2{X: Clamp(m.X, 0, WorldW), Y: Clamp(m.Y, 0, WorldH)}
					p.AddWaypointToRoute(routeID, point)
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
					var waypoints []Vec2
					if route := p.MissileRouteByID(routeID); route != nil {
						waypoints = append([]Vec2(nil), route.Waypoints...)
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
					if tr := room.World.Transform(p.Ship); tr != nil {
						speed := tr.Vel.Len()
						if id := room.LaunchMissile(playerID, cfg, waypoints, tr.Pos, tr.Vel); id != 0 {
							p.MissileReadyAt = now + MissileCooldownForSpeed(speed)
						}
					}
				}
				room.Mu.Unlock()
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

				var meEntity EntityID
				var meTransform *Transform

				if p != nil {
					cfg := SanitizeMissileConfig(p.MissileConfig)
					p.MissileConfig = cfg
					p.EnsureMissileRoutes()
					missileCfg.Speed = cfg.Speed
					missileCfg.AgroRadius = cfg.AgroRadius
					missileCfg.Lifetime = cfg.Lifetime
					activeRouteID = p.ActiveMissileRouteID
					nextMissileReady = p.MissileReadyAt

					if route := p.ActiveMissileRoute(); route != nil {
						if len(route.Waypoints) > 0 {
							missileWaypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								missileWaypoints[i] = waypointDTO{X: wp.X, Y: wp.Y}
							}
						}
					}

					for _, route := range p.MissileRoutes {
						dto := missileRouteDTO{ID: route.ID, Name: route.Name}
						if len(route.Waypoints) > 0 {
							dto.Waypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								dto.Waypoints[i] = waypointDTO{X: wp.X, Y: wp.Y}
							}
						}
						missileRoutesDTO = append(missileRoutesDTO, dto)
					}

					meEntity = p.Ship
					if tr := room.World.Transform(meEntity); tr != nil {
						meTransform = tr
						shipData := room.World.ShipData(meEntity)
						history := room.World.HistoryComponent(meEntity)
						route := room.World.ShipRoute(meEntity)
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
						if route != nil && len(route.Waypoints) > 0 {
							meGhost.Waypoints = make([]waypointDTO, len(route.Waypoints))
							for i, wp := range route.Waypoints {
								meGhost.Waypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y, Speed: wp.Speed}
							}
						}
						if history != nil {
							meGhost.T = now
						}
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
					room.World.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner, CompHistory}, func(e EntityID) {
						if e == meEntity {
							return
						}
						owner := room.World.Owner(e)
						tr := room.World.Transform(e)
						hist := room.World.HistoryComponent(e)
						shipData := room.World.ShipData(e)
						if owner == nil || tr == nil || hist == nil || shipData == nil {
							return
						}
						d := mePos.Sub(tr.Pos).Len()
						tRet := now - (d / C)
						if snap, ok := hist.History.GetAt(tRet); ok {
							ghosts = append(ghosts, ghost{
								ID:   fmt.Sprintf("ship-%s", owner.PlayerID),
								X:    snap.Pos.X,
								Y:    snap.Pos.Y,
								VX:   snap.Vel.X,
								VY:   snap.Vel.Y,
								T:    tRet,
								HP:   shipData.HP,
								Self: false,
							})
						}
					})

					room.World.ForEach([]ComponentKey{CompTransform, CompMissile, CompOwner, CompHistory}, func(e EntityID) {
						owner := room.World.Owner(e)
						tr := room.World.Transform(e)
						hist := room.World.HistoryComponent(e)
						missile := room.World.MissileData(e)
						if owner == nil || tr == nil || hist == nil || missile == nil {
							return
						}
						d := mePos.Sub(tr.Pos).Len()
						tRet := now - (d / C)
						if tRet < missile.LaunchTime {
							return
						}
						if snap, ok := hist.History.GetAt(tRet); ok {
							targetID := ""
							if missile.Target != 0 {
								if targetOwner := room.World.Owner(missile.Target); targetOwner != nil {
									targetID = fmt.Sprintf("ship-%s", targetOwner.PlayerID)
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
								T:          tRet,
								AgroRadius: missile.AgroRadius,
								Lifetime:   missile.Lifetime,
								LaunchTime: missile.LaunchTime,
								ExpiresAt:  missile.LaunchTime + missile.Lifetime,
								TargetID:   targetID,
							})
						}
					})
				}

				room.Mu.Unlock()

				msg := stateMsg{
					Type:               "state",
					Now:                now,
					Me:                 meGhost,
					Ghosts:             ghosts,
					Meta:               roomMeta{C: C, W: WorldW, H: WorldH},
					Missiles:           missiles,
					MissileConfig:      missileCfg,
					MissileWaypoints:   missileWaypoints,
					MissileRoutes:      missileRoutesDTO,
					ActiveMissileRoute: activeRouteID,
					NextMissileReady:   nextMissileReady,
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
