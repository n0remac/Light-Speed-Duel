package dag

// SeedStoryNodes defines the campaign story beats that run through the DAG system.
func SeedStoryNodes() []*Node {
	return []*Node{
		// Mission 1, Beat 1: Opening - garbled distress signal
		{
			ID:         "story.signal-static-1.start",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Arrival",
			DurationS:  999999, // Wait for player acknowledgement
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "start",
				"flag":    "story.signal-static-1.start",
			},
			Requires: []NodeID{},
			Dialogue: &DialogueContent{
				Speaker: "UNKNOWN SIGNAL",
				Text: `–gnal… —issus… co–dinates…

[A weak signal crackles through the void. The transmission is nearly unintelligible, but coordinates emerge from the static. Something—or someone—needs help.]`,
				Intent: "factory",
				Choices: []DialogueChoice{
					{ID: "investigate", Text: "Investigate the signal"},
					{ID: "cautious", Text: "Approach with extreme caution"},
					{ID: "ignore", Text: "Log coordinates and continue patrol"},
				},
				TutorialTip: &TutorialTip{
					Title: "Route Plotting",
					Text:  "Click on the map to plot waypoints for your ship. Right-click waypoints to adjust speed. Your route determines your heat buildup.",
				},
			},
		},

		// Mission 1, Beacon 1 lock – player choice
		{
			ID:         "story.signal-static-1.beacon-1-lock",
			Kind:       NodeKindStory,
			Label:      "Beacon 1 Lock Response",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-1-lock",
				"flag":    "story.signal-static-1.beacon-1-lock",
			},
			Requires: []NodeID{},
			Dialogue: &DialogueContent{
				Speaker: "BEACON SYSTEM",
				Text: `Beacon 1 locked. Triangulation grid stabilizing.

[The beacon's security protocols are active. You can attempt to bypass them peacefully, or force your way through.]`,
				Intent: "factory",
				Choices: []DialogueChoice{
					{ID: "friendly", Text: "Negotiate with the beacon's AI"},
					{ID: "hostile", Text: "Override security protocols by force"},
				},
			},
		},

		{
			ID:         "story.signal-static-1.beacon-1-friendly",
			Kind:       NodeKindStory,
			Label:      "Beacon 1 – Cooperative Sync",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":        "signal-static-1",
				"node":           "beacon-1-friendly",
				"flag":           "story.signal-static-1.beacon-1-friendly",
				"grant_upgrade":  "upgrade.missile.speed_1",
				"reward_summary": "Missile Speed Boost I unlocked",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-1-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON AI",
				Text:          "Access granted. Uploading tactical data to your systems.\n\n[The beacon shares archived weapon schematics. Your missile systems have been enhanced.]\n\n**Reward: Missile Speed Boost I unlocked**",
				Intent:        "unit",
				ContinueLabel: "Accept Upgrade",
			},
		},

		{
			ID:         "story.signal-static-1.beacon-1-hostile",
			Kind:       NodeKindStory,
			Label:      "Beacon 1 – Forced Entry",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":          "signal-static-1",
				"node":             "beacon-1-hostile",
				"flag":             "story.signal-static-1.beacon-1-hostile",
				"spawn_encounter":  "true",
				"encounter_wave":   "1",
				"encounter_beacon": "1",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-1-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON SYSTEM",
				Text:          "WARNING: UNAUTHORIZED ACCESS DETECTED. DEPLOYING COUNTERMEASURES.\n\n[The beacon's defenses activate. Hostile mines are inbound.]",
				Intent:        "factory",
				ContinueLabel: "Brace for Impact",
			},
		},

		// Mission 1, Beacon 2 lock – player choice
		{
			ID:         "story.signal-static-1.beacon-2-lock",
			Kind:       NodeKindStory,
			Label:      "Beacon 2 Lock Response",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-2-lock",
				"flag":    "story.signal-static-1.beacon-2-lock",
			},
			Requires: []NodeID{},
			Dialogue: &DialogueContent{
				Speaker: "BEACON SYSTEM",
				Text: `Beacon 2 locked. Signal fidelity increasing.

[This beacon monitors biometric traffic near the distress source. You can align with its humanitarian protocols, or silence them to keep moving fast.]`,
				Intent: "factory",
				Choices: []DialogueChoice{
					{ID: "friendly", Text: "Respect the beacon's aid protocols"},
					{ID: "hostile", Text: "Bypass safeguards and push through"},
				},
			},
		},

		{
			ID:         "story.signal-static-1.beacon-2-friendly",
			Kind:       NodeKindStory,
			Label:      "Beacon 2 – Humanitarian Sync",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":        "signal-static-1",
				"node":           "beacon-2-friendly",
				"flag":           "story.signal-static-1.beacon-2-friendly",
				"grant_upgrade":  "upgrade.missile.heat_cap_1",
				"reward_summary": "Missile Heat Capacity Boost I unlocked",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-2-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON MEDICAL CORE",
				Text:          "Aid channel accepted. Rerouting reserve coolant packs to your launch systems.\n\n[Emergency supplies integrate with your missile bays, increasing their thermal tolerance.]\n\n**Reward: Missile Heat Capacity Boost I unlocked**",
				Intent:        "unit",
				ContinueLabel: "Install Packs",
			},
		},

		{
			ID:         "story.signal-static-1.beacon-2-hostile",
			Kind:       NodeKindStory,
			Label:      "Beacon 2 – Firewall Breach",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":          "signal-static-1",
				"node":             "beacon-2-hostile",
				"flag":             "story.signal-static-1.beacon-2-hostile",
				"spawn_encounter":  "true",
				"encounter_wave":   "2",
				"encounter_beacon": "2",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-2-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON SYSTEM",
				Text:          "ALERT: FIREWALL COMPROMISED. DEPLOYING MIXED HAZARD DRONES.\n\n[The beacon floods the area with automated mines and seeker escorts.]",
				Intent:        "factory",
				ContinueLabel: "Hold Vector",
			},
		},

		// Mission 1, Beacon 3 lock – player choice
		{
			ID:         "story.signal-static-1.beacon-3-lock",
			Kind:       NodeKindStory,
			Label:      "Beacon 3 Lock Response",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-3-lock",
				"flag":    "story.signal-static-1.beacon-3-lock",
			},
			Requires: []NodeID{},
			Dialogue: &DialogueContent{
				Speaker: "BEACON SYSTEM",
				Text: `Beacon 3 locked. Distress vector fully resolved.

[Final defense drones converge on this beacon. You can coordinate with them for safe passage, or seize control and divert them.]`,
				Intent: "factory",
				Choices: []DialogueChoice{
					{ID: "friendly", Text: "Sync defense grid to your transponder"},
					{ID: "hostile", Text: "Hijack the drones and clear the corridor"},
				},
			},
		},

		{
			ID:         "story.signal-static-1.beacon-3-friendly",
			Kind:       NodeKindStory,
			Label:      "Beacon 3 – Allied Override",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":        "signal-static-1",
				"node":           "beacon-3-friendly",
				"flag":           "story.signal-static-1.beacon-3-friendly",
				"grant_upgrade":  "upgrade.ship.speed_1",
				"reward_summary": "Ship Speed Boost I unlocked",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-3-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON COMMAND NODE",
				Text:          "Alliance acknowledged. Redirecting patrol vectors and amplifying your drive envelope.\n\n[The beacon feeds thrust harmonics into your engine profile, increasing your ship's top speed.]\n\n**Reward: Ship Speed Boost I unlocked**",
				Intent:        "unit",
				ContinueLabel: "Engage Boost",
			},
		},

		{
			ID:         "story.signal-static-1.beacon-3-hostile",
			Kind:       NodeKindStory,
			Label:      "Beacon 3 – Drone Uprising",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter":          "signal-static-1",
				"node":             "beacon-3-hostile",
				"flag":             "story.signal-static-1.beacon-3-hostile",
				"spawn_encounter":  "true",
				"encounter_wave":   "3",
				"encounter_beacon": "3",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-3-lock"},
			Dialogue: &DialogueContent{
				Speaker:       "BEACON SYSTEM",
				Text:          "EMERGENCY OVERRIDE DECLINED. SEEKER STRIKE WING EN ROUTE.\n\n[The beacon releases its elite seekers. They immediately vector toward your heat signature.]",
				Intent:        "factory",
				ContinueLabel: "Take Them Head-On",
			},
		},

		// Mission 1, Beat 5: Completion - archives unlocked
		{
			ID:         "story.signal-static-1.complete",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Completion",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "complete",
				"flag":    "story.signal-static-1.complete",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-3-lock"},
			Dialogue: &DialogueContent{
				Speaker: "UNIT-0 ARCHIVES",
				Text: `Unit-0, you found us.

Archives unlocked. Emergency protocols bypassed. Uploading next mission parameters to your nav system.

[The distress signal resolves into a data stream. Ancient archives flicker to life, revealing coordinates for your next objective.]`,
				Intent:        "unit",
				ContinueLabel: "Mission Complete",
				Choices:       nil,
				TutorialTip:   nil, // No tip on final node
			},
		},
	}
}
