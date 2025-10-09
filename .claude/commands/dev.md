---
description: Start development server
---

Start the development server using the restart-dev.sh script, which:
1. Builds the Go binary with optimizations for low RAM
2. Starts server on 127.0.0.1:8082
3. Logs to ~/lsd-dev.log

Run: `./restart-dev.sh`

Note: This script is optimized for memory-constrained environments (GOMAXPROCS=1, GOGC=50).

To stop: Ctrl+C or `pkill -f lsd-dev`
