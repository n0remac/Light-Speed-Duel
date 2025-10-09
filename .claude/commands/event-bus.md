---
description: Work with the EventBus system
---

The EventBus is the central communication system for the frontend. All events are defined in `internal/server/web/src/bus.ts`.

**Adding a new event**:

1. Define in `EventMap` interface in bus.ts:
```typescript
export interface EventMap {
  "yourEvent:name": { data: string };  // with payload
  "anotherEvent": void;                // no payload
}
```

2. Emit events:
```typescript
bus.emit("yourEvent:name", { data: "value" });
bus.emit("anotherEvent");
```

3. Subscribe to events:
```typescript
const unsubscribe = bus.on("yourEvent:name", ({ data }) => {
  console.log(data);
});
// Later: unsubscribe();
```

**Existing event categories**:
- `context:*` - Input context changes
- `ship:*` - Ship-related events
- `missile:*` - Missile events
- `tutorial:*` - Tutorial system
- `dialogue:*` - Story system
- `audio:*` - Audio engine
- `state:*` - State updates
