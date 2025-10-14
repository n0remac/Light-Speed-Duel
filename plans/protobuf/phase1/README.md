# Phase 1: Core Infrastructure & Basic Game State

## Goals

Establish the protobuf infrastructure and migrate the core real-time game state (ships, missiles, waypoints) from JSON to binary protocol buffers.

## Scope

**In scope:**
- Core game state: ships/ghosts, missiles, waypoints, routes
- Room metadata (C, W, H)
- Basic client commands: join, waypoint operations, missile operations
- Heat system (already integrated with ships/missiles)

**Out of scope (deferred to Phase 2):**
- DAG progression system
- Inventory/crafting
- Story/dialogue
- Mission-specific events

## Success Criteria

- [ ] Proto schema defined and generated for both Go and TypeScript
- [ ] Server sends binary WebSocket frames for state updates
- [ ] Client receives and decodes binary frames
- [ ] Client sends binary frames for commands
- [ ] Server receives and decodes binary commands
- [ ] Round-trip integration test passes
- [ ] Performance benchmarks show improvement over JSON
- [ ] No regressions in game functionality

## Dependencies

- `protoc` compiler installed
- `protoc-gen-go` plugin for Go code generation
- `@bufbuild/protobuf` or `ts-proto` for TypeScript generation
- `esbuild` configured to handle generated TypeScript modules

## Deliverables

1. `proto/ws_messages.proto` - Protocol buffer schema
2. `internal/proto/ws/` - Generated Go types
3. `internal/server/web/src/proto/` - Generated TypeScript types
4. Updated WebSocket handlers in `internal/server/ws.go`
5. Updated WebSocket client in `internal/server/web/src/net.ts`
6. Integration test demonstrating round-trip encoding/decoding
7. Build tooling (`Makefile` or script) for proto generation

## Timeline Estimate

- Protocol design: 4-6 hours
- Code generation setup: 2-3 hours
- Backend implementation: 6-8 hours
- Frontend implementation: 6-8 hours
- Testing & debugging: 4-6 hours
- **Total: 22-31 hours**

## Risks

1. **Bundle size increase** - Protobuf runtime may increase JavaScript bundle size
   - Mitigation: Use tree-shakeable library, measure bundle size, consider lazy loading
2. **Browser compatibility** - Binary WebSocket messages require `ArrayBuffer` support
   - Mitigation: All modern browsers support this; document minimum browser versions
3. **Debugging difficulty** - Binary messages harder to inspect than JSON
   - Mitigation: Add logging utilities to decode/pretty-print messages during development
4. **Breaking changes** - Any schema change requires regeneration
   - Mitigation: Establish clear proto update workflow in documentation

## Next Steps

After Phase 1 completion:
- Evaluate performance gains
- Document lessons learned
- Begin Phase 2 planning for extended systems
