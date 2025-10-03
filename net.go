package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

/* ----------------------------- Networking ---------------------------- */

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
	MissileAccel float64 `json:"missile_accel,omitempty"`
	MissileAgro  float64 `json:"missile_agro,omitempty"`
}

type stateMsg struct {
	Type             string           `json:"type"` // "state"
	Now              float64          `json:"now"`
	Me               ghost            `json:"me"`
	Ghosts           []ghost          `json:"ghosts"`
	Meta             roomMeta         `json:"meta"`
	Missiles         []missileDTO     `json:"missiles"`
	MissileConfig    missileConfigDTO `json:"missile_config"`
	MissileWaypoints []waypointDTO    `json:"missile_waypoints"`
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
	T         float64       `json:"t"`    // snapshot time represented
	Self      bool          `json:"self"` // true for your own ship
	Waypoints []waypointDTO `json:"waypoints,omitempty"`
	HP        int           `json:"hp"`
}

type missileDTO struct {
	ID         string  `json:"id"`
	Owner      string  `json:"owner"`
	Self       bool    `json:"self"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	VX         float64 `json:"vx"`
	VY         float64 `json:"vy"`
	T          float64 `json:"t"`
	AgroRadius float64 `json:"agro_radius"`
	Lifetime   float64 `json:"lifetime"`
	LaunchTime float64 `json:"launch"`
	ExpiresAt  float64 `json:"expires"`
	TargetID   string  `json:"target_id,omitempty"`
}

type missileConfigDTO struct {
	Speed      float64 `json:"speed"`
	SpeedMin   float64 `json:"speed_min"`
	SpeedMax   float64 `json:"speed_max"`
	Accel      float64 `json:"accel"`
	AccelMin   float64 `json:"accel_min"`
	AccelLimit float64 `json:"accel_limit"`
	AgroRadius float64 `json:"agro_radius"`
	Lifetime   float64 `json:"lifetime"`
}

type waypointDTO struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Speed float64 `json:"speed"`
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
		sendTick: time.NewTicker(time.Duration(1000.0/updateRateHz) * time.Millisecond),
	}

	room := h.getRoom(roomID)
	playerID := randID("p")
	player := &Player{ID: playerID, Name: "Anon"}

	// Attach player and create ship
	room.mu.Lock()
	if len(room.Players) >= roomMaxPlayers {
		room.mu.Unlock()
		_ = conn.WriteJSON(map[string]any{"type": "full", "message": "room full"})
		conn.Close()
		return
	}
	defaultMissileSpeed := shipMaxSpeed * 0.75
	allowedAccel := missileAllowedAccelForSpeed(defaultMissileSpeed)
	player.MissileConfig = sanitizeMissileConfig(MissileConfig{
		Speed:      defaultMissileSpeed,
		Accel:      allowedAccel * 0.7,
		AgroRadius: 800,
	})
	player.MissileWaypoints = nil
	room.Players[playerID] = player

	shipID := randID("s")
	player.ShipID = shipID
	startPos := Vec2{
		X: (worldW * 0.25) + float64(len(room.Ships))*200.0,
		Y: (worldH * 0.5) + float64(len(room.Ships))*-200.0,
	}
	room.Ships[shipID] = &Ship{
		ID:        shipID,
		Owner:     playerID,
		Pos:       startPos,
		Vel:       Vec2{},
		Waypoints: nil,
		History:   newHistory(historyKeepS, simHz),
		HP:        shipMaxHP,
	}
	room.Ships[shipID].History.push(Snapshot{T: room.Now, Pos: startPos})
	room.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Reader
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
				room.mu.Lock()
				if p := room.Players[playerID]; p != nil {
					p.Name = name
				}
				room.mu.Unlock()
			case "add_waypoint":
				room.mu.Lock()
				if s := room.Ships[player.ShipID]; s != nil {
					wp := ShipWaypoint{
						Pos:   Vec2{X: clamp(m.X, 0, worldW), Y: clamp(m.Y, 0, worldH)},
						Speed: clamp(m.Speed, 0, shipMaxSpeed),
					}
					s.Waypoints = append(s.Waypoints, wp)
				}
				room.mu.Unlock()
			case "update_waypoint":
				room.mu.Lock()
				if s := room.Ships[player.ShipID]; s != nil {
					if m.Index >= 0 && m.Index < len(s.Waypoints) {
						s.Waypoints[m.Index].Speed = clamp(m.Speed, 0, shipMaxSpeed)
					}
				}
				room.mu.Unlock()
			case "delete_waypoint":
				room.mu.Lock()
				if s := room.Ships[player.ShipID]; s != nil {
					if m.Index >= 0 && m.Index < len(s.Waypoints) {
						s.Waypoints = s.Waypoints[:m.Index]
					}
				}
				room.mu.Unlock()
			case "configure_missile":
				room.mu.Lock()
				if p := room.Players[playerID]; p != nil {
					cfg := p.MissileConfig
					if m.MissileSpeed > 0 {
						cfg.Speed = m.MissileSpeed
					}
					if m.MissileAccel > 0 {
						cfg.Accel = m.MissileAccel
					}
					if m.MissileAgro >= 0 {
						cfg.AgroRadius = m.MissileAgro
					}
					p.MissileConfig = sanitizeMissileConfig(cfg)
				}
				room.mu.Unlock()
			case "add_missile_waypoint":
				room.mu.Lock()
				if p := room.Players[playerID]; p != nil {
					wp := MissileWaypoint{Pos: Vec2{X: clamp(m.X, 0, worldW), Y: clamp(m.Y, 0, worldH)}}
					p.MissileWaypoints = append(p.MissileWaypoints, wp)
				}
				room.mu.Unlock()
			case "delete_missile_waypoint":
				room.mu.Lock()
				if p := room.Players[playerID]; p != nil {
					if m.Index >= 0 && m.Index < len(p.MissileWaypoints) {
						p.MissileWaypoints = p.MissileWaypoints[:m.Index]
					}
				}
				room.mu.Unlock()
			case "launch_missile":
				room.mu.Lock()
				if p := room.Players[playerID]; p != nil {
					if ship := room.Ships[player.ShipID]; ship != nil {
						cfg := sanitizeMissileConfig(p.MissileConfig)
						missileID := randID("m")
						waypoints := make([]MissileWaypoint, len(p.MissileWaypoints))
						copy(waypoints, p.MissileWaypoints)
						miss := &Missile{
							ID:          missileID,
							Owner:       playerID,
							Pos:         ship.Pos,
							Vel:         ship.Vel,
							Waypoints:   waypoints,
							WaypointIdx: 0,
							ReturnIdx:   0,
							Config:      cfg,
							LaunchTime:  room.Now,
							History:     newHistory(historyKeepS, simHz),
						}
						miss.History.push(Snapshot{T: room.Now, Pos: miss.Pos, Vel: miss.Vel})
						room.Missiles[missileID] = miss
					}
				}
				room.mu.Unlock()
			}
		}
	}()

	// Writer (per-client state with retarded opponents)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-lc.sendTick.C:
				room.mu.Lock()
				now := room.Now
				me := room.Ships[player.ShipID]
				var meGhost ghost
				if me != nil {
					meGhost = ghost{ID: me.ID, X: me.Pos.X, Y: me.Pos.Y, VX: me.Vel.X, VY: me.Vel.Y, T: now, Self: true, HP: me.HP}
					if len(me.Waypoints) > 0 {
						meGhost.Waypoints = make([]waypointDTO, len(me.Waypoints))
						for i, wp := range me.Waypoints {
							meGhost.Waypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y, Speed: wp.Speed}
						}
					}
				}
				var ghosts []ghost
				for _, s := range room.Ships {
					if s.Owner == playerID || me == nil {
						continue
					}
					D := me.Pos.Sub(s.Pos).Len()
					tRet := now - (D / c)
					if snap, ok := s.History.getAt(tRet); ok {
						ghosts = append(ghosts, ghost{
							ID: s.ID, X: snap.Pos.X, Y: snap.Pos.Y, VX: snap.Vel.X, VY: snap.Vel.Y, T: tRet, Self: false, HP: s.HP,
						})
					}
				}

				missileCfg := missileConfigDTO{
					SpeedMin:   missileMinSpeed,
					SpeedMax:   missileMaxSpeed,
					AccelMin:   missileMinAccel,
					AccelLimit: missileMinAccel,
				}
				var missileWaypoints []waypointDTO
				var missiles []missileDTO
				if p := room.Players[playerID]; p != nil {
					cfg := sanitizeMissileConfig(p.MissileConfig)
					p.MissileConfig = cfg
					missileCfg.Speed = cfg.Speed
					missileCfg.Accel = cfg.Accel
					missileCfg.AgroRadius = cfg.AgroRadius
					missileCfg.Lifetime = cfg.Lifetime
					missileCfg.AccelLimit = missileAllowedAccelForSpeed(cfg.Speed)
					if len(p.MissileWaypoints) > 0 {
						missileWaypoints = make([]waypointDTO, len(p.MissileWaypoints))
						for i, wp := range p.MissileWaypoints {
							missileWaypoints[i] = waypointDTO{X: wp.Pos.X, Y: wp.Pos.Y}
						}
					}
				}
				if missileCfg.Speed == 0 {
					missileCfg.Speed = missileMinSpeed
					missileCfg.Accel = missileMinAccel
					missileCfg.AgroRadius = 0
					missileCfg.Lifetime = missileLifetimeFor(missileMinSpeed, missileMinAccel)
					missileCfg.AccelLimit = missileAllowedAccelForSpeed(missileMinSpeed)
				}

				for _, miss := range room.Missiles {
					if me == nil {
						continue
					}
					D := me.Pos.Sub(miss.Pos).Len()
					tRet := now - (D / c)
					if snap, ok := miss.History.getAt(tRet); ok {
						missiles = append(missiles, missileDTO{
							ID:         miss.ID,
							Owner:      miss.Owner,
							Self:       miss.Owner == playerID,
							X:          snap.Pos.X,
							Y:          snap.Pos.Y,
							VX:         snap.Vel.X,
							VY:         snap.Vel.Y,
							T:          tRet,
							AgroRadius: miss.Config.AgroRadius,
							Lifetime:   miss.Config.Lifetime,
							LaunchTime: miss.LaunchTime,
							ExpiresAt:  miss.LaunchTime + miss.Config.Lifetime,
							TargetID:   miss.TargetShip,
						})
					}
				}
				room.mu.Unlock()

				msg := stateMsg{
					Type:             "state",
					Now:              now,
					Me:               meGhost,
					Ghosts:           ghosts,
					Meta:             roomMeta{C: c, W: worldW, H: worldH},
					Missiles:         missiles,
					MissileConfig:    missileCfg,
					MissileWaypoints: missileWaypoints,
				}
				_ = conn.WriteJSON(msg)
			}
		}
	}()

	// Cleanup
	<-ctx.Done()
	lc.sendTick.Stop()
	conn.Close()
	room.mu.Lock()
	delete(room.Players, playerID)
	for id, s := range room.Ships {
		if s.Owner == playerID {
			delete(room.Ships, id)
		}
	}
	for id, miss := range room.Missiles {
		if miss.Owner == playerID {
			delete(room.Missiles, id)
		}
	}
	room.mu.Unlock()
}
