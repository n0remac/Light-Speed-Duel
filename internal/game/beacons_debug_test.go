package game

import "testing"

func TestBeaconDirectorBuildDebugSnapshot(t *testing.T) {
	director, ok := NewBeaconDirector("room-debug", "campaign-1", WorldW, WorldH)
	if !ok || director == nil {
		t.Fatalf("expected beacon director")
	}

	beaconsDTO, encountersDTO := director.BuildDebugSnapshot(WorldW, WorldH)

	if len(beaconsDTO.Beacons) != director.spec.BeaconCount {
		t.Fatalf("expected %d beacons, got %d", director.spec.BeaconCount, len(beaconsDTO.Beacons))
	}

	if len(encountersDTO.Encounters) != 0 {
		t.Fatalf("expected no encounters, got %d", len(encountersDTO.Encounters))
	}

	for _, beacon := range beaconsDTO.Beacons {
		if beacon.ID == "" {
			t.Fatalf("expected beacon ID to be populated")
		}
		if beacon.Tags == nil {
			t.Fatalf("expected tags slice to be initialized")
		}
	}
}
