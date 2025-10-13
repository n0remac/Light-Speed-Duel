# Sub‑Plan 5 — Polish & AI Integration (Optional)

**Goal:** Round out the ecosystem: AI, tutorial, missile spikes, and tuning.

---

## Scope
- **Bots** consider heat in pathing; insert waits to avoid stalls.
- **Tutorial** steps to teach marker, sprint/cool, stall recovery, and dual‑line reading.
- **Missile heat spikes** on impact (chance + variable amount).
- **Config**: expose room/world‑level heat params for tuning.

---

## Files & Touch Points
- `internal/game/ai/*.go`: consult preview sim or a simplified heuristic (projected heat per leg).
- `internal/server/web/src/tutorial/*`: new steps and highlights on slider/heat bar.
- `internal/game/combat.go`: on missile hit, call `ApplyMissileHeatSpike`.
- Config: `configs/world.json` or flags (MarkerSpeed, KUp, KDown, Exp, thresholds).

---

## Missile Spike (server)
```go
func ApplyMissileHeatSpike(h *HeatComp, now float64, rng func()float64) {
    if rng() < h.P.MissileSpikeChance {
        spike := h.P.MissileSpikeMin + rng()*(h.P.MissileSpikeMax-h.P.MissileSpikeMin)
        h.S.Value += spike
        if h.S.Value > h.P.Max { h.S.Value = h.P.Max }
        if h.S.Value >= h.P.OverheatAt && now >= h.S.StallUntil {
            h.S.StallUntil = now + h.P.StallSeconds
        }
    }
}
```

---

## Acceptance Criteria
- Bots avoid overheating in neutral situations; knowingly risk it to secure kills/escapes.
- Tutorial can be completed and communicates heat concepts clearly.
- Missile hits occasionally bump heat; numbers are tunable at runtime/config.
- QA tuning doc with recommended starting constants per map size.

---

## Rollback Plan
Individually flaggable:
- `aiHeatAware`
- `tutorialHeat`
- `missileHeatSpike`
- `heatConfigFromRoom`
