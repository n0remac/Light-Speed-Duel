# Sub‑Plan 3 — Basic HUD & Visual Feedback

**Goal:** Give players immediate visibility of heat and stalls. No planner preview yet.

---

## Scope
- Single **heat bar** with safe/warn/overheat color zones.
- **Marker tick** on the global speed slider.
- **Stall overlay** (vignette/dim + simple text) and basic audio cues.
- Real‑time updates wired to `HeatView` in state.

---

## Files & Touch Points
- `web/src/ui/hud/HeatBar.tsx` (or your UI structure)
- `web/src/ui/controls/SpeedSlider.tsx` (marker tick)
- `web/src/ui/overlays/StallOverlay.tsx`
- `web/src/audio/cues.ts` (warning hum, overheat sizzle; optional)
- `web/src/state/selectors.ts` (derive warn/overheat booleans)

---

## UX Notes
- Heat bar spans a fixed width; color bands:
  - 0..WarnAt → normal
  - WarnAt..OverheatAt → warning gradient
  - ≥OverheatAt → red
- Marker tick on slider shows `markerSpeed` (tooltip with exact value).
- Stall overlay appears while `now < stallUntilMs`; prevent thrust input (visual only—server already blocks).

---

## Acceptance Criteria
- Heat bar moves smoothly with server updates.
- Marker visible and aligned to the slider scale.
- Overlay appears during stall and hides afterward.
- No planner preview exists yet.

---

## Rollback Plan
Gate rendering by feature flag `uiHeat` to hide components without removing code.
