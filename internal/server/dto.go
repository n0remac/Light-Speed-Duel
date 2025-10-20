package server

import (
	"LightSpeedDuel/internal/dag"
	"LightSpeedDuel/internal/game"
)

type missileDTO struct {
	ID         string           `json:"id"`
	Owner      string           `json:"owner"`
	Self       bool             `json:"self"`
	X          float64          `json:"x"`
	Y          float64          `json:"y"`
	VX         float64          `json:"vx"`
	VY         float64          `json:"vy"`
	T          float64          `json:"t"`
	AgroRadius float64          `json:"agro_radius"`
	Lifetime   float64          `json:"lifetime"`
	LaunchTime float64          `json:"launch"`
	ExpiresAt  float64          `json:"expires"`
	TargetID   string           `json:"target_id,omitempty"`
	Heat       *shipHeatViewDTO `json:"heat,omitempty"` // Reuse shipHeatViewDTO for missile heat
}

type missileConfigDTO struct {
	Speed      float64        `json:"speed"`
	SpeedMin   float64        `json:"speed_min"`
	SpeedMax   float64        `json:"speed_max"`
	AgroMin    float64        `json:"agro_min"`
	AgroRadius float64        `json:"agro_radius"`
	Lifetime   float64        `json:"lifetime"`
	HeatConfig *heatParamsDTO `json:"heat_config,omitempty"` // Optional custom heat parameters
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

// dagNodeDTO represents a node in the DAG for client serialization
type dagNodeDTO struct {
	ID         string              `json:"id"`
	Kind       string              `json:"kind"`
	Label      string              `json:"label"`
	Status     string              `json:"status"`            // locked, available, in_progress, completed
	RemainingS float64             `json:"remaining_s"`       // Time remaining for in-progress jobs
	DurationS  float64             `json:"duration_s"`        // Total duration of the node
	Repeatable bool                `json:"repeatable"`        // Whether the node can be repeated
	Effects    []dag.UpgradeEffect `json:"effects,omitempty"` // Only for upgrade nodes
}

// dagStateDTO contains the full DAG state for a player
type dagStateDTO struct {
	Nodes []dagNodeDTO `json:"nodes"`
}

// inventoryItemDTO represents a single item in the player's inventory
type inventoryItemDTO struct {
	Type         string  `json:"type"`
	VariantID    string  `json:"variant_id"`
	HeatCapacity float64 `json:"heat_capacity"`
	Quantity     int     `json:"quantity"`
}

// inventoryDTO contains the player's full inventory
type inventoryDTO struct {
	Items []inventoryItemDTO `json:"items"`
}

// storyDialogueChoiceDTO represents a player response option
type storyDialogueChoiceDTO struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// storyTutorialTipDTO provides gameplay hints alongside dialogue
type storyTutorialTipDTO struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

// storyDialogueDTO contains presentation data for a story node
type storyDialogueDTO struct {
	Speaker       string                   `json:"speaker"`
	Text          string                   `json:"text"`
	Intent        string                   `json:"intent"`                   // "factory" or "unit"
	ContinueLabel string                   `json:"continue_label,omitempty"` // Empty = default "Continue"
	Choices       []storyDialogueChoiceDTO `json:"choices,omitempty"`        // Empty = show continue button
	TutorialTip   *storyTutorialTipDTO     `json:"tutorial_tip,omitempty"`   // Optional gameplay hint
}

type MissionOfferDTO = game.MissionOffer
type MissionUpdateDTO = game.MissionUpdate
type ObjectiveStateDTO = game.ObjectiveState

type MissionAcceptDTO struct {
	MissionID string `json:"missionId"`
}
