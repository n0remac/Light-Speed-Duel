---
description: Test game locally with multiple clients
---

Test the game locally by opening multiple browser tabs/windows:

1. **Start server**: `go run . -addr :8080` or `./restart-dev.sh`

2. **Open game modes**:
   - Free play: http://localhost:8080/?room=test&mode=freeplay
   - Campaign: http://localhost:8080/?room=test&mode=campaign
   - Tutorial: http://localhost:8080/?room=test&mode=tutorial
   - Lobby: http://localhost:8080/lobby

3. **Test multiplayer**: Open 2+ tabs with same room ID

4. **Spawn AI bot**: Press 'b' key in game (if enabled)

**Port notes**:
- Default: 8080
- restart-dev.sh uses: 8082
- Adjust -addr flag as needed
