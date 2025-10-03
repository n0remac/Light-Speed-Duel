package server


type missileDTO struct {
	ID         string  `json:"id"`
	Owner      string  `json:"owner"`
	Self       bool    `json:"self"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	VX         float64 `json:"vx"`
	VY         float64 `json:"vy"`
	T          float64 `json:"t"`
	AgroRadius float64 `json:"agro_radius"`
	Lifetime   float64 `json:"lifetime"`
	LaunchTime float64 `json:"launch"`
	ExpiresAt  float64 `json:"expires"`
	TargetID   string  `json:"target_id,omitempty"`
}

type missileConfigDTO struct {
	Speed      float64 `json:"speed"`
	SpeedMin   float64 `json:"speed_min"`
	SpeedMax   float64 `json:"speed_max"`
	AgroMin    float64 `json:"agro_min"`
	AgroRadius float64 `json:"agro_radius"`
	Lifetime   float64 `json:"lifetime"`
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