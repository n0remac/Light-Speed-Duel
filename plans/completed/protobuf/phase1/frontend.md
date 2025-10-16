# Phase 1: Frontend Implementation (TypeScript)

## Overview

Update the TypeScript WebSocket client to send/receive protobuf binary messages instead of JSON.

## Prerequisites

- Protobuf schema defined (`proto/ws_messages.proto`)
- TypeScript code generated (`internal/server/web/src/proto/ws_messages.ts`)
- Protobuf runtime library installed (`@bufbuild/protobuf` or equivalent)

## Package Installation

```bash
cd internal/server/web
npm install @bufbuild/protobuf
# OR
npm install protobufjs
```

Choose `@bufbuild/protobuf` for smaller bundle size and better tree-shaking.

## File Changes

### Files to modify:
- `internal/server/web/src/net.ts` - WebSocket client
- `internal/server/web/src/game.ts` - Game state handling
- `internal/server/web/src/state.ts` - State type definitions (if needed)

### Files to create:
- `internal/server/web/src/proto_helpers.ts` - Conversion utilities

## Implementation Steps

### 1. Update State Type Definitions

The generated TypeScript types may not match existing interfaces. Create adapters:

```typescript
// internal/server/web/src/proto_helpers.ts
import type { Ghost, Missile, StateUpdate } from './proto/ws_messages';

// Adapter types for compatibility with existing code
export interface GhostSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  self: boolean;
  waypoints?: { x: number; y: number; speed: number }[];
  currentWaypointIndex?: number;
  hp: number;
  kills: number;
  heat?: {
    v: number;
    m: number;
    w: number;
    o: number;
    ms: number;
    su: number;
    ku: number;
    kd: number;
    ex: number;
  };
}

export interface MissileSnapshot {
  id: string;
  owner: string;
  self: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  agroRadius: number;
  lifetime: number;
  launch: number;
  expires: number;
  targetId?: string;
  heat?: {
    v: number;
    m: number;
    w: number;
    o: number;
    ms: number;
    su: number;
    ku: number;
    kd: number;
    ex: number;
  };
}

// Convert proto Ghost to GhostSnapshot
export function protoToGhost(proto: Ghost): GhostSnapshot {
  return {
    id: proto.id,
    x: proto.x,
    y: proto.y,
    vx: proto.vx,
    vy: proto.vy,
    t: proto.t,
    self: proto.self,
    waypoints: proto.waypoints?.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    currentWaypointIndex: proto.currentWaypointIndex,
    hp: proto.hp,
    kills: proto.kills,
    heat: proto.heat ? {
      v: proto.heat.v,
      m: proto.heat.m,
      w: proto.heat.w,
      o: proto.heat.o,
      ms: proto.heat.ms,
      su: proto.heat.su,
      ku: proto.heat.ku,
      kd: proto.heat.kd,
      ex: proto.heat.ex,
    } : undefined,
  };
}

// Convert proto Missile to MissileSnapshot
export function protoToMissile(proto: Missile): MissileSnapshot {
  return {
    id: proto.id,
    owner: proto.owner,
    self: proto.self,
    x: proto.x,
    y: proto.y,
    vx: proto.vx,
    vy: proto.vy,
    t: proto.t,
    agroRadius: proto.agroRadius,
    lifetime: proto.lifetime,
    launch: proto.launchTime,
    expires: proto.expiresAt,
    targetId: proto.targetId || undefined,
    heat: proto.heat ? {
      v: proto.heat.v,
      m: proto.heat.m,
      w: proto.heat.w,
      o: proto.heat.o,
      ms: proto.heat.ms,
      su: proto.heat.su,
      ku: proto.heat.ku,
      kd: proto.heat.kd,
      ex: proto.heat.ex,
    } : undefined,
  };
}

// Convert proto StateUpdate to AppState format
export function protoToState(proto: StateUpdate) {
  return {
    now: proto.now,
    me: protoToGhost(proto.me!),
    ghosts: proto.ghosts.map(protoToGhost),
    missiles: proto.missiles.map(protoToMissile),
    meta: {
      c: proto.meta!.c,
      w: proto.meta!.w,
      h: proto.meta!.h,
    },
    missileConfig: {
      speed: proto.missileConfig!.speed,
      speedMin: proto.missileConfig!.speedMin,
      speedMax: proto.missileConfig!.speedMax,
      agroMin: proto.missileConfig!.agroMin,
      agroRadius: proto.missileConfig!.agroRadius,
      lifetime: proto.missileConfig!.lifetime,
      heatConfig: proto.missileConfig!.heatConfig ? {
        max: proto.missileConfig!.heatConfig.max,
        warnAt: proto.missileConfig!.heatConfig.warnAt,
        overheatAt: proto.missileConfig!.heatConfig.overheatAt,
        markerSpeed: proto.missileConfig!.heatConfig.markerSpeed,
        kUp: proto.missileConfig!.heatConfig.kUp,
        kDown: proto.missileConfig!.heatConfig.kDown,
        exp: proto.missileConfig!.heatConfig.exp,
      } : undefined,
    },
    missileWaypoints: proto.missileWaypoints.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    missileRoutes: proto.missileRoutes.map(r => ({
      id: r.id,
      name: r.name,
      waypoints: r.waypoints.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    })),
    activeMissileRoute: proto.activeMissileRoute,
    nextMissileReady: proto.nextMissileReady,
  };
}
```

### 2. Update WebSocket Connection

Modify `internal/server/web/src/net.ts`:

```typescript
import { WsEnvelope } from './proto/ws_messages';
import { protoToState } from './proto_helpers';

export function connectToServer(url: string, onStateUpdate: (state: any) => void) {
  const ws = new WebSocket(url);

  // IMPORTANT: Set binary type to arraybuffer
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    console.log('Connected to server');
    // Send join message
    sendJoin(ws, playerName, roomId);
  };

  ws.onmessage = (event: MessageEvent) => {
    // event.data is ArrayBuffer
    if (!(event.data instanceof ArrayBuffer)) {
      console.warn('Received non-binary message, ignoring');
      return;
    }

    try {
      // Decode protobuf envelope
      const envelope = WsEnvelope.fromBinary(new Uint8Array(event.data));

      // Dispatch based on payload type
      if (envelope.payload.case === 'stateUpdate') {
        const state = protoToState(envelope.payload.value);
        onStateUpdate(state);
      } else if (envelope.payload.case === 'roomFull') {
        console.error('Room full:', envelope.payload.value.message);
        bus.emit('connection:error', { message: envelope.payload.value.message });
      } else {
        console.warn('Unknown message type:', envelope.payload.case);
      }
    } catch (err) {
      console.error('Failed to decode message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
  };

  return ws;
}
```

### 3. Update Send Functions

Replace JSON sending with protobuf:

```typescript
// Helper to send proto messages
function sendProto(ws: WebSocket, envelope: WsEnvelope) {
  const bytes = envelope.toBinary();
  ws.send(bytes);
}

// Join game
export function sendJoin(ws: WebSocket, name: string, room: string, mapW = 16000, mapH = 9000) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'join',
      value: {
        name,
        room,
        mapW,
        mapH,
      },
    },
  });
  sendProto(ws, envelope);
}

// Add waypoint
export function sendAddWaypoint(ws: WebSocket, x: number, y: number, speed: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'addWaypoint',
      value: { x, y, speed },
    },
  });
  sendProto(ws, envelope);
}

// Update waypoint speed
export function sendUpdateWaypoint(ws: WebSocket, index: number, speed: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'updateWaypoint',
      value: { index, speed },
    },
  });
  sendProto(ws, envelope);
}

// Move waypoint
export function sendMoveWaypoint(ws: WebSocket, index: number, x: number, y: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'moveWaypoint',
      value: { index, x, y },
    },
  });
  sendProto(ws, envelope);
}

// Delete waypoint
export function sendDeleteWaypoint(ws: WebSocket, index: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'deleteWaypoint',
      value: { index },
    },
  });
  sendProto(ws, envelope);
}

// Clear waypoints
export function sendClearWaypoints(ws: WebSocket) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'clearWaypoints',
      value: {},
    },
  });
  sendProto(ws, envelope);
}

// Configure missile
export function sendConfigureMissile(ws: WebSocket, speed: number, agro: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'configureMissile',
      value: {
        missileSpeed: speed,
        missileAgro: agro,
      },
    },
  });
  sendProto(ws, envelope);
}

// Launch missile
export function sendLaunchMissile(ws: WebSocket, routeId: string = '') {
  const envelope = new WsEnvelope({
    payload: {
      case: 'launchMissile',
      value: { routeId },
    },
  });
  sendProto(ws, envelope);
}

// Add missile waypoint
export function sendAddMissileWaypoint(ws: WebSocket, routeId: string, x: number, y: number, speed: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'addMissileWaypoint',
      value: { routeId, x, y, speed },
    },
  });
  sendProto(ws, envelope);
}

// Spawn bot
export function sendSpawnBot(ws: WebSocket) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'spawnBot',
      value: {},
    },
  });
  sendProto(ws, envelope);
}

// ... add remaining message types following same pattern
```

### 4. Update Existing Code References

Find all places that call `sendMessage()` or construct JSON objects and replace with typed proto functions:

```bash
# Search for old message sends
cd internal/server/web/src
grep -r "sendMessage" .
grep -r "JSON.stringify" .
```

Update each call site:

```typescript
// OLD:
sendMessage(ws, { type: 'add_waypoint', x: 100, y: 200, speed: 50 });

// NEW:
sendAddWaypoint(ws, 100, 200, 50);
```

### 5. Update TypeScript Build

Ensure `tsconfig.json` can handle generated proto files:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 6. Update Build Process

Ensure proto generation happens before TypeScript compilation:

```bash
# In package.json or build script
{
  "scripts": {
    "generate": "protoc --es_out=src/proto --es_opt=target=ts ../../../proto/ws_messages.proto",
    "build": "npm run generate && esbuild src/main.ts --bundle --outfile=client.js"
  }
}
```

Or update the Go generate command:

```go
// In internal/server/web.go or similar
//go:generate protoc --es_out=web/src/proto --es_opt=target=ts ../../proto/ws_messages.proto
//go:generate go run ./cmd/webbuild
```

### 7. Add Development Debugging

```typescript
// Add debug logging for proto messages
export function enableProtoDebug() {
  const originalSend = sendProto;

  (window as any).sendProto = (ws: WebSocket, envelope: WsEnvelope) => {
    console.log('[PROTO SEND]', envelope.payload.case, envelope.payload.value);
    originalSend(ws, envelope);
  };
}

// Call in development mode
if (import.meta.env.DEV) {
  enableProtoDebug();
}
```

### 8. Error Handling

Add robust error handling for malformed messages:

```typescript
ws.onmessage = (event: MessageEvent) => {
  if (!(event.data instanceof ArrayBuffer)) {
    console.warn('Received non-binary message');
    return;
  }

  try {
    const envelope = WsEnvelope.fromBinary(new Uint8Array(event.data));

    if (!envelope.payload) {
      console.error('Envelope has no payload');
      return;
    }

    handleMessage(envelope);
  } catch (err) {
    console.error('Proto decode error:', err);
    // Don't crash the game, just log and continue
    // Consider reconnection logic here
  }
};
```

## Testing

### Browser Console Testing

Open the browser console and verify:

```javascript
// Check WebSocket connection
console.log(ws.binaryType); // Should be "arraybuffer"

// Monitor incoming messages
ws.addEventListener('message', (e) => {
  console.log('Message size:', e.data.byteLength, 'bytes');
});
```

### Manual Testing Checklist

- [ ] Join game successfully
- [ ] Receive state updates at 20Hz
- [ ] Add waypoints to ship
- [ ] Update waypoint speeds
- [ ] Move waypoints
- [ ] Delete waypoints
- [ ] Configure missile parameters
- [ ] Add missile waypoints
- [ ] Launch missile
- [ ] Create/rename/delete missile routes
- [ ] Spawn bot
- [ ] Verify heat data displays correctly
- [ ] Check network tab: all frames are binary (not text)

### Unit Tests (Optional)

```typescript
// test/proto_helpers.test.ts
import { describe, it, expect } from 'vitest';
import { protoToGhost } from '../src/proto_helpers';
import { Ghost } from '../src/proto/ws_messages';

describe('proto_helpers', () => {
  it('converts proto Ghost to GhostSnapshot', () => {
    const proto = new Ghost({
      id: 'ship-123',
      x: 100,
      y: 200,
      vx: 10,
      vy: 20,
      t: 1234.5,
      self: true,
      hp: 3,
      kills: 5,
    });

    const snapshot = protoToGhost(proto);

    expect(snapshot.id).toBe('ship-123');
    expect(snapshot.x).toBe(100);
    expect(snapshot.y).toBe(200);
    expect(snapshot.hp).toBe(3);
    expect(snapshot.kills).toBe(5);
  });
});
```

## Bundle Size Analysis

Check the impact on JavaScript bundle size:

```bash
# Before protobuf
npm run build
ls -lh client.js

# After protobuf
npm run build
ls -lh client.js

# Analyze bundle composition
npx esbuild-visualizer client.js
```

Expected overhead: 15-30KB for protobuf runtime (gzipped).

## Browser Compatibility

Minimum browser versions required:
- Chrome 50+ (ArrayBuffer support)
- Firefox 48+
- Safari 10+
- Edge 14+

All modern browsers from 2016+ support binary WebSocket messages.

## Rollback Plan

If issues arise:
1. Keep JSON parsing code commented out (don't delete)
2. Add feature flag to toggle between JSON and protobuf
3. Deploy with flag disabled initially, test, then enable

```typescript
const USE_PROTOBUF = true; // Feature flag

if (USE_PROTOBUF) {
  // Binary path
} else {
  // Legacy JSON path
}
```

## Checklist

- [ ] Install `@bufbuild/protobuf` package
- [ ] Create `proto_helpers.ts` with conversion functions
- [ ] Update `net.ts` to set `binaryType = 'arraybuffer'`
- [ ] Update `net.ts` message handler to decode protobuf
- [ ] Create send functions for all command types
- [ ] Update all call sites to use typed send functions
- [ ] Update build scripts to generate proto before TypeScript
- [ ] Test in browser with all game features
- [ ] Verify bundle size increase is acceptable
- [ ] Check network tab shows binary frames
- [ ] Document proto update workflow

## Next Steps

After frontend implementation is complete:
- Test full round-trip with backend
- Measure performance (frame size, latency, FPS)
- Document any issues or limitations discovered
- Proceed to Phase 2 planning
