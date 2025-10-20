package game

import (
	"math"
	"testing"
)

func TestDistanceEvaluatorComplete(t *testing.T) {
	room := &Room{
		World:      newWorld(),
		WorldWidth: 1000,
	}
	player := &Player{Ship: room.World.NewEntity()}
	room.World.SetComponent(player.Ship, CompTransform, &Transform{Pos: Vec2{X: 100, Y: 100}})

	eval := &DistanceEvaluator{
		TargetX:   110,
		TargetY:   110,
		Threshold: 20,
	}
	done, progress := eval.Evaluate(room, player)
	if !done {
		t.Fatalf("expected distance evaluator to complete")
	}
	if progress != 1 {
		t.Fatalf("expected full progress, got %.2f", progress)
	}
}

func TestDistanceEvaluatorProgress(t *testing.T) {
	room := &Room{
		World:      newWorld(),
		WorldWidth: 1000,
	}
	player := &Player{Ship: room.World.NewEntity()}
	room.World.SetComponent(player.Ship, CompTransform, &Transform{Pos: Vec2{X: 0, Y: 0}})

	threshold := 10.0
	target := Vec2{X: threshold * 2, Y: 0}
	eval := &DistanceEvaluator{
		TargetX:   target.X,
		TargetY:   target.Y,
		Threshold: threshold,
	}
	done, progress := eval.Evaluate(room, player)
	if done {
		t.Fatalf("expected distance evaluator to be incomplete")
	}
	expected := 0.5
	if math.Abs(progress-expected) > 0.001 {
		t.Fatalf("expected progress %.2f, got %.2f", expected, progress)
	}
}

func TestKillCountEvaluator(t *testing.T) {
	room := &Room{World: newWorld()}
	tag := "enemy"
	for i := 0; i < 5; i++ {
		id := room.World.NewEntity()
		room.World.SetComponent(id, CompTags, &TagComponent{Tags: map[string]bool{tag: true}})
		if i < 3 {
			room.World.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: 1})
		}
	}
	eval := &KillCountEvaluator{
		TargetTag:     tag,
		RequiredKills: 5,
	}
	done, progress := eval.Evaluate(room, nil)
	if done {
		t.Fatalf("expected kill evaluator incomplete")
	}
	expected := 0.6
	if math.Abs(progress-expected) > 0.001 {
		t.Fatalf("expected progress %.2f, got %.2f", expected, progress)
	}
	// Mark remaining as destroyed
	room.World.ForEach([]ComponentKey{CompTags}, func(id EntityID) {
		room.World.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: 2})
	})
	done, progress = eval.Evaluate(room, nil)
	if !done || progress != 1 {
		t.Fatalf("expected kill evaluator complete, got done=%v progress=%.2f", done, progress)
	}
}

func TestTimerEvaluator(t *testing.T) {
	room := &Room{Now: 5}
	eval := &TimerEvaluator{
		StartTime:    0,
		RequiredTime: 10,
	}
	if done, progress := eval.Evaluate(room, nil); done || progress <= 0 {
		t.Fatalf("expected timer incomplete with positive progress, got done=%v progress=%.2f", done, progress)
	}
	room.Now = 12
	if done, progress := eval.Evaluate(room, nil); !done || progress != 1 {
		t.Fatalf("expected timer complete, got done=%v progress=%.2f", done, progress)
	}
}

func TestHazardClearEvaluator(t *testing.T) {
	room := &Room{World: newWorld()}
	center := Vec2{X: 50, Y: 50}
	for i := 0; i < 3; i++ {
		id := room.World.NewEntity()
		room.World.SetComponent(id, CompTags, &TagComponent{Tags: map[string]bool{"mine": true}})
		room.World.SetComponent(id, CompTransform, &Transform{Pos: Vec2{X: center.X + float64(i), Y: center.Y}})
		if i == 0 {
			room.World.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: 1})
		}
	}
	eval := &HazardClearEvaluator{
		CenterX: center.X,
		CenterY: center.Y,
		Radius:  10,
	}
	done, progress := eval.Evaluate(room, nil)
	if done {
		t.Fatalf("expected hazard evaluator incomplete")
	}
	expected := float64(1) / 3
	if math.Abs(progress-expected) > 0.001 {
		t.Fatalf("expected progress %.2f, got %.2f", expected, progress)
	}
	// Destroy remaining mines
	room.World.ForEach([]ComponentKey{CompTags}, func(id EntityID) {
		room.World.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: 2})
	})
	done, progress = eval.Evaluate(room, nil)
	if !done || progress != 1 {
		t.Fatalf("expected hazard evaluator complete, got done=%v progress=%.2f", done, progress)
	}
}
