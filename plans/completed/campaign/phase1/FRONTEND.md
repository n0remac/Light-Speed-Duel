# Phase 1 – Frontend Summary

## Summary

- Retire the client-side mission controller and replace it with a lean presenter that consumes authoritative beacon and mission state from the server.
- Update `state.ts` structures to mirror the new backend payloads (discovery flags, active beacon ID, hold progress, cooldown timers).
- Keep existing HUD, map markers, and audio cues, but drive them from server updates instead of local simulation.
- Maintain event bus topics (`beacon:discovered`, `beacon:activated`, `mission:completed`) as presentation hooks decoupled from backend ownership.

## Analysis

- **Presenter Refactor**: `internal/server/web/src/mission/controller.ts` currently handles hold timers, persistence, and beacon advancement. Converting it to a presenter means stripping gameplay logic, subscribing to websocket updates, and emitting UI events only when fields change.
- **State Shape**: `AppState.mission` holds a minimal singleton object. After backend migration we will need richer data (beacon list with cooldowns, encounter status, timestamps). Plan schema changes now to avoid churn in Phase 2 when mission templates arrive.
- **HUD Behaviour**: The mission HUD already visualizes hold progress and “inside beacon” state. With authoritative updates we must ensure interpolation/latency handling matches the backend cadence—e.g., buffering server timestamps so the HUD does not jitter.
- **Event Bus Compatibility**: Existing UI modules (HUD, audio hooks, story triggers) listen for mission events. When backend messages replace local emits, ensure the bus continues to fire the same signals so downstream systems remain stable.

## Dependencies & Risks

- Requires backend delivery of timely updates; otherwise the HUD will feel laggy. Consider optimistic rendering with rollback for minor latency spikes.
- Any schema change in `state.ts` affects mission HUD, net handlers, and potential save/resume logic—coordinate the rollout carefully.
