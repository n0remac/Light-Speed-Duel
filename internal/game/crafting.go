package game

import (
	"log"
	"strconv"

	"LightSpeedDuel/internal/dag"
)

// CraftingEffects implements dag.Effects to handle crafting payouts.
type CraftingEffects struct {
	Player *Player
}

// NewCraftingEffects creates a new crafting effects handler for a player.
func NewCraftingEffects(player *Player) *CraftingEffects {
	return &CraftingEffects{Player: player}
}

// OnStart is called when a node starts (no-op for crafting).
func (e *CraftingEffects) OnStart(nodeID dag.NodeID, node *dag.Node) {
	// Optional: could log or emit events here
}

// OnComplete is called when a node completes.
// For craft nodes, this adds the crafted item to the player's inventory.
func (e *CraftingEffects) OnComplete(nodeID dag.NodeID, node *dag.Node) {
	if node.Kind != dag.NodeKindCraft {
		return
	}

	// Extract crafting metadata from payload
	itemType, err := dag.GetPayloadString(node.Payload, "item_type")
	if err != nil {
		log.Printf("craft complete %s: %v", nodeID, err)
		return
	}

	variantID, err := dag.GetPayloadString(node.Payload, "variant_id")
	if err != nil {
		log.Printf("craft complete %s: %v", nodeID, err)
		return
	}

	// For missiles, we need heat capacity
	if itemType == "missile" {
		heatCapacityStr, exists := node.Payload["heat_capacity"]
		if !exists {
			log.Printf("craft complete %s: missing heat_capacity", nodeID)
			return
		}

		heatCapacity, err := strconv.ParseFloat(heatCapacityStr, 64)
		if err != nil {
			log.Printf("craft complete %s: invalid heat_capacity: %v", nodeID, err)
			return
		}

		// Add to inventory
		e.Player.EnsureInventory()
		e.Player.Inventory.AddItem(itemType, variantID, heatCapacity, 1)

		log.Printf("player %s crafted %s %s (heat: %.0f)", e.Player.ID, itemType, variantID, heatCapacity)
	}
}

// OnCancel is called when a node is cancelled (no-op for crafting).
func (e *CraftingEffects) OnCancel(nodeID dag.NodeID, node *dag.Node) {
	// Optional: could log or emit events here
}
