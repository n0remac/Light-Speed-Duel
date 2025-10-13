# QA Heat Tuning Notes

Use these recommendations when validating Heat mechanics across different arena scales. All values assume the default ship max speed of 250 u/s.

| Map Class | Suggested Map Size | Marker Speed | Warn At | Overheat At | Stall (s) | KUp | KDown | Missile Spike Chance | Spike Min | Spike Max |
|-----------|-------------------|--------------|---------|-------------|-----------|-----|-------|----------------------|-----------|-----------|
| **Skirmish** | ≤ 6 000 × 3 500 | 140 | 68 | 95 | 2.2 | 20 | 18 | 0.30 | 5 | 14 |
| **Standard** | 8 000 × 4 500 (default) | 150 | 70 | 100 | 2.5 | 22 | 16 | 0.35 | 6 | 18 |
| **Marathon** | ≥ 10 000 × 5 500 | 160 | 72 | 105 | 2.8 | 24 | 14 | 0.40 | 7 | 20 |

### Applying Tunings

1. **Config file** (persistent):
   - Edit `configs/world.json` and override only the fields you need.
   - Example:
     ```json
     {
       "heat": {
         "markerSpeed": 160,
         "warnAt": 72,
         "missileSpikeChance": 0.4
       }
     }
     ```
2. **CLI flags** (quick overrides per run):
   - Available flags: `--heat-marker`, `--heat-warn`, `--heat-overheat`, `--heat-max`, `--heat-stall`,
     `--heat-exp`, `--heat-kup`, `--heat-kdown`, `--heat-spike-chance`, `--heat-spike-min`, `--heat-spike-max`.
   - Example: `./LightSpeedDuel --heat-marker=140 --heat-spike-chance=0.3`.
3. **Per-room overrides** (for ad-hoc QA sessions):
   - Append query params when joining:  
     `/?room=test&mapW=6000&mapH=3500&heatMarker=140&heatWarn=68&heatSpikeChance=0.3`.
   - Overrides apply only while the room is empty and are safe to mix with map sizing.

### Verification Checklist
- **Marker alignment**: Set slider to marker after spawn; heat should stay flat.
- **Sprint window**: Push to `marker + 40` and confirm warning appears in ~3–4 s (Skirmish) or 4–5 s (Standard).
- **Cooling**: Drop below marker by ≥20 u/s; heat should clear warning within 3 s.
- **Stall**: Sustain `marker + 100` until stall triggers; duration should match the table.
- **Missile spike**: Fire 10 missiles; expect ~3–4 spikes (Skirmish), 3–4 (Standard), 4–5 (Marathon).
- **AI sanity**: Watch bots idle-cool when above Warn and resume aggression when missiles target them.

Log actual heat traces alongside the planned bar for each scenario to confirm projection accuracy under the new constants.
