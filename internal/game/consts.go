package game

const (
	C                           = 600.0 // "speed of light" in map units/s
	SimHz                       = 20.0  // server tick rate
	Dt                          = 1.0 / SimHz
	ShipMaxSpeed                = 250.0 // units/s
	ShipStopEps                 = 10.0
	ShipMaxHP                   = 3
	HistoryKeepS                = 30.0 // seconds of history to keep
	UpdateRateHz                = 10.0 // per-client WS state pushes
	RoomMaxPlayers              = 2
	WorldW                      = 8000.0
	WorldH                      = 4500.0
	MissileMinSpeed             = 40.0
	MissileMaxSpeed             = ShipMaxSpeed
	MissileMinAgroRadius        = 100.0
	MissileMaxLifetime          = 300.0
	MissileMinLifetime          = 20.0
	MissileLifetimeSpeedPenalty = 80.0
	MissileLifetimeAgroPenalty  = 40.0
	MissileLifetimeAgroRef      = 2000.0
	MissileHitRadius            = 50.0
	MissileBaseCooldown         = 2.0
	MissileCooldownScale        = 8.0

	// Ship heat system defaults
	HeatMax                = 100.0
	HeatWarnAt             = 70.0
	HeatOverheatAt         = 100.0
	HeatStallSeconds       = 2.5
	HeatMarkerSpeed        = 150.0 // Comfortable cruise (60% of ShipMaxSpeed)
	HeatExp                = 1.5
	HeatKUp                = 22.0
	HeatKDown              = 16.0
	HeatMissileSpikeChance = 0.35
	HeatMissileSpikeMin    = 6.0
	HeatMissileSpikeMax    = 18.0

	// Missile heat system defaults
	// Missiles use the same HeatComponent and heat physics as ships,
	// but with different capacity and thresholds
	MissileHeatMax         = 50.0  // Lower capacity than ships
	MissileHeatWarnAt      = 35.0  // 70% of max
	MissileHeatOverheatAt  = 50.0  // 100% of max (missiles explode, don't stall)
	MissileHeatMarkerSpeed = 120.0 // Lower comfortable speed than ships
	MissileHeatKUp         = 28.0  // Heats up faster than ships
	MissileHeatKDown       = 12.0  // Cools down slower than ships
	MissileHeatExp         = 1.5   // Same response curve as ships
)

// MissilePresetType represents different missile configurations
type MissilePresetType int

const (
	MissilePresetScout MissilePresetType = iota
	MissilePresetHunter
	MissilePresetSniper
)

// GetMissilePreset returns a configured missile config for the given preset
func GetMissilePreset(preset MissilePresetType) MissileConfig {
	switch preset {
	case MissilePresetScout:
		// Slow, long-range, high heat capacity
		return SanitizeMissileConfig(MissileConfig{
			Speed:      80.0,
			AgroRadius: 1500.0,
			HeatParams: HeatParams{
				Max:                60.0, // Higher capacity for long missions
				WarnAt:             42.0,
				OverheatAt:         60.0,
				StallSeconds:       0.0, // Missiles don't stall
				MarkerSpeed:        70.0, // Very efficient at low speed
				Exp:                1.5,
				KUp:                20.0, // Slower heating
				KDown:              15.0, // Better cooling
				MissileSpikeChance: 0.0,
				MissileSpikeMin:    0.0,
				MissileSpikeMax:    0.0,
			},
		})

	case MissilePresetHunter:
		// Balanced speed and detection
		return SanitizeMissileConfig(MissileConfig{
			Speed:      150.0,
			AgroRadius: 800.0,
			HeatParams: DefaultMissileHeatParams(),
		})

	case MissilePresetSniper:
		// Fast, narrow detection, low heat capacity
		return SanitizeMissileConfig(MissileConfig{
			Speed:      220.0,
			AgroRadius: 300.0,
			HeatParams: HeatParams{
				Max:                40.0, // Lower capacity, short-lived
				WarnAt:             28.0,
				OverheatAt:         40.0,
				StallSeconds:       0.0, // Missiles don't stall
				MarkerSpeed:        180.0, // Optimized for high speed
				Exp:                1.5,
				KUp:                35.0, // Heats very fast
				KDown:              8.0,  // Poor cooling
				MissileSpikeChance: 0.0,
				MissileSpikeMin:    0.0,
				MissileSpikeMax:    0.0,
			},
		})

	default:
		return SanitizeMissileConfig(MissileConfig{
			Speed:      150.0,
			AgroRadius: 600.0,
			HeatParams: DefaultMissileHeatParams(),
		})
	}
}
