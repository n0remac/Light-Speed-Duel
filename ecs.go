package main

type EntityID int64

type ComponentKey string

type World struct {
	nextEntity EntityID
	components map[ComponentKey]map[EntityID]any
}

func newWorld() *World {
	return &World{
		nextEntity: 0,
		components: make(map[ComponentKey]map[EntityID]any),
	}
}

func (w *World) NewEntity() EntityID {
	w.nextEntity++
	return w.nextEntity
}

func (w *World) SetComponent(id EntityID, key ComponentKey, value any) {
	store, ok := w.components[key]
	if !ok {
		store = make(map[EntityID]any)
		w.components[key] = store
	}
	store[id] = value
}

func (w *World) RemoveComponent(id EntityID, key ComponentKey) {
	if store, ok := w.components[key]; ok {
		delete(store, id)
	}
}

func (w *World) GetComponent(id EntityID, key ComponentKey) (any, bool) {
	if store, ok := w.components[key]; ok {
		val, ok := store[id]
		return val, ok
	}
	return nil, false
}

func (w *World) HasComponent(id EntityID, key ComponentKey) bool {
	if store, ok := w.components[key]; ok {
		_, ok := store[id]
		return ok
	}
	return false
}

func (w *World) RemoveEntity(id EntityID) {
	for _, store := range w.components {
		delete(store, id)
	}
}

func (w *World) ForEach(required []ComponentKey, fn func(EntityID)) {
	if len(required) == 0 {
		return
	}
	first := w.components[required[0]]
	if first == nil {
		return
	}
	for id := range first {
		match := true
		for _, key := range required[1:] {
			if store := w.components[key]; store == nil {
				match = false
				break
			} else if _, ok := store[id]; !ok {
				match = false
				break
			}
		}
		if match {
			fn(id)
		}
	}
}

func (w *World) Exists(id EntityID) bool {
	for _, store := range w.components {
		if _, ok := store[id]; ok {
			return true
		}
	}
	return false
}
