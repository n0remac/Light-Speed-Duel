# Sub‑Plan 2 — Network Protocol & Client State

**Goal:** Plumb server heat state to the client and store it in TS state. No visuals yet.

---

## Scope
- ShipHeatView DTO server → client.
- Include heat view in snapshot WS messages.
- Extend TS `AppState`/`UIState` to hold heat.
- Parse and time‑convert stall info using existing sync.
  
---

## Files & Touch Points
- `internal/server/dto.go` (or equivalent): add `ShipHeatView`.
- Server snapshot assembly: include heat on the player’s ship (and optionally visible ships).
- `web/src/types.ts` / `src/state.ts`: add `HeatView`.
- `web/src/net/client.ts`: parse message → dispatch heat to state.
- No rendering yet.

---

## DTOs

**Go (server → client):**
```go
type ShipHeatView struct {
    V  float64 // current heat
    M  float64 // max
    W  float64 // warnAt
    O  float64 // overheatAt
    MS float64 // markerSpeed
    SU float64 // stallUntil (server time seconds)
}
```

**TS (client):**
```ts
export type HeatView = {
  value: number;
  max: number;
  warnAt: number;
  overheatAt: number;
  markerSpeed: number;
  stallUntilMs: number; // converted using timeSync
};
```

**Message inclusion (example):**
```go
// in server snapshot builder
view.Heat = ShipHeatView{
    V: ship.Heat.S.Value, M: ship.Heat.P.Max,
    W: ship.Heat.P.WarnAt, O: ship.Heat.P.OverheatAt,
    MS: ship.Heat.P.MarkerSpeed, SU: worldTimeSeconds + ship.Heat.S.StallUntilOffset(),
}
```

**Client parse (example):**
```ts
// net handler
const { heat } = payload.ship;
const stallUntilMs = serverEpochToClientMs(heat.SU);
dispatch(updateHeat({
  value: heat.V, max: heat.M, warnAt: heat.W, overheatAt: heat.O,
  markerSpeed: heat.MS, stallUntilMs
}));
```

---

## Acceptance Criteria
- Client receives and stores heat without errors.
- Logging in the browser shows live updates as ship moves.
- Stall timing (`stallUntilMs`) matches server behavior when inspected.

---

## Rollback Plan
Behind a feature flag (omit `Heat` field in snapshot if disabled). Client parser tolerates missing heat (optional chaining).
