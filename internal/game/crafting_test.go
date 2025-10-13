package game

import (
	"testing"

	"LightSpeedDuel/internal/dag"
)

// TestInventoryAddItem tests adding items to inventory
func TestInventoryAddItem(t *testing.T) {
	inv := NewInventory()

	// Add first missile
	inv.AddItem("missile", "basic", 80.0, 1)

	if len(inv.Items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(inv.Items))
	}

	item := inv.Items[0]
	if item.Type != "missile" || item.VariantID != "basic" || item.HeatCapacity != 80.0 || item.Quantity != 1 {
		t.Errorf("Item not added correctly: %+v", item)
	}

	// Add same missile - should stack
	inv.AddItem("missile", "basic", 80.0, 1)

	if len(inv.Items) != 1 {
		t.Errorf("Same items should stack, got %d stacks", len(inv.Items))
	}

	if inv.Items[0].Quantity != 2 {
		t.Errorf("Expected quantity 2, got %d", inv.Items[0].Quantity)
	}

	// Add different variant
	inv.AddItem("missile", "high_heat", 150.0, 1)

	if len(inv.Items) != 2 {
		t.Errorf("Expected 2 different items, got %d", len(inv.Items))
	}
}

// TestInventoryGetItemCount tests counting items
func TestInventoryGetItemCount(t *testing.T) {
	inv := NewInventory()

	inv.AddItem("missile", "basic", 80.0, 3)
	inv.AddItem("missile", "basic", 80.0, 2) // Should stack to 5

	count := inv.GetItemCount("missile", "basic")
	if count != 5 {
		t.Errorf("Expected count 5, got %d", count)
	}

	count = inv.GetItemCount("missile", "nonexistent")
	if count != 0 {
		t.Errorf("Expected count 0 for nonexistent item, got %d", count)
	}
}

// TestInventoryRemoveItem tests removing items
func TestInventoryRemoveItem(t *testing.T) {
	inv := NewInventory()

	inv.AddItem("missile", "basic", 80.0, 5)

	// Remove some
	success := inv.RemoveItem("missile", "basic", 80.0, 2)
	if !success {
		t.Error("Remove should succeed")
	}

	if inv.Items[0].Quantity != 3 {
		t.Errorf("Expected quantity 3 after removal, got %d", inv.Items[0].Quantity)
	}

	// Try to remove more than available
	success = inv.RemoveItem("missile", "basic", 80.0, 10)
	if success {
		t.Error("Remove should fail when not enough items")
	}

	// Remove all remaining
	success = inv.RemoveItem("missile", "basic", 80.0, 3)
	if !success {
		t.Error("Remove all should succeed")
	}

	// Stack should be removed
	if len(inv.Items) != 0 {
		t.Errorf("Empty stacks should be removed, got %d items", len(inv.Items))
	}
}

// TestCraftingEffects tests that crafting effects add items to inventory
func TestCraftingEffects(t *testing.T) {
	// Initialize graph
	nodes := dag.SeedMissileCraftNodes()
	if err := dag.Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := dag.GetGraph()
	player := &Player{ID: "test"}
	player.EnsureInventory()
	player.EnsureDagState()

	effects := NewCraftingEffects(player)

	// Make basic missile available and complete it
	player.DagState.SetStatus("craft.missile.basic", dag.StatusAvailable)
	err := dag.Start(graph, player.DagState, "craft.missile.basic", 100.0, effects)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	err = dag.Complete(graph, player.DagState, "craft.missile.basic", effects)
	if err != nil {
		t.Fatalf("Complete failed: %v", err)
	}

	// Check inventory
	count := player.Inventory.GetItemCount("missile", "basic")
	if count != 1 {
		t.Errorf("Expected 1 basic missile in inventory, got %d", count)
	}

	// Verify heat capacity is correct
	if len(player.Inventory.Items) != 1 {
		t.Fatalf("Expected 1 item type, got %d", len(player.Inventory.Items))
	}

	item := player.Inventory.Items[0]
	if item.HeatCapacity != 80.0 {
		t.Errorf("Expected heat capacity 80, got %f", item.HeatCapacity)
	}
}

// TestCraftingEffectsRepeatable tests that repeatable crafts stack in inventory
func TestCraftingEffectsRepeatable(t *testing.T) {
	nodes := dag.SeedMissileCraftNodes()
	if err := dag.Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := dag.GetGraph()
	player := &Player{ID: "test"}
	player.EnsureInventory()
	player.EnsureDagState()

	effects := NewCraftingEffects(player)

	// Craft basic missile twice
	player.DagState.SetStatus("craft.missile.basic", dag.StatusAvailable)

	// First craft
	_ = dag.Start(graph, player.DagState, "craft.missile.basic", 100.0, effects)
	_ = dag.Complete(graph, player.DagState, "craft.missile.basic", effects)

	// Second craft
	_ = dag.Start(graph, player.DagState, "craft.missile.basic", 200.0, effects)
	_ = dag.Complete(graph, player.DagState, "craft.missile.basic", effects)

	// Should have 2 basic missiles stacked
	count := player.Inventory.GetItemCount("missile", "basic")
	if count != 2 {
		t.Errorf("Expected 2 basic missiles, got %d", count)
	}

	// Should be a single stack
	if len(player.Inventory.Items) != 1 {
		t.Errorf("Expected 1 stack, got %d", len(player.Inventory.Items))
	}
}

// TestCraftingEffectsMultipleVariants tests crafting different missile variants
func TestCraftingEffectsMultipleVariants(t *testing.T) {
	nodes := dag.SeedMissileCraftNodes()
	if err := dag.Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := dag.GetGraph()
	state := dag.NewState()
	player := &Player{ID: "test", DagState: state}
	player.EnsureInventory()

	effects := NewCraftingEffects(player)

	// Craft basic
	state.SetStatus("craft.missile.basic", dag.StatusAvailable)
	_ = dag.Start(graph, state, "craft.missile.basic", 100.0, effects)
	_ = dag.Complete(graph, state, "craft.missile.basic", effects)

	// Make high_heat available
	result := dag.Evaluator(graph, state, 150.0)
	dag.ApplyEvalResult(state, result)

	// Craft high_heat
	_ = dag.Start(graph, state, "craft.missile.high_heat", 200.0, effects)
	_ = dag.Complete(graph, state, "craft.missile.high_heat", effects)

	// Should have 2 different items
	if len(player.Inventory.Items) != 2 {
		t.Errorf("Expected 2 different items, got %d", len(player.Inventory.Items))
	}

	basicCount := player.Inventory.GetItemCount("missile", "basic")
	if basicCount != 1 {
		t.Errorf("Expected 1 basic missile, got %d", basicCount)
	}

	highHeatCount := player.Inventory.GetItemCount("missile", "high_heat")
	if highHeatCount != 1 {
		t.Errorf("Expected 1 high_heat missile, got %d", highHeatCount)
	}
}
