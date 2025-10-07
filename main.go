package main

import (
	"flag"

	"LightSpeedDuel/internal/server"
)

func main() {
	addr := flag.String("addr", ":8080", "address to listen on (e.g., 127.0.0.1:8080)")
	flag.Parse()

	server.StartApp(*addr)
}
