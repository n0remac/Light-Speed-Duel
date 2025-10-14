# Phase 2: Extended Systems (DAG, Inventory, Story)

## Goals

Extend the protobuf protocol to support the DAG progression system, inventory/crafting, and story/dialogue features.

## Scope

**In scope:**
- DAG progression: node status, timing, start/cancel/ack commands
- Inventory: item types, quantities, heat capacity
- Story/dialogue: dialogue content, choices, flags, events
- Mission-specific events: wave spawning, story triggers

**Out of scope (deferred to Phase 3):**
- Protocol versioning
- Feature flags for gradual rollout
- Performance optimizations
- Backwards compatibility layer

## Success Criteria

- [ ] Proto schema extended with DAG, inventory, and story messages
- [ ] Server sends DAG/inventory/story data in state updates
- [ ] Client receives and displays DAG/inventory/story UI correctly
- [ ] Client can send DAG commands (start, cancel, ack)
- [ ] Client can trigger mission events (wave spawn, story events)
- [ ] Campaign mode works end-to-end with protobuf
- [ ] No regressions in existing Phase 1 functionality

## Dependencies

- Phase 1 complete and tested
- Understanding of DAG system (`internal/dag/`)
- Understanding of story system (`internal/server/web/src/story/`)
- Understanding of inventory system (in `internal/game/room.go`)

## Deliverables

1. Updated `proto/ws_messages.proto` with Phase 2 messages
2. Regenerated Go and TypeScript code
3. Updated backend conversion functions for new DTOs
4. Updated frontend conversion functions for new types
5. Updated WebSocket handlers for new command types
6. Integration tests for DAG, inventory, and story flows
7. Campaign mode end-to-end test

## Timeline Estimate

- Protocol design: 4-6 hours
- Code generation: 1-2 hours
- Backend implementation: 8-10 hours
- Frontend implementation: 8-10 hours
- Testing & debugging: 6-8 hours
- **Total: 27-36 hours**

## Risks

1. **Complex nested structures** - Story dialogue with choices/tips, DAG with timing
   - Mitigation: Carefully design proto messages to match existing DTOs
2. **Optional field handling** - Many fields are optional in Phase 2
   - Mitigation: Document optional semantics clearly, test nil/undefined cases
3. **State size explosion** - DAG + inventory + story adds significant data
   - Mitigation: Profile message sizes, consider pagination or lazy loading
4. **Breaking changes from Phase 1** - Extending schema may affect existing messages
   - Mitigation: Use `buf breaking` to detect issues, add new fields only (no deletions)

## Next Steps

After Phase 2 completion:
- Evaluate total message size and performance
- Document lessons learned
- Begin Phase 3 planning for versioning and rollout strategy
