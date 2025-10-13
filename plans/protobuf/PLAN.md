# WebSocket Protobuf Migration Plan

1. Inventory current JSON contract
   - Catalogue every server→client shape (`stateMsg`, missile config, route updates) and client→server command (`wsMsg` variants) across Go and TypeScript.
   - Record exact field semantics (optional vs required, defaulting, enums) so the proto schema mirrors behaviour and drop any dead fields.
   - Decide which payloads must be part of the initial scope and which can stay JSON during rollout.

2. Design a shared proto schema
   - Create `proto/ws_events.proto` with `package lightspeedduel.ws;` and a top-level `message WsEnvelope { oneof payload { ServerStateUpdate state_update = 1; ClientJoin join = 2; ... } }`.
   - Model reused sub-structures (ship state, missiles, heat params, routes) as separate messages to keep both codebases in sync.
   - Encode enums (e.g. event type, missile status) where string literals were previously used, and document defaults/nullability via proto3 optional fields.

3. Generate Go and TypeScript bindings
   - Add a `tools/proto` script (or Make target) that runs `protoc --go_out --go_opt module=LightSpeedDuel --go_opt paths=source_relative` to place Go types under `internal/proto/ws`.
   - Use Buf with `buf.gen.yaml` + `buf build` or `ts-proto` to emit TypeScript into `internal/server/web/src/proto` (ES module output compatible with current bundler).
   - Check the generated TS output compiles under existing `tsconfig` and update lint/format rules if needed.
   - Document the generation workflow in `PROJECT.md` and wire `go:generate` or `npm script` so both sides stay in sync.

4. Update runtime WebSocket handling
   - Server: marshal envelopes via `proto.Marshal(&WsEnvelope{Payload: &WsEnvelope_StateUpdate{...}})` and send using `conn.WriteMessage(websocket.BinaryMessage, bytes)`; accept binary frames in `serveWS` and switch on the generated `WsEnvelope_Payload` variants.
   - Client: set `ws.binaryType = "arraybuffer"`, decode with `WsEnvelope.fromBinary(new Uint8Array(event.data))`, and replace string-based `type` switches with discriminated unions from the generated code.
   - Provide helper utilities (`sendProto(socket, envelope)`) that hide binary conversion, preserving the existing `sendMessage` call sites.

5. Minimal working example
   - Add an integration test or sample (`cmd/wsproto-demo`) that constructs a `ClientJoin`, sends it over a loopback WebSocket, and echoes a `ServerStateUpdate`; verify round-trip encode/decode in Go and the browser (headless test via Playwright or Vitest).
   - Include documentation snippet showing how to build (`buf generate`, `go test ./cmd/wsproto-demo`) and how to run a manual demo in the browser console.

6. Migration & rollout strategy
   - Introduce feature flag / negotiated protocol version so old clients keep accepting JSON during transition; remove once all clients support protobuf.
   - Ensure metrics/logging capture decode failures; temporarily log the first few payloads in both formats for debugging.
   - Benchmark frame sizes and latency to confirm improvements and catch regressive large messages (e.g. deep missile routes).

7. Browser/WebSocket gotchas
   - Remember browsers deliver `Blob` for binary frames by default; convert via `await event.data.arrayBuffer()` before decoding.
   - Watch CORS/compression proxies that might still assume text frames; keep `permessage-deflate` disabled or verified.
   - Verify bundler tree-shakes `@bufbuild/protobuf` helpers correctly to avoid bundle bloat, and polyfill `TextEncoder`/`TextDecoder` only if required for legacy browsers.

