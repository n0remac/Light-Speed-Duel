package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	. "LightSpeedDuel/internal/game"
)

type heatConfig struct {
	Max                *float64 `json:"max"`
	WarnAt             *float64 `json:"warnAt"`
	OverheatAt         *float64 `json:"overheatAt"`
	StallSeconds       *float64 `json:"stallSeconds"`
	MarkerSpeed        *float64 `json:"markerSpeed"`
	Exp                *float64 `json:"exp"`
	KUp                *float64 `json:"kUp"`
	KDown              *float64 `json:"kDown"`
	MissileSpikeChance *float64 `json:"missileSpikeChance"`
	MissileSpikeMin    *float64 `json:"missileSpikeMin"`
	MissileSpikeMax    *float64 `json:"missileSpikeMax"`
}

type worldConfig struct {
	Heat *heatConfig `json:"heat"`
}

// HeatParamOverrides represents optional command-line overrides for tuning heat parameters.
type HeatParamOverrides struct {
	Max                *float64
	WarnAt             *float64
	OverheatAt         *float64
	StallSeconds       *float64
	MarkerSpeed        *float64
	Exp                *float64
	KUp                *float64
	KDown              *float64
	MissileSpikeChance *float64
	MissileSpikeMin    *float64
	MissileSpikeMax    *float64
}

func (o HeatParamOverrides) apply(base HeatParams) HeatParams {
	if o.Max != nil {
		base.Max = *o.Max
	}
	if o.WarnAt != nil {
		base.WarnAt = *o.WarnAt
	}
	if o.OverheatAt != nil {
		base.OverheatAt = *o.OverheatAt
	}
	if o.StallSeconds != nil {
		base.StallSeconds = *o.StallSeconds
	}
	if o.MarkerSpeed != nil {
		base.MarkerSpeed = *o.MarkerSpeed
	}
	if o.Exp != nil {
		base.Exp = *o.Exp
	}
	if o.KUp != nil {
		base.KUp = *o.KUp
	}
	if o.KDown != nil {
		base.KDown = *o.KDown
	}
	if o.MissileSpikeChance != nil {
		base.MissileSpikeChance = *o.MissileSpikeChance
	}
	if o.MissileSpikeMin != nil {
		base.MissileSpikeMin = *o.MissileSpikeMin
	}
	if o.MissileSpikeMax != nil {
		base.MissileSpikeMax = *o.MissileSpikeMax
	}
	return SanitizeHeatParams(base)
}

func mergeHeatConfig(base HeatParams, cfg *heatConfig) HeatParams {
	if cfg == nil {
		return base
	}
	if cfg.Max != nil {
		base.Max = *cfg.Max
	}
	if cfg.WarnAt != nil {
		base.WarnAt = *cfg.WarnAt
	}
	if cfg.OverheatAt != nil {
		base.OverheatAt = *cfg.OverheatAt
	}
	if cfg.StallSeconds != nil {
		base.StallSeconds = *cfg.StallSeconds
	}
	if cfg.MarkerSpeed != nil {
		base.MarkerSpeed = *cfg.MarkerSpeed
	}
	if cfg.Exp != nil {
		base.Exp = *cfg.Exp
	}
	if cfg.KUp != nil {
		base.KUp = *cfg.KUp
	}
	if cfg.KDown != nil {
		base.KDown = *cfg.KDown
	}
	if cfg.MissileSpikeChance != nil {
		base.MissileSpikeChance = *cfg.MissileSpikeChance
	}
	if cfg.MissileSpikeMin != nil {
		base.MissileSpikeMin = *cfg.MissileSpikeMin
	}
	if cfg.MissileSpikeMax != nil {
		base.MissileSpikeMax = *cfg.MissileSpikeMax
	}
	return SanitizeHeatParams(base)
}

func loadHeatParamsFromFile(path string, base HeatParams) (HeatParams, error) {
	if path == "" {
		return SanitizeHeatParams(base), nil
	}
	cleanPath := filepath.Clean(path)
	data, err := os.ReadFile(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return SanitizeHeatParams(base), nil
		}
		return SanitizeHeatParams(base), fmt.Errorf("read heat config %q: %w", cleanPath, err)
	}
	var cfg worldConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return SanitizeHeatParams(base), fmt.Errorf("parse heat config %q: %w", cleanPath, err)
	}
	return mergeHeatConfig(base, cfg.Heat), nil
}

func applyHeatOverrides(base HeatParams, overrides HeatParamOverrides) HeatParams {
	return overrides.apply(base)
}
