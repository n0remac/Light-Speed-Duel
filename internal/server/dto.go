package server


type missileDTO struct {
	ID         string            `json:"id"`
	Owner      string            `json:"owner"`
	Self       bool              `json:"self"`
	X          float64           `json:"x"`
	Y          float64           `json:"y"`
	VX         float64           `json:"vx"`
	VY         float64           `json:"vy"`
	T          float64           `json:"t"`
	AgroRadius float64           `json:"agro_radius"`
	Lifetime   float64           `json:"lifetime"`
	LaunchTime float64           `json:"launch"`
	ExpiresAt  float64           `json:"expires"`
	TargetID   string            `json:"target_id,omitempty"`
	Heat       *shipHeatViewDTO  `json:"heat,omitempty"` // Reuse shipHeatViewDTO for missile heat
}

type missileConfigDTO struct {
	Speed      float64          `json:"speed"`
	SpeedMin   float64          `json:"speed_min"`
	SpeedMax   float64          `json:"speed_max"`
	AgroMin    float64          `json:"agro_min"`
	AgroRadius float64          `json:"agro_radius"`
	Lifetime   float64          `json:"lifetime"`
	HeatConfig *heatParamsDTO   `json:"heat_config,omitempty"` // Optional custom heat parameters
}

// heatParamsDTO allows clients to send custom heat configuration for missiles
type heatParamsDTO struct {
	Max         float64 `json:"max"`
	WarnAt      float64 `json:"warn_at"`
	OverheatAt  float64 `json:"overheat_at"`
	MarkerSpeed float64 `json:"marker_speed"`
	KUp         float64 `json:"k_up"`
	KDown       float64 `json:"k_down"`
	Exp         float64 `json:"exp"`
}

type missileRouteDTO struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Waypoints []waypointDTO `json:"waypoints"`
}

type waypointDTO struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Speed float64 `json:"speed"`
}

type shipHeatViewDTO struct {
    V  float64 `json:"v"`  // current heat value
    M  float64 `json:"m"`  // max heat
    W  float64 `json:"w"`  // warnAt threshold
    O  float64 `json:"o"`  // overheatAt threshold
    MS float64 `json:"ms"` // markerSpeed
    SU float64 `json:"su"` // stallUntil (server time seconds)
    KU float64 `json:"ku"` // kUp (heating scale)
    KD float64 `json:"kd"` // kDown (cooling scale)
    EX float64 `json:"ex"` // exp (response exponent)
}
