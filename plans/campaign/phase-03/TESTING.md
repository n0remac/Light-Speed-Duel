# Phase 3 Testing & Validation

**Prerequisites**: All implementation tasks must be complete.

---

## Testing & Validation

### Integration Test Scenarios

1. **Poisson-Disc Sampler**:
   - Create sampler with MinDistance=1000, world 10000x10000
   - Generate 20 beacons
   - Verify all beacons >= 1000 units apart
   - Verify same seed produces identical layout
   - Verify designer pins placed exactly at specified positions

2. **Encounter Templates**:
   - Get template "minefield-basic"
   - Spawn at (5000, 5000) with seed 12345
   - Verify 18-24 entities spawned
   - Verify all entities have "mine" and "hazard" tags
   - Verify entities in scattered formation around center

3. **Spawn Table Selection**:
   - Create beacon with tags {"tier-1": true}
   - Select encounter from "campaign-1-standard" table
   - Verify selected encounter is "minefield-basic" or "patrol-light"
   - Create beacon with tags {"tier-3": true}
   - Verify selection fails without "encounter-1-briefed" flag
   - Add flag, verify selection succeeds

4. **Encounter Lifecycle**:
   - Spawn encounter at beacon
   - Verify ActiveEncounters tracking
   - Fast-forward time past lifetime
   - Verify encounter cleanup removes entities
   - Verify cooldown prevents re-spawn

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Poisson-disc fails to generate enough beacons | High | Add fallback to grid-based sampling if max attempts exceeded |
| Spawn table tag matching too restrictive | Medium | Add debug logging for rule matching, provide default "any" rule |
| Encounter spawn rate too high/low | Medium | Add tunable spawn chance parameter, collect playtest data |
| Encounter cleanup orphans entities | High | Add defensive entity tracking, periodic orphan cleanup |
| Debug overlay performance impact | Low | Only update overlay when visible, throttle to 1Hz |

---

## Success Metrics

- [ ] `go build` succeeds with no errors
- [ ] `go test ./internal/game` passes all tests
- [ ] Sampler generates beacons with correct spacing
- [ ] Same seed produces identical beacon layouts across restarts
- [ ] Encounters spawn at discovered beacons
- [ ] Spawn table selection respects tags and prerequisites
- [ ] Encounters clean up after lifetime expires
- [ ] Debug overlay shows accurate beacon and encounter data

---

## Notes for Future Phases

- **Persistence**: Phase 3 keeps encounter state in-memory. Phase 4 will persist active encounters.
- **Spawn Rate Tuning**: Initial spawn chance is placeholder (5%). Adjust based on playtesting.
- **Biome Expansion**: Quadrant tagger is basic. Phase 4 can add noise-based terrain/biomes.
- **Encounter Variety**: Phase 3 defines 4 templates. Phase 4 can add boss encounters, ambushes, etc.
