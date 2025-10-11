# Phase 3 Backend Changes: Upgrade & Progression System

**Objective**: Add persistent strategic variety and long-term goals through player upgrades.

---

## 3.1 Player Profile System

**File**: `internal/server/profile.go` (new file)

```go
package server

import (
    "encoding/json"
    "fmt"
    "io/ioutil"
    "os"
    "sync"
)

// PlayerProfile stores persistent player data
type PlayerProfile struct {
    ID       string         `json:"id"`       // Unique player ID (UUID or username)
    Upgrades map[string]int `json:"upgrades"` // upgrade_id -> level
    XP       int            `json:"xp"`       // Total experience points
    Matches  int            `json:"matches"`  // Total matches played
    Wins     int            `json:"wins"`     // Total wins
    Created  int64          `json:"created"`  // Unix timestamp
    Updated  int64          `json:"updated"`  // Last update timestamp
}

// ProfileStore manages player profiles with thread-safe access
type ProfileStore struct {
    profiles map[string]*PlayerProfile
    mu       sync.RWMutex
    filePath string
}

// NewProfileStore creates a new profile store
func NewProfileStore(filePath string) (*ProfileStore, error) {
    store := &ProfileStore{
        profiles: make(map[string]*PlayerProfile),
        filePath: filePath,
    }

    // Load existing profiles from disk
    if err := store.Load(); err != nil {
        // If file doesn't exist, start fresh
        if !os.IsNotExist(err) {
            return nil, err
        }
    }

    return store, nil
}

// Get retrieves a player profile, creating one if it doesn't exist
func (ps *ProfileStore) Get(playerID string) *PlayerProfile {
    ps.mu.RLock()
    profile, exists := ps.profiles[playerID]
    ps.mu.RUnlock()

    if exists {
        return profile
    }

    // Create new profile
    ps.mu.Lock()
    defer ps.mu.Unlock()

    // Double-check after acquiring write lock
    if profile, exists := ps.profiles[playerID]; exists {
        return profile
    }

    profile = &PlayerProfile{
        ID:       playerID,
        Upgrades: make(map[string]int),
        XP:       0,
        Matches:  0,
        Wins:     0,
        Created:  time.Now().Unix(),
        Updated:  time.Now().Unix(),
    }

    ps.profiles[playerID] = profile
    return profile
}

// Save persists all profiles to disk
func (ps *ProfileStore) Save() error {
    ps.mu.RLock()
    defer ps.mu.RUnlock()

    data, err := json.MarshalIndent(ps.profiles, "", "  ")
    if err != nil {
        return err
    }

    return ioutil.WriteFile(ps.filePath, data, 0644)
}

// Load reads profiles from disk
func (ps *ProfileStore) Load() error {
    data, err := ioutil.ReadFile(ps.filePath)
    if err != nil {
        return err
    }

    ps.mu.Lock()
    defer ps.mu.Unlock()

    return json.Unmarshal(data, &ps.profiles)
}

// AwardXP adds experience points to a player
func (ps *ProfileStore) AwardXP(playerID string, amount int) {
    profile := ps.Get(playerID)

    ps.mu.Lock()
    profile.XP += amount
    profile.Updated = time.Now().Unix()
    ps.mu.Unlock()

    // Auto-save after XP award (or batch saves)
    ps.Save()
}

// PurchaseUpgrade attempts to purchase/upgrade an upgrade
func (ps *ProfileStore) PurchaseUpgrade(playerID string, upgradeID string) error {
    profile := ps.Get(playerID)
    upgrade, exists := UpgradeTreeMap[upgradeID]
    if !exists {
        return fmt.Errorf("unknown upgrade: %s", upgradeID)
    }

    ps.mu.Lock()
    defer ps.mu.Unlock()

    currentLevel := profile.Upgrades[upgradeID]

    // Check if already at max level
    if currentLevel >= upgrade.MaxLevel {
        return fmt.Errorf("upgrade already at max level")
    }

    // Calculate cost (scales with level)
    cost := upgrade.BaseCost * (currentLevel + 1)

    // Check if player has enough XP
    if profile.XP < cost {
        return fmt.Errorf("insufficient XP (need %d, have %d)", cost, profile.XP)
    }

    // Deduct XP and apply upgrade
    profile.XP -= cost
    profile.Upgrades[upgradeID]++
    profile.Updated = time.Now().Unix()

    ps.Save()
    return nil
}
```

---

## 3.2 Upgrade Definitions

**File**: `internal/server/upgrades.go` (new file)

```go
package server

import "github.com/yourusername/lightspeed/internal/game"

// UpgradeDefinition describes a single upgrade path
type UpgradeDefinition struct {
    ID          string             `json:"id"`
    Name        string             `json:"name"`
    Description string             `json:"description"`
    Branch      string             `json:"branch"` // "engineering", "tactics", "combat"
    MaxLevel    int                `json:"maxLevel"`
    BaseCost    int                `json:"baseCost"` // XP cost for level 1
    Effects     map[string]float64 `json:"effects"`  // parameter -> value per level
}

// UpgradeTree is the master list of all available upgrades
var UpgradeTree = []UpgradeDefinition{
    // Engineering Branch
    {
        ID:          "heat_dissipation",
        Name:        "Enhanced Cooling",
        Description: "Increases heat dissipation rate",
        Branch:      "engineering",
        MaxLevel:    3,
        BaseCost:    100, // 100 XP for level 1, 200 for level 2, 300 for level 3
        Effects: map[string]float64{
            "heat_kdown": 4.0, // +4 heat dissipation per level
        },
    },
    {
        ID:          "heat_capacity",
        Name:        "Heat Sinks",
        Description: "Increases maximum heat capacity",
        Branch:      "engineering",
        MaxLevel:    3,
        BaseCost:    100,
        Effects: map[string]float64{
            "heat_max": 20.0, // +20 max heat per level
        },
    },
    {
        ID:          "efficient_engines",
        Name:        "Efficient Engines",
        Description: "Reduces heat generation at high speeds",
        Branch:      "engineering",
        MaxLevel:    3,
        BaseCost:    150,
        Effects: map[string]float64{
            "heat_kup": -2.0, // -2 heat accumulation per level
        },
    },

    // Tactics Branch
    {
        ID:          "sensor_range",
        Name:        "Long-Range Sensors",
        Description: "See farther through light-delay fog",
        Branch:      "tactics",
        MaxLevel:    3,
        BaseCost:    100,
        Effects: map[string]float64{
            "perception_bonus": 50.0, // +50 units perception range per level
        },
    },
    {
        ID:          "missile_crafting",
        Name:        "Fast Missile Fabrication",
        Description: "Craft missiles faster",
        Branch:      "tactics",
        MaxLevel:    3,
        BaseCost:    100,
        Effects: map[string]float64{
            "craft_speed": 0.5, // +50% craft speed per level
        },
    },
    {
        ID:          "missile_capacity",
        Name:        "Expanded Missile Bay",
        Description: "Carry more ready missiles",
        Branch:      "tactics",
        MaxLevel:    3,
        BaseCost:    150,
        Effects: map[string]float64{
            "missile_capacity": 2.0, // +2 missile slots per level
        },
    },

    // Combat Branch
    {
        ID:          "armor",
        Name:        "Reinforced Hull",
        Description: "Increases maximum HP",
        Branch:      "combat",
        MaxLevel:    3,
        BaseCost:    100,
        Effects: map[string]float64{
            "max_hp": 20.0, // +20 HP per level
        },
    },
    {
        ID:          "agility",
        Name:        "Enhanced Thrusters",
        Description: "Faster acceleration and deceleration",
        Branch:      "combat",
        MaxLevel:    3,
        BaseCost:    150,
        Effects: map[string]float64{
            "acceleration": 10.0, // +10 accel per level
        },
    },
    {
        ID:          "missile_damage",
        Name:        "Warhead Upgrade",
        Description: "Missiles deal more damage",
        Branch:      "combat",
        MaxLevel:    3,
        BaseCost:    200,
        Effects: map[string]float64{
            "missile_dmg": 5.0, // +5 damage per level
        },
    },
}

// UpgradeTreeMap provides fast lookup by ID
var UpgradeTreeMap = make(map[string]UpgradeDefinition)

func init() {
    for _, upgrade := range UpgradeTree {
        UpgradeTreeMap[upgrade.ID] = upgrade
    }
}
```

---

## 3.3 Apply Upgrades to ECS

**File**: `internal/game/room.go`

Modify ship creation to apply player upgrades:

```go
// CreatePlayerShip spawns a ship with upgrades applied
func (r *Room) CreatePlayerShip(playerID string, profile *PlayerProfile) EntityID {
    shipID := r.World.NewEntity()

    // Create base components
    tr := &TransformComponent{Pos: Vec2{0, 0}, Vel: Vec2{0, 0}}
    hp := &HPComponent{P: HPParams{Max: 100}, S: HPState{Value: 100}}
    heat := &HeatComponent{
        P: HeatParams{
            KUp:        HeatKUp,
            KDown:      HeatKDown,
            Vmin:       HeatVmin,
            WarnAt:     70,
            OverheatAt: 100,
        },
        S: HeatState{Value: 0},
    }

    // Apply upgrades from profile
    if profile != nil {
        ApplyUpgrades(profile, hp, heat)
    }

    // Set components
    r.World.Set(shipID, CompTransform, tr)
    r.World.Set(shipID, CompHP, hp)
    r.World.Set(shipID, CompHeat, heat)
    r.World.Set(shipID, CompShipRoute, &ShipRoute{Waypoints: []ShipWaypoint{}})

    return shipID
}

// ApplyUpgrades modifies ship components based on player's upgrades
func ApplyUpgrades(profile *PlayerProfile, hp *HPComponent, heat *HeatComponent) {
    for upgradeID, level := range profile.Upgrades {
        upgrade, exists := UpgradeTreeMap[upgradeID]
        if !exists || level <= 0 {
            continue
        }

        // Apply each effect
        for param, valuePerLevel := range upgrade.Effects {
            totalBonus := valuePerLevel * float64(level)

            switch param {
            case "heat_kdown":
                heat.P.KDown += totalBonus
            case "heat_kup":
                heat.P.KUp += totalBonus // Can be negative (reduction)
            case "heat_max":
                heat.P.OverheatAt += totalBonus
            case "max_hp":
                hp.P.Max += totalBonus
                hp.S.Value += totalBonus // Also increase current HP
            // ... other parameters
            }
        }
    }
}
```

---

## 3.4 XP Award System

**File**: `internal/game/room.go`

Award XP based on match events:

```go
// AwardXPForKill gives XP to a player for destroying an enemy
func (r *Room) AwardXPForKill(killerID string, victimID string) {
    const KillXP = 50

    if r.ProfileStore != nil {
        r.ProfileStore.AwardXP(killerID, KillXP)
    }

    // Emit event for UI feedback
    r.EventBus.Emit("xp:awarded", map[string]interface{}{
        "player": killerID,
        "amount": KillXP,
        "reason": "kill",
    })
}

// AwardXPForMatchEnd gives XP based on match performance
func (r *Room) AwardXPForMatchEnd(playerID string, won bool, damageDealt float64) {
    baseXP := 20 // Participation XP
    if won {
        baseXP += 100 // Victory bonus
    }

    // Bonus XP for damage dealt
    damageBonus := int(damageDealt / 10) // 1 XP per 10 damage

    totalXP := baseXP + damageBonus

    if r.ProfileStore != nil {
        r.ProfileStore.AwardXP(playerID, totalXP)

        // Update match stats
        profile := r.ProfileStore.Get(playerID)
        profile.Matches++
        if won {
            profile.Wins++
        }
    }
}
```

---

## 3.5 Integration with Application

**File**: `internal/server/app.go`

Initialize profile store on app startup:

```go
type Application struct {
    // ... existing fields ...
    ProfileStore *ProfileStore
}

func NewApplication() *Application {
    profileStore, err := NewProfileStore("data/profiles.json")
    if err != nil {
        log.Fatalf("Failed to load profile store: %v", err)
    }

    return &Application{
        // ... existing initialization ...
        ProfileStore: profileStore,
    }
}

// Shutdown saves all profiles
func (app *Application) Shutdown() {
    if app.ProfileStore != nil {
        if err := app.ProfileStore.Save(); err != nil {
            log.Printf("Error saving profiles: %v", err)
        }
    }
}
```

---

## 3.6 WebSocket API for Upgrades

**File**: `internal/server/dto.go`

```go
// Request to purchase an upgrade
type purchaseUpgradeDTO struct {
    UpgradeID string `json:"upgradeId"`
}

// Response with updated profile
type profileDTO struct {
    ID       string         `json:"id"`
    Upgrades map[string]int `json:"upgrades"`
    XP       int            `json:"xp"`
    Matches  int            `json:"matches"`
    Wins     int            `json:"wins"`
}

// XP award notification
type xpAwardDTO struct {
    Amount int    `json:"amount"`
    Reason string `json:"reason"` // "kill", "victory", "damage"
}
```

**File**: `internal/server/ws.go`

```go
case "purchase_upgrade":
    var dto purchaseUpgradeDTO
    if err := json.Unmarshal(msg.Data, &dto); err == nil {
        if err := app.ProfileStore.PurchaseUpgrade(playerID, dto.UpgradeID); err != nil {
            sendError(conn, "purchase_failed", err.Error())
        } else {
            // Send updated profile
            profile := app.ProfileStore.Get(playerID)
            sendProfile(conn, profile)
        }
    }

case "get_profile":
    profile := app.ProfileStore.Get(playerID)
    sendProfile(conn, profile)
```

---

## Implementation Priority

**High Priority** (Sprint 5):
- ✅ Player profile storage (JSON file)
- ✅ Upgrade definitions (3 branches, 9 upgrades)
- ✅ Apply upgrades to ship stats

**Medium Priority** (Sprint 6):
- XP award system
- Purchase upgrade API
- Profile persistence

**Low Priority** (Future):
- Database backend (replace JSON file)
- Leaderboards
- Achievement system

---

## Testing Checklist

- [ ] Test profile creation for new players
- [ ] Verify upgrade effects apply correctly to ships
- [ ] Test XP awards for kills, wins, damage
- [ ] Test purchase validation (XP cost, max level)
- [ ] Test profile persistence across server restarts
- [ ] Test concurrent profile access (thread safety)

---

## Balancing Considerations

**XP Rates**:
- Kill: 50 XP
- Victory: 100 XP
- Participation: 20 XP
- Damage: 1 XP per 10 damage

**Upgrade Costs**:
- Level 1: 100-200 XP (1-2 matches)
- Level 2: 200-400 XP (2-4 matches)
- Level 3: 300-600 XP (3-6 matches)

**Goal**: Players unlock 1-2 upgrades per hour of play

---

## Future Enhancements

**Unlock Requirements**:
```go
type UpgradeDefinition struct {
    // ... existing fields ...
    RequiredLevel int      // Min player level
    Prerequisites []string // Required upgrade IDs
}
```

**Prestige System**:
- Reset upgrades for bonus multipliers
- Cosmetic rewards
- Special titles
