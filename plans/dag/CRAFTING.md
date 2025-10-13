# Crafting Follow-Up Plan (Missiles v1)

## Goals

* Players can **craft missile variants** with different **heat capacities**.
* **Bigger heat capacity → longer craft time** (simple, transparent rule).
* **Server-authoritative timers**, survive disconnects, single concurrent job is fine for v1.
* No resources yet; crafting is gated only by **requires** prereqs and time.

---

## Data Model (adds to Tiny Core, no overreach)

**DAG Node (kind = `"craft"`, repeatable = `true`)**

* `id`: stable string (e.g., `craft.missile.basic`, `craft.missile.longrange`)
* `kind`: `"craft"`
* `label`: UI string
* `duration_s`: **base duration** (see scaling below)
* `repeatable`: `true`
* `payload` (opaque map used by crafting consumer):

  * `item_type: "missile"`
  * `variant_id: "basic" | "high_heat" | "long_range" | ...`
  * `heat_capacity: number` (e.g., MJ or abstract units)
  * `base_duration_s: number` (duplicate of `duration_s` for clarity, optional)
  * `desc?: string`

> Tiny Core already supports `duration_s` and `payload`. We just standardize what goes inside `payload` for craft nodes.

---

## Duration Rule (simple & predictable)

Pick one and stick to it for v1:

1. **Linear:**
   `effective_duration_s = round(base_duration_s * (heat_capacity / baseline_capacity))`

2. **Step-wise (simplest):**
   Define discrete tiers in content (no math):

* Tier A (≤ X heat): 60s
* Tier B (≤ Y heat): 120s
* Tier C (> Y heat): 180s

**Recommendation:** Use **linear** with a fixed `baseline_capacity` (e.g., `100`). It’s easy to reason about and tune.

**Example (Linear):**

* Baseline capacity: 100
* Basic missile: heat 80 → 48s if base 60s → `60 * 0.8`
* Long-range: heat 120 → 72s → `60 * 1.2`
* Heavy: heat 200 → 120s → `60 * 2.0`

> Compute once at `Start(nodeID)` and snapshot the resulting duration into the job (Tiny Core already snapshots `duration_s`).

---

## Content Seed (minimum set)

Author 3–4 craft nodes:

* `craft.missile.basic`

  * `heat_capacity: 80`, `base_duration_s: 60`, `requires: []`

* `craft.missile.high_heat`

  * `heat_capacity: 150`, `base_duration_s: 60`, `requires: ["craft.missile.basic"]`

* `craft.missile.long_range`

  * `heat_capacity: 120`, `base_duration_s: 75`, `requires: ["craft.missile.basic"]`

* `craft.missile.extended` (optional late unlock)

  * `heat_capacity: 200`, `base_duration_s: 90`, `requires: ["craft.missile.long_range"]`

All repeatable.

---

## Lifecycle & Commands (using Tiny Core)

1. **List**: Client asks for DAG snapshot; server returns node statuses and `remaining_s` for any in-progress craft.
2. **Start**: `dag_start{node_id}`

   * Validate: `status == Available`, no other job in progress (v1 single slot).
   * Compute `effective_duration_s` using the rule above.
   * Snapshot `started_at`, `effective_duration_s`, `eta`.
3. **Tick**: `Room.Tick()` evaluates timers; when `eta <= now`, returns due completions.
4. **Complete**: `Complete(node_id)`; for repeatable craft → status goes back to `Available`.

---

## Payouts: Inventory Integration (thin, minimal)

Add a tiny **post-completion effect** for craft nodes (still keeping core generic):

**Effect contract (internal only):**

* On `Complete(node_id)` where `kind == "craft"` and `payload.item_type == "missile"`:

  * Append an **inventory item**:

    * `type: "missile"`
    * `variant_id` (from payload)
    * `heat_capacity` (from payload)
    * `qty: +1` (or configurable later)
  * Emit UI event `inventory.changed` (server → client) next state push.

**Storage suggestion (lightweight):**

* `Player.Inventory` → `map[string]int` for counts by `variant_id` (and store a spec table mapping variant to `heat_capacity`), **or**
* `[]Missile{ variant_id, heat_capacity }` if you want each crafted item to carry its capacity.

> Keep effects confined to a tiny function inside your server that reads the node payload and mutates `Player.Inventory`. The DAG package remains side-effect-free.

---

## Networking (v1 endpoints/messages)

* **Requests**

  * `dag_list` → current DAG snapshot (ids, statuses, remaining_s)
  * `dag_start { node_id }`
  * `dag_cancel { node_id }` (optional; if you allow cancel → resets to `Available`)
* **Push/Events**

  * Include DAG snapshot in standard `state` message (coarse cadence is fine)
  * Optional toasts on server: `dag.nodeStarted`, `dag.nodeCompleted`
  * `inventory.changed` after completions

---

## UI (minimal panel)

* Single “Crafting” pane:

  * List craftable missiles with: `Label`, `Heat Capacity`, `Duration`
  * Status pill: `Available | In-Progress | Completed`
  * `Start` button (disabled if not available or if one is already running)
  * Show **ETA countdown** for the active job
* Optional: “Craft Log” with last N completions (helps balance feel)

> You can ship server-only first with a debug admin page; hook up UI after.

---

## Validation & Tests

* **Unit**

  * Linear duration function yields expected values for a matrix of `(base, capacity, baseline)`.
  * Start → Complete loops:

    * Repeatable returns to `Available`.
    * Different nodes snapshot different durations correctly.
  * Boundary: `eta == now` completes once; double complete is idempotent.
* **Integration (tiny)**

  * Start craft, advance server clock/ticks, assert inventory +1 correct variant and capacity.
* **Content sanity**

  * toposort passes, all `requires` refer to existing nodes.

---

## Telemetry (optional, ultra-light)

* Counters: `craft_started_total{variant}`, `craft_completed_total{variant}`
* Histogram: `craft_duration_s{variant}` (observed vs expected can help detect clock bugs)

---

## Rollout Checklist

1. **Add craft nodes** to the static seed (see examples).
2. **Implement duration resolver** in `Start(nodeID)`:

   * read `heat_capacity` + `base_duration_s` (+ baseline constant) → compute `effective_duration_s`.
3. **Implement inventory payout** on `Complete(nodeID)` where kind=`craft`.
4. **Wire into `Room.Tick()`** (already in Tiny Core).
5. **Expose `dag_list` / `dag_start`** over WS.
6. **(Optional) Minimal UI**: craft panel with start + countdown.
7. **Playtest & tune:**

   * Choose baseline so basic missiles feel quick (30–60s), heavy ones feel like a choice (2–5 min).

---

## Acceptance (Missiles v1)

* Players can start crafting any **Available** missile recipe.
* **Larger heat capacity → longer craft time** by the chosen rule.
* Timers persist and complete while the player is away.
* On completion, **inventory increases** with the correct variant and heat capacity.
* Repeatable: node returns to **Available** after completion.

---

### Notes on Scope

No visibility gates, no multiple stations, no duration modifiers, no resources. All of that can be layered later without changing this plan.

If you want one tiny extra guardrail: enforce **one active craft** globally for v1 (a single “Bay A”). That matches the Tiny Core and keeps tuning simple.
