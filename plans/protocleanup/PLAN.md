# Protobuf Cleanup Plan

## Overview

This plan outlines the cleanup tasks to remove legacy JSON networking code and optimize the Protobuf implementation. The core migration is complete and functional - these are optimization and maintenance tasks.

## Status

**Migration Status:** ✅ Complete and Functional

**Current Efficiency:** 8.5/10
- 60% bandwidth reduction vs JSON
- 3-5x faster serialization
- All active networking uses Protobuf

## Cleanup Tasks

### Phase 1: Remove Dead Code (High Priority)

#### Task 1.1: Clean up Frontend Message Handlers

**File:** `internal/server/web/src/net.ts`

**Remove:**
1. `handleStateMessage()` function (lines 485-659)
   - Legacy JSON state handler
   - Never called (server only sends Protobuf)

2. `safeParse()` function (lines 868-876)
   - JSON parsing helper
   - No longer needed

3. JSON fallback in WebSocket message handler (lines 471-481)
   ```typescript
   // Fall back to JSON for legacy/DAG messages
   const data = safeParse(event.data);
   if (!data || data.type !== "state") return;
   handleStateMessage(...);
   ```

4. JSON fallback in `sendMessage()` (lines 328-331)
   ```typescript
   // Fall back to JSON for DAG, mission, and other messages
   const data = typeof payload === "string" ? payload : JSON.stringify(payload);
   ws.send(data);
   ```

**Keep:**
- Protobuf message handler (lines 440-469)
- `handleProtoStateMessage()` function (lines 662-830)
- `sendProto()` helper
- All DAG/mission Protobuf sending functions

**Estimated Impact:**
- Remove ~200 lines of dead code
- Improve code clarity
- No runtime impact (code already unreachable)

#### Task 1.2: Remove Legacy TypeScript Interfaces

**File:** `internal/server/web/src/net.ts`

**Remove unused interfaces:**
1. `ServerStateMessage` (lines 59-133)
2. `ServerShipState` (lines 38-48)
3. `ServerMissileState` (lines 50-57)
4. `ServerMissileWaypoint` (lines 14-18)
5. `ServerMissileRoute` (lines 20-24)
6. `ServerHeatView` (lines 26-36)

**Keep:**
- All imports from proto files
- All conversion functions in `proto_helpers.ts`

**Estimated Impact:**
- Remove ~75 lines of unused type definitions
- Reduce confusion about which types to use

### Phase 2: Clean Up Backend DTOs (Medium Priority)

#### Task 2.1: Remove Unused JSON Tags

**File:** `internal/server/ws.go`

**Change:** Remove JSON tags from `stateMsg` struct (lines 116-131)

Before:
```go
type stateMsg struct {
    Type               string            `json:"type"`
    Now                float64           `json:"now"`
    Me                 ghost             `json:"me"`
    // ... etc
}
```

After:
```go
type stateMsg struct {
    Type               string
    Now                float64
    Me                 ghost
    // ... etc
}
```

**Rationale:**
- Struct is only used internally
- Never marshaled to JSON
- Only converted to Protobuf via `stateToProto()`

**Impact:**
- Clearer intent (not a JSON DTO)
- No runtime change

#### Task 2.2: Remove JSON Tags from Internal DTOs

**File:** `internal/server/dto.go`

**Remove JSON tags from:**
1. `missileDTO` (lines 4-19)
2. `missileConfigDTO` (lines 21-29)
3. `heatParamsDTO` (lines 32-40)
4. `missileRouteDTO` (lines 42-46)
5. `waypointDTO` (lines 48-52)
6. `shipHeatViewDTO` (lines 54-64)
7. `dagNodeDTO` (lines 67-75)
8. `dagStateDTO` (lines 78-80)
9. `inventoryItemDTO` (lines 83-88)
10. `inventoryDTO` (lines 91-93)
11. `storyDialogueChoiceDTO` (lines 96-99)
12. `storyTutorialTipDTO` (lines 102-105)
13. `storyDialogueDTO` (lines 108-115)

**Rationale:**
- These are internal Go structs
- Only used for intermediate representation
- Converted to Protobuf before sending
- Never marshaled to JSON

**Impact:**
- Clearer separation of concerns
- Reduces confusion about serialization format
- No runtime change

**Note:** Keep JSON tags in:
- `internal/server/config.go` (used for config file loading)
- `internal/dag/state.go` (used for persistence/snapshots)

### Phase 3: Performance Optimization (Lower Priority)

#### Task 3.1: Direct Protobuf Construction

**File:** `internal/server/ws.go`

**Current Flow (lines 688-709):**
```go
// Build intermediate DTO
msg := stateMsg{
    Type: "state",
    Now: now,
    Me: meGhost,
    // ... etc
}

// Convert to protobuf
stateProto := stateToProto(msg)
if err := sendProtoMessage(conn, stateProto); err != nil {
    // ...
}
```

**Optimized Flow:**
```go
// Build protobuf directly
stateProto := &pb.StateUpdate{
    Now: now,
    Me: ghostToProto(meGhost),
    // ... etc
}

if err := sendProtoMessage(conn, stateProto); err != nil {
    // ...
}
```

**Changes Required:**
1. Modify game loop in `serveWS()` to build Protobuf directly
2. Build ghost, missile, and other submessages in place
3. Remove intermediate `msg := stateMsg{...}` construction

**Benefits:**
- Eliminates one memory allocation per frame
- 20Hz updates = 20 allocations/sec per player saved
- Reduces GC pressure
- ~5-10% performance improvement in hot path

**Estimated Effort:**
- Medium complexity (refactor game loop)
- High impact (main update loop)

**Risk:**
- Moderate (touching critical hot path)
- Mitigation: Thorough testing, benchmark before/after

### Phase 4: Schema Improvements (Future Work)

#### Task 4.1: Improve Field Naming in Proto Schema

**File:** `proto/ws_messages.proto`

**Current Issue:** Abbreviated field names in `ShipHeatView` (lines 248-258)
```protobuf
message ShipHeatView {
  double v = 1;   // value
  double m = 2;   // max
  double w = 3;   // warnAt
  // etc
}
```

**Recommendation for Future Messages:**
Use descriptive field names:
```protobuf
message ShipHeatView {
  double value = 1;
  double max = 2;
  double warn_at = 3;
  // etc
}
```

**Note:**
- DO NOT change existing messages (breaks wire compatibility)
- Apply to new messages only
- Add comments documenting abbreviations

**Impact:**
- Improved schema readability
- Easier onboarding for new developers
- Better self-documenting code

## Implementation Order

### Sprint 1: Remove Dead Code
- [ ] Task 1.1: Clean up frontend message handlers
- [ ] Task 1.2: Remove legacy TypeScript interfaces
- **Risk:** Low
- **Testing:** Verify game still connects and runs
- **Estimated Time:** 1-2 hours

### Sprint 2: Clean Up DTOs
- [ ] Task 2.1: Remove JSON tags from `stateMsg`
- [ ] Task 2.2: Remove JSON tags from internal DTOs
- **Risk:** Very Low (cosmetic changes)
- **Testing:** Build verification
- **Estimated Time:** 1 hour

### Sprint 3: Performance Optimization (Optional)
- [ ] Task 3.1: Direct Protobuf construction
- **Risk:** Medium (critical path)
- **Testing:**
  - Full game testing
  - Performance benchmarks
  - Memory profiling
- **Estimated Time:** 3-4 hours

### Future: Schema Improvements
- [ ] Task 4.1: Document field naming standards
- **Risk:** Low (documentation only)
- **Testing:** N/A
- **Estimated Time:** 30 minutes

## Testing Strategy

### Phase 1 Testing (Dead Code Removal)
1. **Unit Tests:** Ensure TypeScript compiles
2. **Integration Tests:**
   - Connect to server
   - Verify state updates received
   - Test all message types (waypoints, missiles, DAG)
3. **Manual Testing:**
   - Open multiple clients
   - Spawn bots
   - Launch missiles
   - Verify campaign mode

### Phase 2 Testing (DTO Cleanup)
1. **Build Verification:** Go builds successfully
2. **Smoke Test:** Game runs without errors

### Phase 3 Testing (Performance)
1. **Benchmarks:**
   ```bash
   go test -bench=BenchmarkStateUpdate -benchmem
   ```
2. **Load Testing:** Multiple clients (5-10 players)
3. **Memory Profiling:**
   ```bash
   go tool pprof http://localhost:8080/debug/pprof/heap
   ```
4. **Regression Testing:** Full game functionality

## Success Metrics

### Code Quality
- [ ] 275+ lines of dead code removed
- [ ] Zero JSON tags in internal DTOs
- [ ] Improved code clarity and maintainability

### Performance (Phase 3 only)
- [ ] 5-10% reduction in allocations/second
- [ ] Measurable GC pressure reduction
- [ ] No degradation in gameplay responsiveness

### Stability
- [ ] No new bugs introduced
- [ ] All existing features work
- [ ] No performance regressions

## Rollback Plan

### Phase 1 & 2 (Low Risk)
- Git revert commit
- Rebuild and deploy

### Phase 3 (Medium Risk)
- Keep `stateMsg` intermediate DTO as fallback
- Use feature flag or build tag
- Monitor performance metrics
- Quick revert if issues detected

## Notes

### JSON Usage to Keep
These are **legitimate** uses of JSON (do not remove):

**Backend:**
- `internal/server/config.go` - Configuration file loading
- `internal/dag/state.go` - DAG state persistence/snapshots

**Frontend:**
- `tutorial/storage.ts` - LocalStorage persistence
- `story/storage.ts` - Story progress persistence
- `mission/controller.ts` - Mission state persistence

### Wire Protocol Compatibility
- DO NOT modify existing Protobuf field numbers
- DO NOT remove Protobuf fields (mark deprecated instead)
- Use `optional` for new nullable fields
- Maintain backward compatibility

## References

- **Protobuf Schema:** `proto/ws_messages.proto`
- **Go Conversion:** `internal/server/proto_convert.go`
- **TS Conversion:** `internal/server/web/src/proto_helpers.ts`
- **Network Handler:** `internal/server/ws.go`
- **Client Network:** `internal/server/web/src/net.ts`
- **Build Guide:** `PROTOBUF_GUIDE.md`
