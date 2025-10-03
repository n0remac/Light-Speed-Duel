package server

import (
	"log"
	"time"
)

func main() {
	hub := newHub()

	// Global sim ticker
	go func() {
		t := time.NewTicker(time.Duration(1000.0/simHz) * time.Millisecond)
		defer t.Stop()
		for range t.C {
			hub.mu.Lock()
			for _, r := range hub.rooms {
				r.tick()
			}
			hub.mu.Unlock()
		}
	}()

	log.Println("starting web server on :8080")
	startServer(hub)
}
