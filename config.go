package main

const (
	c                           = 600.0 // "speed of light" in map units/s
	simHz                       = 20.0  // server tick rate
	dt                          = 1.0 / simHz
	shipMaxSpeed                = 250.0 // units/s
	shipStopEps                 = 10.0
	shipMaxHP                   = 3
	historyKeepS                = 30.0 // seconds of history to keep
	updateRateHz                = 10.0 // per-client WS state pushes
	roomMaxPlayers              = 2
	worldW                      = 8000.0
	worldH                      = 4500.0
	missileMinSpeed             = 40.0
	missileMaxSpeed             = shipMaxSpeed
	missileMinAgroRadius        = 100.0
	missileMaxLifetime          = 300.0
	missileMinLifetime          = 20.0
	missileLifetimeSpeedPenalty = 80.0
	missileLifetimeAgroPenalty  = 40.0
	missileLifetimeAgroRef      = 2000.0
	missileHitRadius            = 50.0
)
