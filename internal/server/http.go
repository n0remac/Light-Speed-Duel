package server

import (
	_ "embed"
	"log"
	"math/rand"
	"net/http"
	"time"

	. "LightSpeedDuel/internal/game"
)

//go:generate go run ./cmd/webbuild

/* ------------------------------ Embeds ------------------------------ */

//go:embed web/index.html
var htmlIndex []byte

//go:embed web/client.js
var jsClient []byte

//go:embed web/lobby.html
var htmlLobby []byte

//go:embed web/lobby.js
var jsLobby []byte

/* ------------------------------- HTTP ------------------------------- */

func startServer(h *Hub, addr string) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// Check if there's a room parameter - if so, serve game, otherwise serve lobby
		if r.URL.Query().Get("room") != "" {
			_, _ = w.Write(htmlIndex)
		} else {
			_, _ = w.Write(htmlLobby)
		}
	})
	http.HandleFunc("/play", func(w http.ResponseWriter, r *http.Request) {
		// Generate a random freeplay room and redirect
		roomId := "freeplay-" + generateRandomSlug()
		http.Redirect(w, r, "/?room="+roomId+"&mode=freeplay", http.StatusSeeOther)
	})
	http.HandleFunc("/client.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		_, _ = w.Write(jsClient)
	})
	http.HandleFunc("/lobby", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(htmlLobby)
	})
	http.HandleFunc("/lobby.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		_, _ = w.Write(jsLobby)
	})
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(h, w, r)
	})
	log.Fatal(http.ListenAndServe(addr, nil))
}

func generateRandomSlug() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	slug := make([]byte, 6)
	for i := range slug {
		slug[i] = chars[rng.Intn(len(chars))]
	}
	return string(slug)
}
