# Phase 5 – Polish & QA

Scope
- Tune beacon sizes/positions, hazard densities, missile speeds/agro, and missile heat parameters.
- UX polish for huge map (zoom, grid visibility, labels).
- Performance validation under hazard load.

Tuning Checklist
- Beacon radii produce fair 10s holds without precision frustration.
- Corridor densities permit multiple safe paths (Wave 1/2).
- Seekers threaten but do not feel unavoidable (Wave 3).
- Heat curves: encourage marker‑aligned cruising; stalls punish but don’t hard fail holds (only reset timer).

UX / Feedback
- Mission HUD: clear index (n/4) and intuitive hold countdown.
- Optional compass arrow to current beacon when off‑screen.
- Subtle SFX when entering ring and on successful lock.

Perf & Stability
- Ensure missiles cleanup on lifetime expiry or overheat explosion.
- Validate no WS spam from mission controller; throttle to `state:updated` cadence.
- Large map rendering stays smooth with grid and route overlays.

Hints & Accessibility
- If two stalls within 20s during a hold, show a brief tip about matching marker speed/easing throttle.
- Consider toggle to relax stall reset (accessibility option).

Deliverables
- Mission feels fair, readable, and performant on huge map.
- Edge cases handled (disconnect/reconnect, death/respawn between beacons).

