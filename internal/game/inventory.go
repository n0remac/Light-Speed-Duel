package game

// InventoryItem represents a single item in a player's inventory.
type InventoryItem struct {
	Type         string  `json:"type"`          // "missile", etc.
	VariantID    string  `json:"variant_id"`    // "basic", "high_heat", "long_range", etc.
	HeatCapacity float64 `json:"heat_capacity"` // Heat capacity for missiles
	Quantity     int     `json:"quantity"`      // Stack size
}

// Inventory manages a player's items.
type Inventory struct {
	Items []InventoryItem `json:"items"`
}

// NewInventory creates a new empty inventory.
func NewInventory() *Inventory {
	return &Inventory{
		Items: []InventoryItem{},
	}
}

// AddItem adds an item to the inventory, stacking if possible.
// For missiles with the same variant_id and heat_capacity, we stack them.
func (inv *Inventory) AddItem(itemType, variantID string, heatCapacity float64, quantity int) {
	// Try to find existing stack
	for i := range inv.Items {
		item := &inv.Items[i]
		if item.Type == itemType && item.VariantID == variantID && item.HeatCapacity == heatCapacity {
			item.Quantity += quantity
			return
		}
	}

	// No existing stack, add new item
	inv.Items = append(inv.Items, InventoryItem{
		Type:         itemType,
		VariantID:    variantID,
		HeatCapacity: heatCapacity,
		Quantity:     quantity,
	})
}

// GetItemCount returns the quantity of a specific item variant.
func (inv *Inventory) GetItemCount(itemType, variantID string) int {
	total := 0
	for _, item := range inv.Items {
		if item.Type == itemType && item.VariantID == variantID {
			total += item.Quantity
		}
	}
	return total
}

// RemoveItem removes a specific quantity of an item from inventory.
// Returns true if successful, false if not enough items.
func (inv *Inventory) RemoveItem(itemType, variantID string, heatCapacity float64, quantity int) bool {
	for i := range inv.Items {
		item := &inv.Items[i]
		if item.Type == itemType && item.VariantID == variantID && item.HeatCapacity == heatCapacity {
			if item.Quantity < quantity {
				return false
			}
			item.Quantity -= quantity
			// Remove empty stacks
			if item.Quantity == 0 {
				inv.Items = append(inv.Items[:i], inv.Items[i+1:]...)
			}
			return true
		}
	}
	return false
}
