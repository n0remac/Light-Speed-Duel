package game

import (
	"fmt"
)

// MissionArchetype enumerates supported mission templates.
type MissionArchetype int

const (
	ArchetypeTravel MissionArchetype = iota // Navigate beacon-to-beacon
	ArchetypeEscort                         // Protect entity from A to B
	ArchetypeKill                           // Destroy N entities with tag
	ArchetypeHazard                         // Clear mines/obstacles in area
)

// MissionTemplate represents a reusable mission definition shared across rooms.
type MissionTemplate struct {
	ID              string
	DisplayName     string
	Archetype       MissionArchetype
	ObjectiveParams map[string]interface{}
	StoryNodeID     string
	EncounterRefs   []string
	FailureTimeout  float64
	Cooldown        float64
}

// TemplateRegistry holds all defined mission templates.
var TemplateRegistry = map[string]MissionTemplate{
	"campaign-1": {
		ID:          "campaign-1",
		DisplayName: "Navigation Protocols",
		Archetype:   ArchetypeTravel,
		ObjectiveParams: map[string]interface{}{
			"beaconCount": 4,
			"holdTime":    10.0,
		},
		StoryNodeID:    "campaign-1-intro",
		EncounterRefs:  []string{"wave-1", "wave-2", "wave-3"},
		FailureTimeout: 0,
		Cooldown:       0,
	},
}

// GetTemplate retrieves a mission template by ID.
func GetTemplate(id string) (*MissionTemplate, error) {
	template, ok := TemplateRegistry[id]
	if !ok {
		return nil, fmt.Errorf("mission template not found: %s", id)
	}
	return &template, nil
}

// Validate checks that a template's references are valid.
func (t *MissionTemplate) Validate() error {
	if t == nil {
		return fmt.Errorf("template is nil")
	}
	if t.ID == "" {
		return fmt.Errorf("template ID cannot be empty")
	}
	if t.DisplayName == "" {
		return fmt.Errorf("template %s missing display name", t.ID)
	}
	// TODO: Validate StoryNodeID exists in story DAG (Phase 2.3)
	// TODO: Validate EncounterRefs exist in encounter registry (Phase 3)
	return nil
}

// MissionOffer encapsulates the offer message sent to clients.
type MissionOffer struct {
	MissionID   string   `json:"missionId"`
	TemplateID  string   `json:"templateId"`
	DisplayName string   `json:"displayName"`
	Archetype   string   `json:"archetype"`
	Objectives  []string `json:"objectives"`
	StoryNodeID string   `json:"storyNodeId"`
	Timeout     float64  `json:"timeout"`
}

// MissionUpdate represents objective progress payloads.
type MissionUpdate struct {
	MissionID  string           `json:"missionId"`
	Status     string           `json:"status"`
	Objectives []ObjectiveState `json:"objectives"`
	ServerTime float64          `json:"serverTime"`
}

// ObjectiveState captures current progress for an objective.
type ObjectiveState struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	Progress    float64 `json:"progress"`
	Complete    bool    `json:"complete"`
	Description string  `json:"description"`
}

// OutboundMessage packages queued websocket events.
type OutboundMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}
