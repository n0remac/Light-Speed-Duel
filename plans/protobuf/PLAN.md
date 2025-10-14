# WebSocket Protobuf Migration Plan

## Overview

This plan outlines the migration from JSON to Protocol Buffers for Light Speed Duel's WebSocket communication. The migration is divided into three phases to minimize risk and ensure a smooth transition.

## Goals

- **Performance**: Reduce bandwidth usage by 30-50%
- **Type Safety**: Strong typing on both Go and TypeScript
- **Maintainability**: Single source of truth for message schemas
- **Safety**: Zero downtime deployment with gradual rollout

## Non-Goals (Out of Scope)

- Compression (can be added later)
- gRPC or HTTP/2 (staying with WebSocket)
- Server-to-server communication (player-to-server only)
- Real-time schema evolution (static schemas per version)

## Three-Phase Approach

### Phase 1: Core Game State (Foundation)

**Status:** Ready to implement
**Estimated effort:** 22-31 hours
**Risk:** Low (well-defined scope)

Migrate the core real-time game state to protobuf:
- Ships/ghosts with positions, velocities, waypoints
- Missiles with targeting and heat
- Room metadata
- Heat system integration
- Basic client commands (waypoint ops, missile ops)

**Deliverables:**
- Protocol buffer schema for core messages
- Go and TypeScript code generation setup
- Backend conversion functions and handlers
- Frontend conversion functions and send helpers
- Integration tests
- Build tooling for proto generation

**Why Phase 1 first:**
- Core game state is most performance-sensitive
- Well-defined DTOs already exist
- No complex optional fields or branching logic
- Validates infrastructure before expanding

**Detailed plans:**
- [Phase 1 README](phase1/README.md) - Overview and goals
- [Phase 1 Protocol](phase1/protocol.md) - Proto schema design
- [Phase 1 Backend](phase1/backend.md) - Go implementation
- [Phase 1 Frontend](phase1/frontend.md) - TypeScript implementation

### Phase 2: Extended Systems (DAG, Inventory, Story)

**Status:** Ready to implement after Phase 1
**Estimated effort:** 27-36 hours
**Risk:** Medium (complex nested structures)

Extend the protocol to support campaign mode features:
- DAG progression system (crafting, story nodes)
- Inventory/crafting items with quantities
- Story/dialogue with choices and branching
- Mission-specific events (wave spawning, triggers)

**Deliverables:**
- Extended proto schema with enums and optional fields
- DAG/inventory/story conversion functions
- Updated handlers for new command types
- Campaign mode integration
- End-to-end testing of all subsystems

**Why Phase 2 second:**
- Builds on proven Phase 1 infrastructure
- Optional fields allow for backwards compatibility
- Campaign mode is isolated from core gameplay
- Can be tested independently

**Detailed plans:**
- [Phase 2 README](phase2/README.md) - Overview and goals
- [Phase 2 Protocol](phase2/protocol.md) - Schema extensions
- [Phase 2 Backend](phase2/backend.md) - Go implementation
- [Phase 2 Frontend](phase2/frontend.md) - TypeScript implementation

### Phase 3: Production Rollout (Safety & Optimization)

**Status:** Ready to implement after Phase 2
**Estimated effort:** 23-34 hours + 1-2 weeks rollout
**Risk:** Medium (production deployment)

Safe deployment with monitoring and rollback capabilities:
- Protocol version negotiation
- Feature flags for gradual rollout (10% → 25% → 50% → 100%)
- Performance monitoring and optimization
- Backwards compatibility layer
- Load testing and benchmarking
- Documentation for operations

**Deliverables:**
- Version negotiation handshake
- Feature flag system with config
- Monitoring instrumentation
- Performance optimizations (pooling, batching)
- Load testing scripts
- Rollback procedures
- Deployment documentation

**Why Phase 3 last:**
- Requires both Phase 1 and 2 to be complete
- Focuses on operational concerns, not features
- Allows for real-world testing before full rollout
- Ensures we can safely roll back if issues arise

**Detailed plans:**
- [Phase 3 README](phase3/README.md) - Comprehensive rollout guide

## Timeline & Resources

### Sequential Timeline (One Developer)

- **Phase 1:** 3-4 weeks
  - Protocol design: 1 week
  - Backend implementation: 1 week
  - Frontend implementation: 1 week
  - Testing: 3-4 days

- **Phase 2:** 3-5 weeks
  - Protocol extension: 1 week
  - Backend implementation: 1-2 weeks
  - Frontend implementation: 1-2 weeks
  - Testing: 3-4 days

- **Phase 3:** 3-5 weeks
  - Infrastructure: 1 week
  - Testing: 1 week
  - Gradual rollout: 1-2 weeks (mostly waiting/monitoring)
  - Documentation: 3-4 days

**Total:** 9-14 weeks (2-3.5 months)

### Parallel Timeline (Two Developers)

- **Phase 1:** 2-3 weeks (backend and frontend in parallel)
- **Phase 2:** 2-3 weeks (backend and frontend in parallel)
- **Phase 3:** 3-5 weeks (can't parallelize operations work)

**Total:** 7-11 weeks (1.5-2.5 months)

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Bundle size increase | Medium | High | Use tree-shakeable library, measure, optimize |
| Breaking changes | High | Low | Strict field numbering, use `buf breaking` |
| Performance regression | High | Low | Benchmark before/after, load test |
| Production issues | High | Low | Gradual rollout, feature flags, instant rollback |
| Complex nested types | Medium | Medium | Careful proto design, extensive testing |
| Developer learning curve | Low | Medium | Clear documentation, examples, pair programming |

## Success Criteria

### Phase 1 Success

- [ ] Binary WebSocket frames sent/received correctly
- [ ] Game plays identically to JSON version
- [ ] No increase in errors or disconnects
- [ ] Proto encoding/decoding < 1ms p99
- [ ] Code review approved by team

### Phase 2 Success

- [ ] Campaign mode works end-to-end with protobuf
- [ ] All DAG/inventory/story features functional
- [ ] No regressions in Phase 1 functionality
- [ ] Code coverage maintained or improved

### Phase 3 Success

- [ ] Deployed to production with zero downtime
- [ ] Bandwidth reduced by 30-50% (measured)
- [ ] No increase in player churn or support tickets
- [ ] Can safely remove JSON code after observation period

### Overall Success

- [ ] All players on protobuf protocol
- [ ] Message sizes reduced significantly
- [ ] Encode/decode performance acceptable
- [ ] Schema evolution process documented
- [ ] Team confident in making future proto changes

## Decision Log

### Why Protocol Buffers?

**Alternatives considered:**
- **JSON** (current): Easy to debug, but large and slow
- **MessagePack**: Smaller than JSON, but no schema validation
- **FlatBuffers**: Zero-copy, but overkill for our use case
- **Cap'n Proto**: Fast, but less tooling support

**Decision:** Protocol Buffers
- Best balance of performance and developer experience
- Excellent tooling (protoc, buf, IDE plugins)
- Strong typing in Go and TypeScript
- Industry standard with extensive documentation

### Why Three Phases?

**Alternative:** Big Bang Migration
- Implement everything at once
- Risk: High (all-or-nothing)
- Rollback: Difficult (large changeset)

**Decision:** Phased Approach
- Phase 1 validates infrastructure with low-risk scope
- Phase 2 adds complexity after foundation is solid
- Phase 3 ensures safe production deployment
- Each phase can be rolled back independently

### Why Not Compression?

Protocol Buffers already achieve significant size reduction. Adding compression (permessage-deflate) would:
- Add complexity to deployment (proxy configuration)
- Increase CPU usage (compression overhead)
- Reduce debuggability (can't inspect frames)

**Decision:** Defer compression to Phase 4 (only if needed)
- Measure Phase 1 results first
- If bandwidth still problematic, add compression
- Otherwise, stick with uncompressed protobuf

## Current DTO Inventory

See [original PLAN.md appendix](#appendix-current-dto-inventory-as-of-2025-10-14) below for complete list.

**Summary:**
- **19 DTO types** across Go and TypeScript
- **28 client→server command types**
- **2 server→client message types** (state update, errors)
- **5 major subsystems**: core game, missiles, heat, DAG, story

All have been analyzed and categorized by phase in the detailed plans.

## Getting Started

1. **Read Phase 1 README** to understand the foundation: [phase1/README.md](phase1/README.md)
2. **Review protocol design** to see the schema: [phase1/protocol.md](phase1/protocol.md)
3. **Set up development environment:**
   ```bash
   # Install protoc compiler
   brew install protobuf  # macOS
   # or: apt-get install protobuf-compiler  # Linux

   # Install Go plugin
   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest

   # Install TypeScript plugin
   npm install -g @bufbuild/protoc-gen-es

   # Install buf (optional, for linting)
   brew install bufbuild/buf/buf
   ```
4. **Start with Phase 1 backend implementation:** [phase1/backend.md](phase1/backend.md)

## Questions & Answers

**Q: Can we skip Phase 2 and only do core game state?**
A: Yes! Phase 1 is self-contained. Campaign mode can stay on JSON if desired.

**Q: What if we find a critical bug in production?**
A: Phase 3 includes instant rollback via feature flags (no code deployment needed).

**Q: How do we handle schema changes after deployment?**
A: Add new fields with new numbers (backwards compatible). Never delete or renumber existing fields. See Phase 3 documentation.

**Q: Will this break existing clients?**
A: No. Phase 3 uses version negotiation - old clients continue using JSON.

**Q: What about server-to-server communication?**
A: Out of scope. This plan only covers client-server WebSocket messages.

**Q: Can we use gRPC instead?**
A: No. WebSocket is required for browser support. gRPC-Web adds complexity without clear benefit for our use case.

---

## Appendix: Current DTO Inventory (as of 2025-10-14)

### Server → Client Messages

**stateMsg** (type: "state")
- `now` (float64): Server time
- `me` (ghost): Player's own ship
- `ghosts` ([]ghost): Other ships visible to player
- `meta` (roomMeta): Room constants (C, W, H)
- `missiles` ([]missileDTO): Visible missiles
- `missile_config` (missileConfigDTO): Current missile configuration
- `missile_waypoints` ([]waypointDTO): Active missile route waypoints
- `missile_routes` ([]missileRouteDTO): All saved missile routes
- `active_missile_route` (string): ID of active route
- `next_missile_ready` (float64): Cooldown timestamp
- `dag` (dagStateDTO, optional): DAG progression state
- `inventory` (inventoryDTO, optional): Player's items
- `story` (storyStateDTO, optional): Story/dialogue state

**Other server messages:**
- type: "full" - Room full error
- type: "dag_list" - Response with DAG state

### Client → Server Messages (wsMsg)

**Command types:**
- `join` - Join game (Name, Room, MapW, MapH)
- `spawn_bot` - Spawn AI opponent
- Ship waypoint ops: `add_waypoint`, `update_waypoint`, `move_waypoint`, `delete_waypoint`, `clear_waypoints`
- Missile config: `configure_missile` (MissileSpeed, MissileAgro)
- Missile waypoint ops: `add_missile_waypoint`, `update_missile_waypoint_speed`, `move_missile_waypoint`, `delete_missile_waypoint`, `clear_missile_route`
- Missile route ops: `add_missile_route`, `rename_missile_route`, `delete_missile_route`, `set_active_missile_route`
- `launch_missile` (RouteID)
- Mission ops: `mission_spawn_wave` (WaveIndex), `mission_story_event` (StoryEvent, StoryBeacon)
- DAG ops: `dag_start` (NodeID), `dag_cancel` (NodeID), `dag_story_ack` (NodeID, ChoiceID), `dag_list`

### Supporting DTOs

**Core game state:**
- `ghost` - Ship snapshot (ID, X, Y, VX, VY, T, Self, Waypoints, CurrentWaypointIndex, HP, Kills, Heat)
- `waypointDTO` - Position/speed (X, Y, Speed)
- `roomMeta` - Constants (C, W, H)

**Missiles:**
- `missileDTO` - Missile snapshot (ID, Owner, Self, X, Y, VX, VY, T, AgroRadius, Lifetime, LaunchTime, ExpiresAt, TargetID, Heat)
- `missileConfigDTO` - Config (Speed, SpeedMin, SpeedMax, AgroMin, AgroRadius, Lifetime, HeatConfig)
- `missileRouteDTO` - Saved route (ID, Name, Waypoints)

**Heat system:**
- `shipHeatViewDTO` - Heat state (V, M, W, O, MS, SU, KU, KD, EX) - abbreviated field names
- `heatParamsDTO` - Heat configuration (Max, WarnAt, OverheatAt, MarkerSpeed, KUp, KDown, Exp)

**DAG system:**
- `dagNodeDTO` - Node state (ID, Kind, Label, Status, RemainingS, DurationS, Repeatable)
- `dagStateDTO` - Full DAG (Nodes)

**Inventory:**
- `inventoryItemDTO` - Item stack (Type, VariantID, HeatCapacity, Quantity)
- `inventoryDTO` - Full inventory (Items)

**Story/dialogue:**
- `storyStateDTO` - Story state (ActiveNode, Dialogue, Available, Flags, Events)
- `storyDialogueDTO` - Dialogue content (Speaker, Text, Intent, ContinueLabel, Choices, TutorialTip)
- `storyDialogueChoiceDTO` - Choice option (ID, Text)
- `storyTutorialTipDTO` - Tutorial hint (Title, Text)
- `storyEventDTO` - Story event (ChapterID, NodeID, Timestamp)
