# Light Speed Duel

**Light Speed Duel** is a 2D top-down prototype about dueling starships at near-light speeds. The twist: players never see each other’s *true* position in real time. Instead, you see opponents only as they were, delayed by the time it takes light to travel the distance between ships.

The result is a prediction-heavy cat-and-mouse game where speed, timing, and foresight matter as much as accuracy.

## Play the game  
[lightspeedduel.com](www.lightspeedduel.com)


## Current Features

* Two players can join the same room simply by visiting the game link.
* Click anywhere in space to set a waypoint — your ship will accelerate, cruise, and decelerate to hit the point, stopping cleanly at each leg.
* You see:

  * **Your ship** only at its delayed (retarded) position, just like opponents. No instant knowledge of where anything is *right now*.
  * **Opponent ships** also at their delayed positions — interception relies on prediction.
* Launch configurable missiles that inherit the same light-time rules, pursue enemies that wander into their aggro radius, and detonate after three successful hits.


## Controls & HUD

* **Primary modes**
  * `1` focuses the ship bank on the left edge; `2` focuses the missile bank on the right edge.
  * Both banks stay visible—on touch you simply tap the buttons you need, no corner toggles required.
* **Ship navigation**
  * Left edge buttons cover `Set`, `Select`, `Delete`, `Clear`, and `Route`; `1` focuses this bank.
  * Ship speed lives on the leftmost slider in the bottom rail and still drives the selected leg.
* **Missile coordination**
  * Right edge buttons cover `Set`, `Select`, `Delete`, `New`, and `Launch`; `2` focuses this bank.
  * The bottom rail also hosts missile agro and missile speed sliders side-by-side with ship speed.
  * Use the chevrons in the top HUD to cycle active routes; the popover (`⋯`) lets you rename, clear, or delete a route.
* **Keyboard reference (desktop)**
  * `1 / 2` focus the ship or missile banks · `T` flips ship set/select · `E` flips missile set/select.
  * `C` clears ship route · `R` toggles route visibility · `[` `]` adjust ship speed (`Shift` for coarse).
  * `N` adds missile route · `L` launches · `,` `.` adjust agro · `;` `'` adjust missile speed (`Shift` for coarse).
  * `Tab` cycles ship waypoints · `Delete` removes the selected waypoint (ship or missile) · `?` opens the key map overlay.
* **HUD Call-outs**
  * Picture-frame border keeps all controls out of the playfield while showing room stats along the top.
  * Corner stacks hold the ship/missile tools; slim sliders live in the bottom edge and along the left border.
  * In-canvas visuals still render light-delayed ships, missiles, and agro rings for self-owned ordnance.


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


## Tech Stack

* **Go** — simulation loop and WebSocket server (authoritative state, per-player delayed views).
* **JavaScript/Canvas** — browser client for rendering and input.
