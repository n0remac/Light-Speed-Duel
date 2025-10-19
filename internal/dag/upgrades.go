package dag

// SeedUpgradeNodes defines the upgrade progression for ship/missile speed and heat capacity.
// This uses existing effect types and disambiguates target via node ID/payload.
func SeedUpgradeNodes() []*Node {
	// Helper to build a linear chain of 5 tiers
	// baseID: e.g., "upgrade.ship.speed_"
	// labelPrefix: e.g., "Engine Boost"
	// effectType: EffectSpeedMultiplier or EffectHeatCapacity
	// target: "ship" or "missile"
	// baseMultiplier: 1.10 .. 1.50 over tiers
	buildFive := func(baseID, labelPrefix string, effectType EffectType, target string) []*Node {
		durations := []float64{30, 60, 120, 240, 480}
		multipliers := []float64{1.10, 1.20, 1.30, 1.40, 1.50}
		nodes := make([]*Node, 0, 5)
		var prevID NodeID
		for i := 0; i < 5; i++ {
			id := NodeID(baseID + itoa(i+1))
			requires := []NodeID{}
			if i > 0 {
				requires = []NodeID{prevID}
			}
			n := &Node{
				ID:         id,
				Kind:       NodeKindUpgrade,
				Label:      labelPrefix + " " + roman(i+1),
				DurationS:  durations[i],
				Repeatable: false,
				Payload: map[string]string{
					"target":      target,
					"description": upgradeDescription(effectType, target, int((multipliers[i]-1.0)*100+0.5)),
				},
				Requires: requires,
				Effects: []UpgradeEffect{{
					Type:  effectType,
					Value: multipliers[i],
				}},
			}
			nodes = append(nodes, n)
			prevID = id
		}
		return nodes
	}

	var nodes []*Node
	// Ship speed upgrades
	nodes = append(nodes, buildFive("upgrade.ship.speed_", "Engine Boost", EffectSpeedMultiplier, "ship")...)
	// Missile speed upgrades
	nodes = append(nodes, buildFive("upgrade.missile.speed_", "Warhead Boost", EffectSpeedMultiplier, "missile")...)
	// Ship heat capacity upgrades
	nodes = append(nodes, buildFive("upgrade.ship.heat_cap_", "Cooling System", EffectHeatCapacity, "ship")...)
	// Missile heat capacity upgrades
	nodes = append(nodes, buildFive("upgrade.missile.heat_cap_", "Thermal Shield", EffectHeatCapacity, "missile")...)

	return nodes
}

// roman converts small integers 1..5 to Roman numerals for labels.
func roman(n int) string {
	switch n {
	case 1:
		return "I"
	case 2:
		return "II"
	case 3:
		return "III"
	case 4:
		return "IV"
	case 5:
		return "V"
	default:
		return ""
	}
}

func upgradeDescription(t EffectType, target string, percent int) string {
	switch t {
	case EffectSpeedMultiplier:
		if target == "missile" {
			return "+" + itoa(percent) + "% max missile speed"
		}
		return "+" + itoa(percent) + "% max ship speed"
	case EffectHeatCapacity:
		if target == "missile" {
			return "+" + itoa(percent) + "% missile heat capacity"
		}
		return "+" + itoa(percent) + "% ship heat capacity"
	case EffectHeatEfficiency:
		return "+" + itoa(percent) + "% heat efficiency"
	default:
		return ""
	}
}

func itoa(n int) string {
	// minimal int to string to avoid importing strconv just for labels
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + (n % 10))
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
