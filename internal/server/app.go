package server

import (
	"log"
	"time"

	. "LightSpeedDuel/internal/game"
)

func StartApp() {
	hub := NewHub()

	// Periodic cleanup of empty rooms (every 60 seconds)
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			hub.CleanupEmptyRooms()
		}
	}()

	log.Println("starting web server on :8080")
	startServer(hub)
}
