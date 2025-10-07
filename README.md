# Light Speed Duel

**Light Speed Duel** is a 2D top-down prototype about dueling starships at near-light speeds. The twist: players never see each other’s *true* position in real time. Instead, you see opponents only as they were, delayed by the time it takes light to travel the distance between ships.

The result is a prediction-heavy cat-and-mouse game where speed, timing, and foresight matter as much as accuracy.

## Play the game  
[lightspeedduel.com](www.lightspeedduel.com)


## Current Features

* Two players can join the same room simply by visiting the game link.
* Click anywhere in space to set a waypoint — your ship will accelerate, cruise, and decelerate to hit the point, stopping cleanly at each leg.
* You see:

  * **Your ship** only at its delayed position, just like opponents. No instant knowledge of where anything is *right now*.
  * **Opponent ships** also at their delayed positions — interception relies on prediction.
* Launch configurable missiles that inherit the same light-time rules, pursue enemies that wander into their aggro radius, and detonate after three successful hits.


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
