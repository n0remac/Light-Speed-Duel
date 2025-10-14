# Phase 1: Backend Implementation (Go)

## Overview

Update the Go WebSocket server to send/receive protobuf binary messages instead of JSON.

## Prerequisites

- Protobuf schema defined (`proto/ws_messages.proto`)
- Go code generated (`internal/proto/ws/ws_messages.pb.go`)
- `google.golang.org/protobuf/proto` package installed

## File Changes

### Files to modify:
- `internal/server/ws.go` - WebSocket handlers
- `internal/server/dto.go` - May be deprecated or kept for internal use

### Files to create:
- `internal/server/proto_convert.go` - Conversion utilities between internal types and proto messages

## Implementation Steps

### 1. Add Proto Package Import

```go
// internal/server/ws.go
import (
    pb "LightSpeedDuel/internal/proto/ws"
    "google.golang.org/protobuf/proto"
    "github.com/gorilla/websocket"
)
```

### 2. Create Conversion Utilities

Create `internal/server/proto_convert.go`:

```go
package server

import (
    "LightSpeedDuel/internal/game"
    pb "LightSpeedDuel/internal/proto/ws"
)

// Convert internal ghost struct to protobuf message
func ghostToProto(g ghost) *pb.Ghost {
    msg := &pb.Ghost{
        Id:                   g.ID,
        X:                    g.X,
        Y:                    g.Y,
        Vx:                   g.VX,
        Vy:                   g.VY,
        T:                    g.T,
        Self:                 g.Self,
        CurrentWaypointIndex: int32(g.CurrentWaypointIndex),
        Hp:                   int32(g.HP),
        Kills:                int32(g.Kills),
    }

    // Convert waypoints
    if len(g.Waypoints) > 0 {
        msg.Waypoints = make([]*pb.Waypoint, len(g.Waypoints))
        for i, wp := range g.Waypoints {
            msg.Waypoints[i] = &pb.Waypoint{
                X:     wp.X,
                Y:     wp.Y,
                Speed: wp.Speed,
            }
        }
    }

    // Convert heat data
    if g.Heat != nil {
        msg.Heat = &pb.ShipHeatView{
            V:  g.Heat.V,
            M:  g.Heat.M,
            W:  g.Heat.W,
            O:  g.Heat.O,
            Ms: g.Heat.MS,
            Su: g.Heat.SU,
            Ku: g.Heat.KU,
            Kd: g.Heat.KD,
            Ex: g.Heat.EX,
        }
    }

    return msg
}

// Convert internal missile to protobuf message
func missileToProto(m missileDTO) *pb.Missile {
    msg := &pb.Missile{
        Id:         m.ID,
        Owner:      m.Owner,
        Self:       m.Self,
        X:          m.X,
        Y:          m.Y,
        Vx:         m.VX,
        Vy:         m.VY,
        T:          m.T,
        AgroRadius: m.AgroRadius,
        Lifetime:   m.Lifetime,
        LaunchTime: m.LaunchTime,
        ExpiresAt:  m.ExpiresAt,
        TargetId:   m.TargetID,
    }

    if m.Heat != nil {
        msg.Heat = &pb.ShipHeatView{
            V:  m.Heat.V,
            M:  m.Heat.M,
            W:  m.Heat.W,
            O:  m.Heat.O,
            Ms: m.Heat.MS,
            Su: m.Heat.SU,
            Ku: m.Heat.KU,
            Kd: m.Heat.KD,
            Ex: m.Heat.EX,
        }
    }

    return msg
}

// Convert internal stateMsg to protobuf StateUpdate
func stateToProto(s stateMsg) *pb.StateUpdate {
    msg := &pb.StateUpdate{
        Now:                s.Now,
        Me:                 ghostToProto(s.Me),
        Meta:               &pb.RoomMeta{C: s.Meta.C, W: s.Meta.W, H: s.Meta.H},
        ActiveMissileRoute: s.ActiveMissileRoute,
        NextMissileReady:   s.NextMissileReady,
    }

    // Convert ghosts
    msg.Ghosts = make([]*pb.Ghost, len(s.Ghosts))
    for i, g := range s.Ghosts {
        msg.Ghosts[i] = ghostToProto(g)
    }

    // Convert missiles
    msg.Missiles = make([]*pb.Missile, len(s.Missiles))
    for i, m := range s.Missiles {
        msg.Missiles[i] = missileToProto(m)
    }

    // Convert missile config
    msg.MissileConfig = &pb.MissileConfig{
        Speed:      s.MissileConfig.Speed,
        SpeedMin:   s.MissileConfig.SpeedMin,
        SpeedMax:   s.MissileConfig.SpeedMax,
        AgroMin:    s.MissileConfig.AgroMin,
        AgroRadius: s.MissileConfig.AgroRadius,
        Lifetime:   s.MissileConfig.Lifetime,
    }

    if s.MissileConfig.HeatConfig != nil {
        msg.MissileConfig.HeatConfig = &pb.HeatParams{
            Max:         s.MissileConfig.HeatConfig.Max,
            WarnAt:      s.MissileConfig.HeatConfig.WarnAt,
            OverheatAt:  s.MissileConfig.HeatConfig.OverheatAt,
            MarkerSpeed: s.MissileConfig.HeatConfig.MarkerSpeed,
            KUp:         s.MissileConfig.HeatConfig.KUp,
            KDown:       s.MissileConfig.HeatConfig.KDown,
            Exp:         s.MissileConfig.HeatConfig.Exp,
        }
    }

    // Convert missile waypoints
    msg.MissileWaypoints = make([]*pb.Waypoint, len(s.MissileWaypoints))
    for i, wp := range s.MissileWaypoints {
        msg.MissileWaypoints[i] = &pb.Waypoint{X: wp.X, Y: wp.Y, Speed: wp.Speed}
    }

    // Convert missile routes
    msg.MissileRoutes = make([]*pb.MissileRoute, len(s.MissileRoutes))
    for i, route := range s.MissileRoutes {
        msg.MissileRoutes[i] = &pb.MissileRoute{
            Id:   route.ID,
            Name: route.Name,
        }
        if len(route.Waypoints) > 0 {
            msg.MissileRoutes[i].Waypoints = make([]*pb.Waypoint, len(route.Waypoints))
            for j, wp := range route.Waypoints {
                msg.MissileRoutes[i].Waypoints[j] = &pb.Waypoint{X: wp.X, Y: wp.Y, Speed: wp.Speed}
            }
        }
    }

    return msg
}
```

### 3. Update WebSocket Send Logic

Replace JSON encoding with protobuf:

```go
// OLD: conn.WriteJSON(msg)

// NEW:
func sendProtoMessage(conn *websocket.Conn, payload proto.Message) error {
    // Wrap in envelope
    var envelope pb.WsEnvelope

    switch msg := payload.(type) {
    case *pb.StateUpdate:
        envelope.Payload = &pb.WsEnvelope_StateUpdate{StateUpdate: msg}
    case *pb.RoomFullError:
        envelope.Payload = &pb.WsEnvelope_RoomFull{RoomFull: msg}
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
```

Update state sending loop in `serveWS()`:

```go
// Around line 997 in ws.go
// OLD: _ = conn.WriteJSON(msg)

// NEW:
stateProto := stateToProto(msg)
if err := sendProtoMessage(conn, stateProto); err != nil {
    log.Printf("send error: %v", err)
    return
}
```

### 4. Update WebSocket Receive Logic

Replace JSON decoding with protobuf:

```go
// Around line 286 in ws.go
go func() {
    defer cancel()
    for {
        msgType, data, err := conn.ReadMessage()
        if err != nil {
            return
        }

        // Only accept binary messages
        if msgType != websocket.BinaryMessage {
            log.Printf("unexpected message type: %v", msgType)
            continue
        }

        // Decode envelope
        var envelope pb.WsEnvelope
        if err := proto.Unmarshal(data, &envelope); err != nil {
            log.Printf("unmarshal error: %v", err)
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
        // ... other cases
        default:
            log.Printf("unknown payload type: %T", payload)
        }
    }
}()
```

### 5. Extract Handler Functions

Refactor the giant switch statement into individual handler functions:

```go
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

// ... more handlers for each message type
```

This makes the code more maintainable and testable.

### 6. Handle Room Full Error

```go
// Around line 230 in ws.go
// OLD:
_ = conn.WriteJSON(map[string]any{"type": "full", "message": "room full"})

// NEW:
sendProtoMessage(conn, &pb.RoomFullError{Message: "room full"})
conn.Close()
return
```

### 7. Add Logging/Debugging Utilities

```go
// Helper for development debugging
func logProtoMessage(msg proto.Message) {
    if os.Getenv("DEBUG_PROTO") != "1" {
        return
    }

    // Pretty-print the message
    fmt.Println(prototext.Format(msg))
}
```

## Testing

### Unit Tests

Create `internal/server/proto_convert_test.go`:

```go
func TestGhostToProto(t *testing.T) {
    g := ghost{
        ID: "ship-123",
        X: 100.0,
        Y: 200.0,
        HP: 3,
    }

    proto := ghostToProto(g)

    assert.Equal(t, "ship-123", proto.Id)
    assert.Equal(t, 100.0, proto.X)
    assert.Equal(t, 200.0, proto.Y)
    assert.Equal(t, int32(3), proto.Hp)
}

func TestStateToProtoRoundTrip(t *testing.T) {
    // Create a stateMsg
    state := stateMsg{
        Type: "state",
        Now: 123.45,
        Me: ghost{ID: "me", X: 1, Y: 2},
        // ... fill out other fields
    }

    // Convert to proto
    protoState := stateToProto(state)

    // Verify fields
    assert.Equal(t, 123.45, protoState.Now)
    assert.Equal(t, "me", protoState.Me.Id)
}
```

### Integration Test

Create `cmd/proto_demo/main.go`:

```go
package main

import (
    "fmt"
    "net/http"
    "net/http/httptest"

    "LightSpeedDuel/internal/server"
    pb "LightSpeedDuel/internal/proto/ws"
    "google.golang.org/protobuf/proto"
    "github.com/gorilla/websocket"
)

func main() {
    // Start test server
    hub := server.NewHub()
    go hub.Run()

    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        server.serveWS(hub, w, r)
    }))
    defer srv.Close()

    // Connect client
    wsURL := "ws" + srv.URL[4:] + "?room=test"
    conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
    if err != nil {
        panic(err)
    }
    defer conn.Close()

    // Send join message
    envelope := pb.WsEnvelope{
        Payload: &pb.WsEnvelope_Join{
            Join: &pb.ClientJoin{
                Name: "TestPlayer",
                Room: "test",
            },
        },
    }

    data, _ := proto.Marshal(&envelope)
    conn.WriteMessage(websocket.BinaryMessage, data)

    // Read state update
    _, respData, err := conn.ReadMessage()
    if err != nil {
        panic(err)
    }

    var respEnvelope pb.WsEnvelope
    proto.Unmarshal(respData, &respEnvelope)

    if state := respEnvelope.GetStateUpdate(); state != nil {
        fmt.Printf("Received state update: now=%.2f\n", state.Now)
        fmt.Printf("Player position: (%.0f, %.0f)\n", state.Me.X, state.Me.Y)
        fmt.Println("✓ Round-trip successful")
    }
}
```

Run with: `go run ./cmd/proto_demo`

## Performance Considerations

- Reuse proto message objects instead of allocating new ones each frame (use `proto.Reset()`)
- Consider object pooling for high-frequency messages (StateUpdate sent 20x/sec)
- Profile memory allocations: `go test -bench=. -benchmem`

## Rollback Plan

Keep DTOs and JSON encoding as fallback:
- Don't delete `dto.go` immediately
- Add feature flag to toggle between JSON and protobuf
- If critical bugs found, revert to JSON

## Checklist

- [ ] Create `internal/server/proto_convert.go` with conversion functions
- [ ] Update `serveWS()` to send binary messages
- [ ] Update `serveWS()` receive loop to decode binary messages
- [ ] Refactor switch statement into handler functions
- [ ] Add unit tests for conversion functions
- [ ] Create integration test in `cmd/proto_demo`
- [ ] Test with real browser client
- [ ] Profile performance and memory usage
- [ ] Document new WebSocket protocol in code comments

## Next Steps

After backend implementation is complete and tested:
- Proceed to frontend implementation (frontend.md)
- Set up continuous integration to regenerate protos on schema changes
