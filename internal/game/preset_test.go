package game

import (
	"testing"
)

func TestMissilePresets(t *testing.T) {
	// Test Scout preset
	scout := GetMissilePreset(MissilePresetScout)
	if scout.Speed != 80.0 {
		t.Errorf("Scout speed should be 80.0, got %f", scout.Speed)
	}
	if scout.HeatParams.Max != 60.0 {
		t.Errorf("Scout heat max should be 60.0, got %f", scout.HeatParams.Max)
	}

	// Test Hunter preset
	hunter := GetMissilePreset(MissilePresetHunter)
	if hunter.Speed != 150.0 {
		t.Errorf("Hunter speed should be 150.0, got %f", hunter.Speed)
	}
	if hunter.HeatParams.Max != 50.0 {
		t.Errorf("Hunter heat max should be 50.0, got %f", hunter.HeatParams.Max)
	}

	// Test Sniper preset
	sniper := GetMissilePreset(MissilePresetSniper)
	if sniper.Speed != 220.0 {
		t.Errorf("Sniper speed should be 220.0, got %f", sniper.Speed)
	}
	if sniper.HeatParams.Max != 40.0 {
		t.Errorf("Sniper heat max should be 40.0, got %f", sniper.HeatParams.Max)
	}

	t.Log("All presets configured successfully!")
}

func TestDefaultMissileHeatParams(t *testing.T) {
	params := DefaultMissileHeatParams()
	
	if params.Max != MissileHeatMax {
		t.Errorf("Expected Max=%f, got %f", MissileHeatMax, params.Max)
	}
	if params.MarkerSpeed != MissileHeatMarkerSpeed {
		t.Errorf("Expected MarkerSpeed=%f, got %f", MissileHeatMarkerSpeed, params.MarkerSpeed)
	}
	if params.StallSeconds != 0.0 {
		t.Errorf("Missiles should not stall, expected StallSeconds=0, got %f", params.StallSeconds)
	}
	if params.MissileSpikeChance != 0.0 {
		t.Errorf("Missiles should not have spike chance, got %f", params.MissileSpikeChance)
	}
}
