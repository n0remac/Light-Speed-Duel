Tiny DAG Core – Execution Plan
================================

Purpose
-------
- Stand up a minimal deterministic, server-authoritative DAG engine that can drive future crafting, upgrades, and story gating.
- Ship something useful quickly without over-engineering (visibility, tooling, metrics deferred).

Guiding Constraints
-------------------
- Deterministic and idempotent: all transitions pure with respect to `(graph, player_state, now)`.
- Simple data model: only `requires` edges, all nodes implicitly visible.
- Timers driven off existing room tick (`Room.Tick()`), seconds precision to match current server units.

Deliverables
------------
1. `internal/dag/graph.go`
   - Node/edge structs (`id`, `kind`, `label`, `duration_s`, `repeatable`, `payload` map).
   - Loader: seed static slice or JSON (no external file IO yet).
   - Precompute `requiresIn[node]`, validate acyclic via single toposort on boot.
2. `internal/dag/state.go`
   - Per-player state: `Status map[nodeID]Status`, `ActiveJobs map[nodeID]ActiveJob`.
   - API to clone/serialize state snapshot for network payload.
   - Status enum (`Locked | Available | InProgress | Completed`).
3. `internal/dag/eval.go`
   - `Evaluator(graph, state, now)` returning status diffs + due completions.
   - Passes: availability (all `requires` completed), timer (collect `eta <= now`).
4. `internal/dag/commands.go`
   - `Start(nodeID)`, `Complete(nodeID)`, `Cancel(nodeID?)`, all idempotent with validation helpers.
   - Hook interface `Effects` with no-op default; first consumer updates `Player` flags.
5. Integration hooks
   - Attach `DagState` to `game.Player` (init lazily).
   - Call evaluator from `Room.Tick()`; complete due items immediately.
   - Extend `wsMsg` handlers for `dag_start`, `dag_cancel`, `dag_list`.
   - Include DAG snapshot in periodic `state` message (optional flag to avoid UI dependency).

Implementation Steps
--------------------
1. **Scaffold package**
   - Create `internal/dag` folder with placeholder files + package docs.
   - Define types, constants, helper errors.
2. **Static content seed**
   - Hand-author small graph (3–5 nodes) inline in Go (craft/upgrade/gate example).
   - Add `Init()` registering the graph and running cycle validation.
3. **State + evaluator**
   - Implement status constants, helper to ensure map defaults.
   - Write evaluator that produces `StatusUpdates` + `DueCompletion []string`.
4. **Commands and transitions**
   - Enforce status machine.
   - Snapshot duration on start (`now + duration`), handle repeatable reset.
5. **Room integration**
   - Extend `Player` struct; wire init in `SpawnShip`/`EnsurePlayer`.
   - In `Room.Tick()`: run evaluator per player, loop due completions.
6. **Networking**
   - Add request handlers to `ws.go` for start/cancel/list.
   - Define DTO for DAG snapshot (node id, status, remaining_s).
7. **Minimal testing**
   - Unit tests for evaluator + command transitions (repeatable, timing boundary).
   - Optionally add a short integration test exercising start → complete cycle.

Out-of-Scope (V1)
-----------------
- Visibility/unlock edges, capacity, modifiers, payload-driven side effects.
- YAML authoring, CLI lints, metrics, tracing, property/load tests.
- Client UI work; initial release can be server-only or exposed via debug admin.

Follow-ups / Stretch
--------------------
- Add hook consumers (inventory gains, unlock ship presets) once content defined.
- Introduce visibility graph (`unlocks` edges) and reveal state.
- Move content to external packs + validator CLI.
- Observation/logging for DAG events and metrics.

Open Questions
--------------
1. How should DAG completions affect current gameplay (unlock routes, modify cooldown)?
   Answer: For now the DAG will not affect current gameplay functionality. The next crafting system and existing story system will be the first systems to use it.
2. Do we need persistence beyond in-memory for first milestone?
   Answer: There is no data base for the game yet. In-memory is prefered.
3. Should DAG state be included in the main `state` payload or exposed through a debug channel first?
   Answer: The main state should be fine. No need to put it behind something that would be changed later.
