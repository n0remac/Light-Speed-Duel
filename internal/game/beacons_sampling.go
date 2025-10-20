package game

import (
	"math"
	"math/rand"
)

// Rect defines a rectangular sampling area.
type Rect struct {
	MinX, MinY float64
	MaxX, MaxY float64
}

// SamplerConfig controls beacon placement density and constraints.
type SamplerConfig struct {
	MinDistance   float64
	MaxAttempts   int
	WorldBounds   Rect
	Seed          int64
	DensityFactor float64
	DesignerPins  []BeaconPin
	BiomeTaggers  []BiomeTagger
}

// BeaconPin represents a designer-specified beacon location.
type BeaconPin struct {
	X      float64
	Y      float64
	Tags   map[string]bool
	Radius float64
}

// BiomeTagger assigns tags based on beacon position.
type BiomeTagger func(x, y float64) map[string]bool

type gridKey struct {
	X, Y int
}

// BeaconCandidate represents a potential beacon placement.
type BeaconCandidate struct {
	X, Y   float64
	Radius float64
	Tags   map[string]bool
	Pinned bool
}

type poissonDiscSampler struct {
	config      SamplerConfig
	rng         *rand.Rand
	grid        map[gridKey][]BeaconCandidate
	cellSize    float64
	minDistance float64
	bounds      Rect
	marginX     float64
	marginY     float64
}

// NewPoissonDiscSampler creates a sampler with the given configuration.
func NewPoissonDiscSampler(config SamplerConfig) *poissonDiscSampler {
	minDistance := config.MinDistance
	if minDistance <= 0 {
		minDistance = 2500
	}
	density := config.DensityFactor
	if density <= 0 {
		density = 1
	}
	effectiveMinDistance := minDistance * density
	if effectiveMinDistance <= 0 {
		effectiveMinDistance = minDistance
	}

	bounds := config.WorldBounds
	if !bounds.valid() {
		bounds = Rect{
			MinX: 0,
			MinY: 0,
			MaxX: WorldW,
			MaxY: WorldH,
		}
	}

	cellSize := effectiveMinDistance / math.Sqrt2
	if cellSize <= 0 {
		cellSize = effectiveMinDistance
	}
	if cellSize <= 0 {
		cellSize = 1
	}

	marginX := (bounds.MaxX - bounds.MinX) * 0.05
	marginY := (bounds.MaxY - bounds.MinY) * 0.05
	if marginX < 0 {
		marginX = 0
	}
	if marginY < 0 {
		marginY = 0
	}

	return &poissonDiscSampler{
		config:      config,
		rng:         rand.New(rand.NewSource(config.Seed)),
		grid:        make(map[gridKey][]BeaconCandidate),
		cellSize:    cellSize,
		minDistance: effectiveMinDistance,
		bounds:      bounds,
		marginX:     marginX,
		marginY:     marginY,
	}
}

func (r Rect) valid() bool {
	return !(math.IsNaN(r.MinX) || math.IsNaN(r.MinY) || math.IsNaN(r.MaxX) || math.IsNaN(r.MaxY) ||
		math.IsInf(r.MinX, 0) || math.IsInf(r.MinY, 0) || math.IsInf(r.MaxX, 0) || math.IsInf(r.MaxY, 0) ||
		r.MaxX <= r.MinX || r.MaxY <= r.MinY)
}

// Sample generates beacon positions using the Poisson-disc algorithm.
func (s *poissonDiscSampler) Sample(count int) []BeaconCandidate {
	if count <= 0 {
		count = len(s.config.DesignerPins)
		if count == 0 {
			count = 1
		}
	}

	beacons := make([]BeaconCandidate, 0, count)
	active := make([]BeaconCandidate, 0, count)

	for _, pin := range s.config.DesignerPins {
		candidate := BeaconCandidate{
			X:      Clamp(pin.X, s.bounds.MinX+s.marginX, s.bounds.MaxX-s.marginX),
			Y:      Clamp(pin.Y, s.bounds.MinY+s.marginY, s.bounds.MaxY-s.marginY),
			Radius: pin.Radius,
			Pinned: true,
			Tags:   copyTags(pin.Tags),
		}
		if candidate.Radius <= 0 {
			candidate.Radius = 300
		}
		candidate.Tags = s.applyBiomeTaggers(candidate.X, candidate.Y, candidate.Tags)
		beacons = append(beacons, candidate)
		active = append(active, candidate)
		s.addToGrid(candidate)
	}

	if len(beacons) == 0 {
		initial := s.randomPointInBounds()
		initial.Tags = s.applyBiomeTaggers(initial.X, initial.Y, nil)
		if initial.Radius <= 0 {
			initial.Radius = 300
		}
		beacons = append(beacons, initial)
		active = append(active, initial)
		s.addToGrid(initial)
	}

	if len(beacons) > count {
		return beacons[:count]
	}

	for len(active) > 0 && len(beacons) < count {
		idx := s.rng.Intn(len(active))
		activePoint := active[idx]
		placed := false

		for attempt := 0; attempt < s.maxAttempts(); attempt++ {
			candidate := s.generateAnnulusPoint(activePoint)

			if !s.withinBounds(candidate) {
				continue
			}
			if !s.isValid(candidate) {
				continue
			}

			candidate.Tags = s.applyBiomeTaggers(candidate.X, candidate.Y, nil)
			if candidate.Radius <= 0 {
				candidate.Radius = 300
			}

			beacons = append(beacons, candidate)
			active = append(active, candidate)
			s.addToGrid(candidate)
			placed = true
			break
		}

		if !placed {
			last := len(active) - 1
			active[idx], active[last] = active[last], active[idx]
			active = active[:last]
		}
	}

	if len(beacons) > count {
		beacons = beacons[:count]
	}
	return beacons
}

func (s *poissonDiscSampler) maxAttempts() int {
	if s.config.MaxAttempts <= 0 {
		return 30
	}
	return s.config.MaxAttempts
}

func (s *poissonDiscSampler) generateAnnulusPoint(origin BeaconCandidate) BeaconCandidate {
	radius := s.minDistance + s.minDistance*s.rng.Float64()
	angle := s.rng.Float64() * 2 * math.Pi
	return BeaconCandidate{
		X: origin.X + radius*math.Cos(angle),
		Y: origin.Y + radius*math.Sin(angle),
	}
}

func (s *poissonDiscSampler) withinBounds(candidate BeaconCandidate) bool {
	if candidate.X < s.bounds.MinX+s.marginX || candidate.X > s.bounds.MaxX-s.marginX {
		return false
	}
	if candidate.Y < s.bounds.MinY+s.marginY || candidate.Y > s.bounds.MaxY-s.marginY {
		return false
	}
	return true
}

func (s *poissonDiscSampler) isValid(candidate BeaconCandidate) bool {
	key := s.gridKey(candidate.X, candidate.Y)
	minSq := s.minDistance * s.minDistance
	for gx := key.X - 2; gx <= key.X+2; gx++ {
		for gy := key.Y - 2; gy <= key.Y+2; gy++ {
			cell := s.grid[gridKey{X: gx, Y: gy}]
			for _, existing := range cell {
				dx := existing.X - candidate.X
				dy := existing.Y - candidate.Y
				if dx*dx+dy*dy < minSq {
					return false
				}
			}
		}
	}
	return true
}

func (s *poissonDiscSampler) addToGrid(candidate BeaconCandidate) {
	key := s.gridKey(candidate.X, candidate.Y)
	s.grid[key] = append(s.grid[key], candidate)
}

func (s *poissonDiscSampler) gridKey(x, y float64) gridKey {
	if s.cellSize <= 0 {
		return gridKey{}
	}
	return gridKey{
		X: int(math.Floor((x - s.bounds.MinX) / s.cellSize)),
		Y: int(math.Floor((y - s.bounds.MinY) / s.cellSize)),
	}
}

func (s *poissonDiscSampler) randomPointInBounds() BeaconCandidate {
	width := s.bounds.MaxX - s.bounds.MinX - 2*s.marginX
	height := s.bounds.MaxY - s.bounds.MinY - 2*s.marginY
	if width < 0 {
		width = 0
	}
	if height < 0 {
		height = 0
	}
	return BeaconCandidate{
		X: s.bounds.MinX + s.marginX + s.rng.Float64()*width,
		Y: s.bounds.MinY + s.marginY + s.rng.Float64()*height,
	}
}

func (s *poissonDiscSampler) applyBiomeTaggers(x, y float64, existing map[string]bool) map[string]bool {
	tags := make(map[string]bool)
	for k, v := range existing {
		tags[k] = v
	}
	for _, tagger := range s.config.BiomeTaggers {
		if tagger == nil {
			continue
		}
		output := tagger(x, y)
		for k, v := range output {
			if !v {
				delete(tags, k)
				continue
			}
			tags[k] = v
		}
	}
	return tags
}

func copyTags(src map[string]bool) map[string]bool {
	if len(src) == 0 {
		return make(map[string]bool)
	}
	dst := make(map[string]bool, len(src))
	for k, v := range src {
		if v {
			dst[k] = true
		}
	}
	return dst
}

// QuadrantTagger tags beacons based on their quadrant and distance from center.
func QuadrantTagger(bounds Rect) BiomeTagger {
	width := bounds.MaxX - bounds.MinX
	height := bounds.MaxY - bounds.MinY
	if width <= 0 {
		width = WorldW
	}
	if height <= 0 {
		height = WorldH
	}
	centerX := bounds.MinX + width/2
	centerY := bounds.MinY + height/2
	maxDist := math.Hypot(width/2, height/2)
	if maxDist <= 0 {
		maxDist = 1
	}

	return func(x, y float64) map[string]bool {
		tags := make(map[string]bool)
		dist := math.Hypot(x-centerX, y-centerY)
		if dist < 0.3*maxDist {
			tags["tier-1"] = true
		} else if dist < 0.6*maxDist {
			tags["tier-2"] = true
		} else {
			tags["tier-3"] = true
		}

		switch {
		case x >= centerX && y >= centerY:
			tags["zone-ne"] = true
		case x < centerX && y >= centerY:
			tags["zone-nw"] = true
		case x >= centerX && y < centerY:
			tags["zone-se"] = true
		default:
			tags["zone-sw"] = true
		}

		return tags
	}
}
