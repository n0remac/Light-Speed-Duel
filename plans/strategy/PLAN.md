# 🚀 Light Speed Duel — Strategic Enhancement Roadmap

> **Goal**: Deepen the core strategic loop through enhanced control, predictive combat, resource management, and progression systems.

---

## 📋 Plan Overview

This strategic roadmap is organized into **5 phases**, each building on the previous to create a rich, deep gameplay experience. Each phase has been broken down into detailed implementation files for easier navigation and implementation.

### 📁 Detailed Phase Documentation

#### Phase 1: Enhanced Route Planning & Heat Visualization
- **[Backend Changes](./Phase1_Backend.md)** - Waypoint mutation API, heat projection system
- **[Frontend Changes](./Phase1_Frontend.md)** - Drag-to-move waypoints, heat visualization
- **[Networking Layer](./Phase1_Networking.md)** - WebSocket messages, DTOs, bandwidth optimization

#### Phase 2: Missile Economy & Heat Integration
- **[Backend Changes](./Phase2_Backend.md)** - Heat-based launch costs, validation, balancing
- **[Frontend Changes](./Phase2_Frontend.md)** - Launch indicators, missile presets, error handling

#### Phase 3: Upgrade & Progression System
- **[Backend Changes](./Phase3_Backend.md)** - Player profiles, upgrade tree, XP system, persistence
- **[Frontend Changes](./Phase3_Frontend.md)** - Upgrade UI, XP notifications, lobby integration

#### Phase 4: Environmental Strategy
- **[Backend Changes](./Phase4_Backend.md)** - Obstacles, occlusion, cooling stations, collision
- **[Frontend Changes](./Phase4_Frontend.md)** - Obstacle rendering, shadows, mini-map, tooltips

#### Phase 5: AI & Tutorial Expansion
- **[Backend Changes](./Phase5_Backend.md)** - Heat-aware AI, personalities, difficulty, tactics
- **[Frontend Changes](./Phase5_Frontend.md)** - Tutorial chapters, sequencing, UI styling

---

## 🎯 Core Design Loop

The player's rhythm alternates between:

1. **Planning** – route and heat management
2. **Hunting** – predicting delayed positions to strike
3. **Evading** – cooling down, hiding, and countering
4. **Rearming** – configuring missiles for the next engagement

Each subsystem—movement, heat, missiles, upgrades, and story—feeds this loop.

---

## 🧩 Implementation Roadmap

### Sprint Priority Matrix

| Phase | System | Complexity | Key Files | Priority |
|-------|--------|-----------|-----------|----------|
| **1** | Waypoint Dragging | ★★ | routes.go, ws.go, dto.go, game.ts | High |
| **1** | Heat Visualization | ★★ | game.ts, state.ts | High |
| **1** | Hold Command | ★ | game.ts, bus.ts | Medium |
| **2** | Missile Heat Cost | ★★ | room.go, consts.go, game.ts | High |
| **2** | Launch Restrictions | ★★ | game.ts, state.ts | High |
| **2** | Crafting Queue | ★★★★ | ecs.go, systems.go, dto.go | Low (Future) |
| **3** | Upgrade System | ★★★ | profile.go, room.go, upgrades.ts | Medium |
| **3** | Persistence | ★★ | profile.go, database integration | Medium |
| **4** | Obstacles | ★★★ | ecs.go, perception.go, game.ts | Low |
| **4** | Stations | ★★★ | systems.go, game.ts | Low |
| **5** | AI Heat Logic | ★★ | ai_defensive.go, ai_types.go | Medium |
| **5** | Tutorial Expansion | ★★ | tutorial/steps_*.ts | High |

### Implementation Sequence

**Sprint 1-2: Core UX Improvements** (Phase 1)
- Implement waypoint dragging and heat-colored routes
- Add heat projection visualization
- Enable "Hold" command for emergency stops
- **📖 See**: [Phase1_Backend.md](./Phase1_Backend.md), [Phase1_Frontend.md](./Phase1_Frontend.md), [Phase1_Networking.md](./Phase1_Networking.md)

**Sprint 3-4: Missile Economy** (Phase 2)
- Add missile launch heat costs
- Update UI with heat warnings and presets
- Balance missile heat economy through playtesting
- **📖 See**: [Phase2_Backend.md](./Phase2_Backend.md), [Phase2_Frontend.md](./Phase2_Frontend.md)

**Sprint 5-6: Progression Foundation** (Phase 3)
- Build upgrade system backend with profiles
- Create upgrade tree UI in lobby
- Integrate XP awards and persistence
- **📖 See**: [Phase3_Backend.md](./Phase3_Backend.md), [Phase3_Frontend.md](./Phase3_Frontend.md)

**Sprint 7-8: Environmental Elements** (Phase 4)
- Implement obstacle ECS components
- Add occlusion to perception system
- Render obstacles, stations, and environmental effects
- **📖 See**: [Phase4_Backend.md](./Phase4_Backend.md), [Phase4_Frontend.md](./Phase4_Frontend.md)

**Sprint 9-10: AI & Learning** (Phase 5)
- Enhance AI with heat awareness and personalities
- Create comprehensive tutorial system
- Add difficulty levels and tactical behaviors
- **📖 See**: [Phase5_Backend.md](./Phase5_Backend.md), [Phase5_Frontend.md](./Phase5_Frontend.md)

---

## 📐 Architecture Notes

### Key Design Patterns

**Backend (Go)**
- Use ECS components for all game entities (`CompHeat`, `CompObstacle`)
- Define constants in `consts.go`, never hardcode values
- Add DTOs for new WebSocket messages in `dto.go`
- Extend Room methods for gameplay mutations (`MoveShipWaypoint`)

**Frontend (TypeScript)**
- Emit EventBus events for all UI interactions
- Update `AppState` for all game state changes
- Keep rendering logic in `game.ts` `draw*` functions
- Use TypeScript interfaces for all data structures

**Network Protocol**
- Define message types in `ws.go` message switch
- Keep DTOs lightweight (use abbreviations)
- Server authoritative: validate all mutations on backend
- Optimize bandwidth (see [Phase1_Networking.md](./Phase1_Networking.md))

### Testing Strategy
- Unit test heat projection, upgrade application, occlusion
- Integration test full feature flows (waypoint → heat → missile → overheat)
- Manual playtest each sprint for balance tuning
- Track success metrics per phase (see below)

---

## 🎯 Success Metrics

**Phase 1**: Players use heat visualization to plan efficient routes
- *Metric*: Heat bar attention time, route planning time increase

**Phase 2**: Missile spam reduces by 60%
- *Metric*: Launches per minute, heat-limited launch events

**Phase 3**: 70% of players engage with upgrade system
- *Metric*: Upgrade purchases, XP earnings, profile creation rate

**Phase 4**: Environmental tactics emerge
- *Metric*: Station proximity time, asteroid cover usage

**Phase 5**: Tutorial completion rate >80%
- *Metric*: Tutorial abandonment rate, step completion times

---

## 🚀 Quick Start Guide

### For Developers

1. **Start with Phase 1**: Read the backend, frontend, and networking docs
2. **Set up environment**: Follow main [CLAUDE.md](../../CLAUDE.md) setup instructions
3. **Implement incrementally**: Complete one feature at a time, test thoroughly
4. **Playtest frequently**: Use `./restart-dev.sh` for quick iteration
5. **Track metrics**: Add telemetry for success metrics

### For Reviewers

1. **Review by phase**: Each phase is self-contained with clear objectives
2. **Check architecture**: Ensure ECS patterns and EventBus usage are consistent
3. **Validate balance**: Review constants and formulas for game feel
4. **Test flows**: Verify end-to-end user experience for each feature

---

## 📚 Detailed Documentation Index

| Phase | Backend | Frontend | Networking |
|-------|---------|----------|------------|
| **Phase 1** | [Phase1_Backend.md](./Phase1_Backend.md) | [Phase1_Frontend.md](./Phase1_Frontend.md) | [Phase1_Networking.md](./Phase1_Networking.md) |
| **Phase 2** | [Phase2_Backend.md](./Phase2_Backend.md) | [Phase2_Frontend.md](./Phase2_Frontend.md) | *(included in backend)* |
| **Phase 3** | [Phase3_Backend.md](./Phase3_Backend.md) | [Phase3_Frontend.md](./Phase3_Frontend.md) | *(included in backend)* |
| **Phase 4** | [Phase4_Backend.md](./Phase4_Backend.md) | [Phase4_Frontend.md](./Phase4_Frontend.md) | *(included in backend)* |
| **Phase 5** | [Phase5_Backend.md](./Phase5_Backend.md) | [Phase5_Frontend.md](./Phase5_Frontend.md) | *(included in backend)* |

Each file contains:
- ✅ Detailed code samples
- ✅ Implementation notes
- ✅ Testing checklists
- ✅ Balancing considerations
- ✅ Future enhancement ideas

---

## 🔄 Feedback Loop

After each sprint:
1. **Deploy** to test environment
2. **Collect metrics** (heat usage, missile frequency, XP rates, etc.)
3. **Gather player feedback** (surveys, Discord, playtesting)
4. **Tune parameters** in `consts.go` and config files
5. **Update documentation** with lessons learned

---

## 📞 Questions & Support

**For implementation questions:**
- Consult individual phase files for detailed specifications
- Reference [CLAUDE.md](../../CLAUDE.md) for project architecture
- Check existing code in `internal/game/` and `internal/server/web/src/`

**For design questions:**
- Review success metrics and balancing sections
- Check architecture notes for design patterns
- Consider player feedback from previous features

---

**Last Updated**: 2025-10-10
**Version**: 1.0 (Detailed Phase Breakdown)
