package server

import (
	_ "embed"
	"log"
	"net/http"

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

func startServer(h *Hub) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(htmlIndex)
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
	log.Fatal(http.ListenAndServe(":8080", nil))
}

