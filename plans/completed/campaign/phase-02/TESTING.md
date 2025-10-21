# Phase 2 Testing & Validation

**Prerequisites**: All implementation tasks must be complete.

---

## Testing & Validation

### Integration Test Scenarios

1. **Mission Template Loading**:
   - Start server
   - Verify `GetTemplate("campaign-1")` returns valid template
   - Verify template validation passes

2. **Objective Evaluation**:
   - Spawn player at (0, 0)
   - Create DistanceEvaluator for (1000, 1000) with threshold 100
   - Move player toward target
   - Verify progress increases from 0.0 → 1.0
   - Verify complete=true when within threshold

3. **Mission Lifecycle**:
   - Join room with campaign mode
   - Verify `mission:offer` message received
   - Send `mission:accept` message
   - Verify mission starts and story node "intro" displays
   - Complete first beacon
   - Verify `mission:update` with increased progress
   - Verify story node "beacon-1-locked" displays

4. **Story DAG Integration**:
   - Start mission → verify "intro" node shows
   - Lock beacon 1 → verify "beacon-1-locked" shows with tutorial tip
   - Lock beacon 2 → verify "beacon-2-locked" shows with choice
   - Complete mission → verify "mission-complete" shows
   - Verify flags set: "encounter-1-briefed", "campaign-1-complete"

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Template schema drift between Go/TypeScript | High | Use shared JSON schema validation, add Go→JSON export for DTOs |
| Story DAG nodes reference invalid IDs | Medium | Add validation in `MissionTemplate.Validate()`, check node IDs exist |
| Legacy mission controller conflicts | Medium | Refactor incrementally, keep old beacon progress display, add feature flags |
| Objective evaluator performance | Low | Limit evaluation frequency (max 10Hz), cache entity queries |
| WebSocket message ordering | Medium | Add sequence numbers to mission updates, client ignores out-of-order |

---

## Success Metrics

- [ ] `go build` succeeds with no errors
- [ ] `go test ./internal/game` passes all tests
- [ ] Mission template registry loads campaign-1 successfully
- [ ] Client receives mission:offer on room join
- [ ] Objective progress updates visible in HUD in real-time
- [ ] Story nodes trigger on correct mission events
- [ ] No "Signal Static" references remain in codebase
- [ ] Mission completion triggers final story node and mission:completed event

---

## Notes for Future Phases

- **Persistence**: Phase 2 keeps all state in-memory. Phase 4 will add database persistence.
- **Mission Selection**: Phase 2 auto-starts campaign-1. Phase 3 will add mission selection UI.
- **Rewards**: Phase 2 defines reward hooks but doesn't implement reward system (Phase 4).
- **Failure Recovery**: Phase 2 adds mission:failed events but doesn't implement checkpoint system (Phase 3).
