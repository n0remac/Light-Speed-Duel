# Phase 3: Production Rollout & Optimization

## Goals

Deploy protobuf to production safely with version negotiation, feature flags, and performance optimizations.

## Scope

**In scope:**
- Protocol versioning and negotiation
- Feature flags for gradual rollout
- Performance monitoring and optimization
- Backwards compatibility layer
- Rollback mechanisms
- Documentation and tooling

**Out of scope:**
- Compression (consider for Phase 4 if needed)
- Advanced features like streaming or multiplexing

## Success Criteria

- [ ] Version negotiation handshake implemented
- [ ] Can deploy to production without downtime
- [ ] Can gradually enable protobuf for subset of users
- [ ] Can disable protobuf instantly if issues arise
- [ ] Monitoring shows performance improvements
- [ ] Zero data loss or corruption during rollout
- [ ] Documentation complete for proto update workflow

## Strategy Overview

Phase 3 focuses on **safe deployment** rather than new features. The key insight:

> Never force a breaking change. Always support old and new protocols simultaneously during transition.

## Version Negotiation

### Protocol Version Schema

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (field deletions, renumbering)
- **MINOR**: Backwards-compatible additions (new fields, new message types)
- **PATCH**: Bug fixes, no schema changes

Current versions:
- **1.0.0**: Phase 1 (core game state)
- **1.1.0**: Phase 2 (DAG/inventory/story)
- **1.2.0**: Phase 3 (no schema changes, just infrastructure)

### Handshake Protocol

#### Option 1: Query Parameter

Simplest approach - client declares version in WebSocket URL:

```
wss://server.com/ws?room=test&proto_version=1.1.0
```

**Backend:**
```go
func serveWS(h *Hub, w http.ResponseWriter, r *http.Request) {
    protoVersion := r.URL.Query().Get("proto_version")
    useProtobuf := protoVersion != "" // If present, use protobuf

    // ... existing code ...

    if useProtobuf {
        // Send binary messages
    } else {
        // Send JSON messages (legacy)
    }
}
```

**Frontend:**
```typescript
const protoVersion = '1.1.0';
const url = `wss://server.com/ws?room=${roomId}&proto_version=${protoVersion}`;
const ws = new WebSocket(url);
```

**Pros:**
- Simple to implement
- No extra round-trip
- Server knows client capability immediately

**Cons:**
- Can't negotiate - client declares, server accepts or rejects
- Requires deploying new client first

#### Option 2: First Message Negotiation

More flexible - first message is always JSON and declares capabilities:

```json
{
  "type": "hello",
  "protocol": "protobuf",
  "version": "1.1.0",
  "features": ["dag", "inventory", "story"]
}
```

Server responds:
```json
{
  "type": "hello_ack",
  "protocol": "protobuf",
  "version": "1.1.0",
  "features": ["dag", "inventory", "story"]
}
```

After handshake, switch to binary.

**Pros:**
- Can negotiate down if version mismatch
- Can deploy server first or client first
- Can advertise feature support

**Cons:**
- Extra round-trip adds latency
- More complex implementation
- First message still JSON (but only once)

**Recommendation:** Use Option 1 for simplicity. Version negotiation is mostly about detecting old clients, not true negotiation.

## Feature Flags

### Flag System

Use environment variables or config file to control rollout:

```yaml
# config.yaml
protobuf:
  enabled: true
  rollout_percentage: 50  # Enable for 50% of connections
  force_enable_rooms: ["test", "dev"]
  force_disable_rooms: ["tournament"]
```

**Backend implementation:**

```go
type ProtobufConfig struct {
    Enabled           bool
    RolloutPercentage int
    ForceEnableRooms  []string
    ForceDisableRooms []string
}

func shouldUseProtobuf(roomID string, clientVersion string, cfg ProtobufConfig) bool {
    // Check force disable
    for _, room := range cfg.ForceDisableRooms {
        if room == roomID {
            return false
        }
    }

    // Check force enable
    for _, room := range cfg.ForceEnableRooms {
        if room == roomID && clientVersion != "" {
            return true
        }
    }

    // Check global enable
    if !cfg.Enabled {
        return false
    }

    // Client must declare proto support
    if clientVersion == "" {
        return false
    }

    // Rollout percentage (stable hash of connection ID)
    hash := hashString(roomID + clientVersion)
    if hash%100 < cfg.RolloutPercentage {
        return true
    }

    return false
}
```

### Gradual Rollout Steps

1. **Deploy Phase 3 backend** with `enabled: false`
   - No behavior change, just infrastructure
   - Monitor for errors

2. **Deploy Phase 3 frontend** with version declaration
   - Old clients: No version → JSON
   - New clients: Sends version, but server ignores → JSON
   - Monitor bundle size, errors

3. **Enable for test rooms**: `force_enable_rooms: ["test", "dev"]`
   - Test thoroughly with real users
   - Monitor performance, errors, gameplay

4. **Enable 10% rollout**: `rollout_percentage: 10`
   - Monitor metrics (latency, bandwidth, errors, FPS)
   - Compare proto vs JSON cohorts

5. **Gradually increase**: 25% → 50% → 75% → 100%
   - Wait 24-48 hours between increases
   - Roll back if issues detected

6. **Remove JSON code** (several weeks later)
   - Only after 100% traffic on protobuf for extended period
   - Keep JSON code in version control for rollback

## Monitoring

### Metrics to Track

**Network metrics:**
- Avg message size (bytes) - Proto vs JSON
- Bandwidth (KB/s per connection)
- Message encode/decode time
- WebSocket frame rate

**Performance metrics:**
- Client FPS
- Server CPU usage
- Server memory usage
- GC pressure (Go) / heap size (JS)

**Reliability metrics:**
- Decode errors per connection
- Connection errors / disconnects
- Game logic errors

**Business metrics:**
- Player session duration
- Player churn rate
- Support tickets

### Instrumentation

**Backend logging:**

```go
func sendProtoMessage(conn *websocket.Conn, payload proto.Message) error {
    start := time.Now()
    data, err := proto.Marshal(envelope)
    marshalDuration := time.Since(start)

    metrics.RecordMessageSize("protobuf", len(data))
    metrics.RecordEncodeDuration("protobuf", marshalDuration)

    if os.Getenv("LOG_PROTO_MESSAGES") == "1" {
        log.Printf("[PROTO] Sent %T, size=%d, marshal_us=%d",
            payload, len(data), marshalDuration.Microseconds())
    }

    return conn.WriteMessage(websocket.BinaryMessage, data)
}
```

**Frontend logging:**

```typescript
const originalFromBinary = WsEnvelope.fromBinary;

WsEnvelope.fromBinary = function(bytes: Uint8Array): WsEnvelope {
  const start = performance.now();
  const envelope = originalFromBinary.call(this, bytes);
  const duration = performance.now() - start;

  if (window.ENABLE_PROTO_METRICS) {
    window.protoMetrics = window.protoMetrics || { sizes: [], durations: [] };
    window.protoMetrics.sizes.push(bytes.length);
    window.protoMetrics.durations.push(duration);
  }

  return envelope;
};
```

**Dashboard queries:**

```sql
-- Average message size by protocol
SELECT protocol, AVG(message_size_bytes) as avg_size
FROM websocket_messages
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY protocol;

-- Decode error rate
SELECT protocol,
       COUNT(*) FILTER (WHERE error IS NOT NULL) * 100.0 / COUNT(*) as error_rate_pct
FROM websocket_messages
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY protocol;
```

## Performance Optimization

### Backend Optimizations

#### Object Pooling

Reuse proto message objects:

```go
var stateUpdatePool = sync.Pool{
    New: func() interface{} {
        return &pb.StateUpdate{}
    },
}

func stateToProto(s stateMsg) *pb.StateUpdate {
    msg := stateUpdatePool.Get().(*pb.StateUpdate)
    msg.Reset() // Clear previous data

    // Populate fields
    msg.Now = s.Now
    // ...

    return msg
}

func sendProtoMessage(conn *websocket.Conn, payload proto.Message) error {
    // ... send message ...

    // Return to pool if StateUpdate
    if state, ok := payload.(*pb.StateUpdate); ok {
        stateUpdatePool.Put(state)
    }

    return nil
}
```

#### Batch Encoding

If sending to multiple connections, encode once:

```go
// Encode message once
data, err := proto.Marshal(envelope)
if err != nil {
    return err
}

// Send to all connections
for _, conn := range connections {
    conn.WriteMessage(websocket.BinaryMessage, data)
}
```

### Frontend Optimizations

#### Lazy Field Access

Don't convert entire proto message if not needed:

```typescript
// BAD: Convert everything upfront
const state = protoToState(proto); // Expensive

// GOOD: Convert on demand
function getGhosts() {
  return proto.ghosts.map(protoToGhost); // Only when needed
}
```

#### Structural Sharing

Reuse unchanged parts of state:

```typescript
let previousState: AppState;

function updateState(proto: StateUpdate): AppState {
  const newState = { ...previousState };

  // Only update changed parts
  if (proto.me) {
    newState.me = protoToGhost(proto.me);
  }

  if (proto.ghosts.length !== previousState.ghosts?.length) {
    newState.ghosts = proto.ghosts.map(protoToGhost);
  }

  previousState = newState;
  return newState;
}
```

## Backwards Compatibility

### Supporting Old Clients

Server must support both protocols simultaneously:

```go
type connection struct {
    ws          *websocket.Conn
    useProtobuf bool
    version     string
}

func (c *connection) sendState(state stateMsg) error {
    if c.useProtobuf {
        proto := stateToProto(state)
        return sendProtoMessage(c.ws, proto)
    } else {
        return c.ws.WriteJSON(state) // Legacy JSON
    }
}
```

### Deprecated Field Handling

Mark fields as deprecated in proto:

```protobuf
message Ghost {
  string id = 1;
  // ... other fields

  // Deprecated: Use waypoints instead
  string route_json = 100 [deprecated = true];
}
```

Continue populating deprecated fields for old clients:

```go
func ghostToProto(g ghost, clientVersion string) *pb.Ghost {
    msg := &pb.Ghost{
        Id: g.ID,
        // ... fields
    }

    // For clients < v1.1.0, also send legacy route_json
    if compareVersion(clientVersion, "1.1.0") < 0 {
        msg.RouteJson = legacySerializeRoute(g.Waypoints)
    }

    return msg
}
```

## Rollback Plan

### Fast Rollback (Minutes)

If critical bugs detected:

```bash
# Disable protobuf globally
kubectl set env deployment/game-server PROTOBUF_ENABLED=false

# Or update config
echo "protobuf:\n  enabled: false" > config.yaml
kubectl rollout restart deployment/game-server
```

No client changes needed - clients fall back to JSON automatically.

### Full Rollback (Hours)

If protobuf causes persistent issues:

1. Set `enabled: false` in config
2. Deploy previous backend version (before Phase 1)
3. Deploy previous frontend version (before Phase 1)
4. Delete proto generation from build pipeline
5. Remove proto packages from dependencies

## Documentation

### For Developers

Document proto update workflow:

```markdown
# Updating the Protocol

1. Edit `proto/ws_messages.proto`
2. Run `make proto` to regenerate code
3. Update conversion functions in `proto_convert.go` and `proto_helpers.ts`
4. Update handlers in `ws.go` and `net.ts`
5. Run tests: `make test-proto`
6. Commit generated code with proto changes
7. Bump version if adding fields (MINOR) or breaking (MAJOR)

## Breaking Changes

DON'T:
- Delete fields
- Rename fields
- Change field numbers
- Change field types

DO:
- Add new fields (with new numbers)
- Deprecate old fields (mark [deprecated = true])
- Add new message types (with new numbers in oneof)
```

### For Operations

Document deployment process:

```markdown
# Deploying Proto Changes

## Non-Breaking Changes (new fields)

1. Deploy backend first (reads old & new fields)
2. Wait 5 minutes, monitor errors
3. Deploy frontend (sends new fields)
4. Monitor metrics for 1 hour

## Rollout Controls

- Config: `config.yaml` → `protobuf.enabled`
- Env var: `PROTOBUF_ENABLED=true|false`
- Per-room: Add to `force_disable_rooms` list

## Rollback

Fast rollback (no code deploy):
kubectl set env deployment/game-server PROTOBUF_ENABLED=false

Full rollback (requires deploy):
git revert <commit>
make deploy
```

## Testing

### Load Testing

Before rollout, test with production-like load:

```bash
# Spin up load test
./scripts/load_test.sh --connections 1000 --duration 10m --protocol protobuf

# Compare to JSON baseline
./scripts/load_test.sh --connections 1000 --duration 10m --protocol json

# Check results
./scripts/compare_results.sh proto_test.json json_test.json
```

Verify:
- Protobuf bandwidth < JSON bandwidth (target: -30%)
- Protobuf encode time < 1ms p99
- Protobuf decode time < 1ms p99
- No increase in errors or connection drops

### Chaos Testing

Test rollback scenarios:

```bash
# Enable protobuf
kubectl set env deployment/game-server PROTOBUF_ENABLED=true

# Wait for rollout
kubectl rollout status deployment/game-server

# Inject decode errors
kubectl exec -it game-server-pod -- sh -c "INJECT_PROTO_ERRORS=1"

# Verify graceful degradation (falls back to JSON)

# Disable protobuf
kubectl set env deployment/game-server PROTOBUF_ENABLED=false

# Verify clients reconnect and switch to JSON
```

### A/B Testing

Compare proto vs JSON cohorts:

- Split traffic 50/50
- Measure FPS, latency, session duration
- Run for 1 week
- Analyze with statistical significance

## Timeline Estimate

- Version negotiation implementation: 4-6 hours
- Feature flag system: 2-4 hours
- Monitoring instrumentation: 4-6 hours
- Performance optimization: 6-8 hours
- Documentation: 3-4 hours
- Load testing: 4-6 hours
- Gradual rollout: 1-2 weeks (mostly waiting/monitoring)
- **Total: 23-34 hours + 1-2 weeks rollout time**

## Success Metrics

After full rollout to 100%, verify:

- [ ] Bandwidth reduced by 20-40%
- [ ] Message encode/decode time < 1ms p99
- [ ] No increase in error rates
- [ ] No increase in player churn
- [ ] No increase in support tickets
- [ ] Can safely remove JSON code

## Future Enhancements (Phase 4+)

- **Compression**: Add permessage-deflate or custom compression
- **Streaming**: Use gRPC for server-to-server communication
- **Multiplexing**: Multiple message types per frame
- **Delta updates**: Only send changed fields
- **Schema registry**: Centralized proto versioning across services

## Conclusion

Phase 3 is not about adding features - it's about **safe, gradual deployment**. The key principles:

1. **Always support old protocol** during transition
2. **Monitor everything** - metrics are critical
3. **Roll out gradually** - 10% → 25% → 50% → 100%
4. **Have a rollback plan** - must be able to disable instantly
5. **Test thoroughly** - load test, chaos test, A/B test

Only after Phase 3 is successful can we confidently remove JSON code and fully commit to protobuf.
