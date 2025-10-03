package server

import (
	"log"
	"time"

	. "LightSpeedDuel/internal/game"
)

func StartApp() {
	hub := NewHub()

	// Global sim ticker
	go func() {
		t := time.NewTicker(time.Duration(1000.0/SimHz) * time.Millisecond)
		defer t.Stop()
		for range t.C {
			hub.Mu.Lock()
			for _, r := range hub.Rooms {
				r.Tick()
			}
			hub.Mu.Unlock()
		}
	}()

	log.Println("starting web server on :8080")
	startServer(hub)
}
