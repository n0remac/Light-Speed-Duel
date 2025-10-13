package server

import (
	"log"
	"time"

	"LightSpeedDuel/internal/dag"
	. "LightSpeedDuel/internal/game"
)

type AppConfig struct {
	HeatConfigPath string
	HeatOverrides  HeatParamOverrides
}

func DefaultAppConfig() AppConfig {
	return AppConfig{
		HeatConfigPath: "configs/world.json",
	}
}

func resolveHeatParams(cfg AppConfig) HeatParams {
	params := DefaultHeatParams()
	loaded, err := loadHeatParamsFromFile(cfg.HeatConfigPath, params)
	if err != nil {
		log.Printf("heat config: %v (using defaults)", err)
	} else {
		params = loaded
	}
	params = applyHeatOverrides(params, cfg.HeatOverrides)
	return SanitizeHeatParams(params)
}

func StartApp(addr string, cfg AppConfig) {
	heat := resolveHeatParams(cfg)
	hub := NewHub(heat)

	// Initialize DAG system with missile crafting graph
	nodes := dag.SeedMissileCraftNodes()
	if err := dag.Init(nodes); err != nil {
		log.Fatalf("failed to initialize DAG: %v", err)
	}
	log.Printf("DAG system initialized with %d missile craft nodes", len(nodes))

	// Periodic cleanup of empty rooms (every 60 seconds)
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			hub.CleanupEmptyRooms()
		}
	}()

	log.Printf("starting web server on %s (heat marker %.1f, warn %.1f, overheat %.1f)\n",
		addr, heat.MarkerSpeed, heat.WarnAt, heat.OverheatAt)
	startServer(hub, addr)
}
