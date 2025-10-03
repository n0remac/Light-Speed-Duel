# Light Speed Duel

**Light Speed Duel** is a 2D top-down prototype about dueling starships at near-light speeds. The twist: players never see each other’s *true* position in real time. Instead, you see opponents only as they were, delayed by the time it takes light to travel the distance between ships.

The result is a prediction-heavy cat-and-mouse game where speed, timing, and foresight matter as much as accuracy.

---

## Current Features

* Two players can join the same room simply by visiting the game link.
* Click anywhere in space to set a waypoint — your ship will travel there at constant speed.
* You see:

  * **Your ship** in its true position.
  * **Opponent ships** only at their delayed positions (light-time delay).

---

## Roadmap

* **Variable speed & acceleration**: control how quickly ships move between waypoints.
* **Missiles**: launch projectiles with waypoints and an aggro radius to chase opponents.
* **Time dilation**: the faster your ship moves, the slower your internal timers tick (e.g. missile launch rate).
* **Missile crafting**: design custom missiles with stats like speed, range, and guidance behavior.
* **Advanced planning**: multi-leg flight paths, patrols, and command delays for remote assets.

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
4. Open [http://localhost:8080](http://localhost:8080) in two browser tabs (or share with a friend on LAN).

   * Each tab spawns a ship in the same room.
   * Click to set waypoints and try to intercept your opponent!

---

## Tech Stack

* **Go** — simulation loop and WebSocket server (authoritative state, per-player delayed views).
* **TypeScript/Canvas** — browser client for rendering and input.

---

Would you like me to also include a short **diagram** of the planned file organization (so contributors know where to add new features), or keep README minimal for now?
