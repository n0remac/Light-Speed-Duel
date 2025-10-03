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
	X float64 `json:"x,omitempty"`
	Y float64 `json:"y,omitempty"`
}

type stateMsg struct {
	Type   string   `json:"type"` // "state"
	Now    float64  `json:"now"`
	Me     ghost    `json:"me"`
	Ghosts []ghost  `json:"ghosts"`
	Meta   roomMeta `json:"meta"`
}

type roomMeta struct {
	C float64 `json:"c"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type ghost struct {
	ID   string  `json:"id"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	VX   float64 `json:"vx"`
	VY   float64 `json:"vy"`
	T    float64 `json:"t"`    // snapshot time represented
	Self bool    `json:"self"` // true for your own ship
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
	room.Players[playerID] = player

	shipID := randID("s")
	player.ShipID = shipID
	startPos := Vec2{
		X: (worldW * 0.25) + float64(len(room.Ships))*200.0,
		Y: (worldH * 0.5) + float64(len(room.Ships))*-200.0,
	}
	room.Ships[shipID] = &Ship{
		ID:       shipID,
		Owner:    playerID,
		Pos:      startPos,
		Vel:      Vec2{},
		Waypoint: startPos,
		History:  newHistory(historyKeepS, simHz),
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
			case "waypoint":
				room.mu.Lock()
				if s := room.Ships[player.ShipID]; s != nil {
					s.Waypoint = Vec2{X: clamp(m.X, 0, worldW), Y: clamp(m.Y, 0, worldH)}
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
					meGhost = ghost{ID: me.ID, X: me.Pos.X, Y: me.Pos.Y, VX: me.Vel.X, VY: me.Vel.Y, T: now, Self: true}
				}
				var ghosts []ghost
				for _, s := range room.Ships {
					if s.Owner == playerID {
						continue
					}
					D := me.Pos.Sub(s.Pos).Len()
					tRet := now - (D / c)
					if snap, ok := s.History.getAt(tRet); ok {
						ghosts = append(ghosts, ghost{
							ID: s.ID, X: snap.Pos.X, Y: snap.Pos.Y, VX: snap.Vel.X, VY: snap.Vel.Y, T: tRet, Self: false,
						})
					}
				}
				room.mu.Unlock()

				msg := stateMsg{
					Type:   "state",
					Now:    now,
					Me:     meGhost,
					Ghosts: ghosts,
					Meta:   roomMeta{C: c, W: worldW, H: worldH},
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
	room.mu.Unlock()
}
