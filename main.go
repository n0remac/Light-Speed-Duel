package main

import (
	"flag"
	"math"

	"LightSpeedDuel/internal/server"
)

func main() {
	addr := flag.String("addr", ":8080", "address to listen on (e.g., 127.0.0.1:8080)")
	heatConfigPath := flag.String("heat-config", "configs/world.json", "path to world/heat tuning JSON")
	heatMax := flag.Float64("heat-max", math.NaN(), "override maximum heat capacity")
	heatWarn := flag.Float64("heat-warn", math.NaN(), "override warning threshold")
	heatOverheat := flag.Float64("heat-overheat", math.NaN(), "override overheat threshold")
	heatStall := flag.Float64("heat-stall", math.NaN(), "override stall duration in seconds")
	heatMarker := flag.Float64("heat-marker", math.NaN(), "override neutral marker speed")
	heatExp := flag.Float64("heat-exp", math.NaN(), "override heat response exponent")
	heatKUp := flag.Float64("heat-kup", math.NaN(), "override heating scale above marker")
	heatKDown := flag.Float64("heat-kdown", math.NaN(), "override cooling scale below marker")
	heatSpikeChance := flag.Float64("heat-spike-chance", math.NaN(), "override missile heat spike chance (0-1)")
	heatSpikeMin := flag.Float64("heat-spike-min", math.NaN(), "override missile heat spike minimum amount")
	heatSpikeMax := flag.Float64("heat-spike-max", math.NaN(), "override missile heat spike maximum amount")
	flag.Parse()

	cfg := server.DefaultAppConfig()
	cfg.HeatConfigPath = *heatConfigPath

	var overrides server.HeatParamOverrides

	if !math.IsNaN(*heatMax) {
		val := *heatMax
		overrides.Max = &val
	}
	if !math.IsNaN(*heatWarn) {
		val := *heatWarn
		overrides.WarnAt = &val
	}
	if !math.IsNaN(*heatOverheat) {
		val := *heatOverheat
		overrides.OverheatAt = &val
	}
	if !math.IsNaN(*heatStall) {
		val := *heatStall
		overrides.StallSeconds = &val
	}
	if !math.IsNaN(*heatMarker) {
		val := *heatMarker
		overrides.MarkerSpeed = &val
	}
	if !math.IsNaN(*heatExp) {
		val := *heatExp
		overrides.Exp = &val
	}
	if !math.IsNaN(*heatKUp) {
		val := *heatKUp
		overrides.KUp = &val
	}
	if !math.IsNaN(*heatKDown) {
		val := *heatKDown
		overrides.KDown = &val
	}
	if !math.IsNaN(*heatSpikeChance) {
		val := *heatSpikeChance
		overrides.MissileSpikeChance = &val
	}
	if !math.IsNaN(*heatSpikeMin) {
		val := *heatSpikeMin
		overrides.MissileSpikeMin = &val
	}
	if !math.IsNaN(*heatSpikeMax) {
		val := *heatSpikeMax
		overrides.MissileSpikeMax = &val
	}

	cfg.HeatOverrides = overrides

	server.StartApp(*addr, cfg)
}
