package main

import (
	_ "embed"
	"log"
	"net/http"
)

/* ------------------------------ Embeds ------------------------------ */

//go:embed index.html
var htmlIndex []byte

//go:embed client.js
var jsClient []byte

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
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(h, w, r)
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
