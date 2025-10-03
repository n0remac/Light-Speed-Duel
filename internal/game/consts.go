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
)
