# Light Speed Duel

**Light Speed Duel** is a 2D top-down prototype about dueling starships at near-light speeds. The twist: players never see each other’s *true* position in real time. Instead, you see opponents only as they were, delayed by the time it takes light to travel the distance between ships.

The result is a prediction-heavy cat-and-mouse game where speed, timing, and foresight matter as much as accuracy.

---

## Current Features

* Two players can join the same room simply by visiting the game link.
* Click anywhere in space to set a waypoint — your ship will accelerate, cruise, and decelerate to hit the point, stopping cleanly at each leg.
* You see:

  * **Your ship** only at its delayed (retarded) position, just like opponents. No instant knowledge of where anything is *right now*.
  * **Opponent ships** also at their delayed positions — interception relies on prediction.
* Launch configurable missiles that inherit the same light-time rules, pursue enemies that wander into their aggro radius, and detonate after three successful hits.

---

## Controls & HUD

* **Waypoint Mode** (default):
  * Click the map to append ship waypoints.
  * Re-click a leg to toggle its selection and adjust its target speed with the slider.
  * `Delete from this waypoint onward` removes the selected leg and everything after it.
* **Missile Setup Mode**:
  * Toggle *Setup missile* to switch the canvas into missile waypoint placement.
  * Configure missile stats with the sliders:
    * **Speed** and **Acceleration** share a non-linear budget (faster missiles accelerate more slowly).
    * **Agro radius** defines the pursuit trigger distance.
    * Lifetime updates automatically based on the current configuration (max ~120 s).
  * Click to lay out missile waypoints (drawn in red) and hit *Launch Missile* to spawn with the active config.
  * Use *Clear Missile Waypoints* to reset the missile plan.
* **HUD Call-outs**:
  * Ship HP (three hits to destroy; respawns at map center).
  * World time, map size, and current light speed constant `c`.
  * Live missiles (your own and opponents) render as red dots; positions are delayed per observer.

---

## Running the Game

1. Clone the repo and install Go 1.21+.
2. Install dependencies:

   ```bash
   go mod tidy
   ```
3. Run the server:

   ```bash
   go run .
   ```
4. Open [http://localhost:8080](http://localhost:8080) in two browser tabs.

   * Each tab spawns a ship in the same room.
   * Click to set waypoints and try to intercept your opponent!

---

## Tech Stack

* **Go** — simulation loop and WebSocket server (authoritative state, per-player delayed views).
* **JavaScript/Canvas** — browser client for rendering and input.

---
