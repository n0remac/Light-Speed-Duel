import type { TutorialStep } from "./engine";

function hasWaypointIndexAtLeast(payload: unknown, minIndex: number): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const index = (payload as { index?: unknown }).index;
  if (typeof index !== "number" || !Number.isFinite(index)) return false;
  return index >= minIndex;
}

function extractRouteId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const routeId = (payload as { routeId?: unknown }).routeId;
  return typeof routeId === "string" ? routeId : null;
}

function payloadToolEquals(target: string): (payload: unknown) => boolean {
  return (payload: unknown): boolean => {
    if (typeof payload !== "object" || payload === null) return false;
    const tool = (payload as { tool?: unknown }).tool;
    return typeof tool === "string" && tool === target;
  };
}

export function getBasicTutorialSteps(): TutorialStep[] {
  let routeSwitchesSinceEnter = 0;
  let initialRouteId: string | null = null;
  let newRouteId: string | null = null;

  return [
    {
      id: "ship-plot-route",
      target: "canvas",
      title: "Plot a route",
      body: "Click on the map to drop at least three waypoints and sketch your course.",
      advance: {
        kind: "event",
        event: "ship:waypointAdded",
        when: (payload) => hasWaypointIndexAtLeast(payload, 2),
      },
    },
    {
      id: "ship-change-speed",
      target: "shipSpeedSlider",
      title: "Adjust ship speed",
      body: "Use the Ship Speed slider (or press [ / ]) to fine-tune your travel speed.",
      advance: {
        kind: "event",
        event: "ship:speedChanged",
      },
    },
    {
      id: "ship-select-leg",
      target: "shipSelect",
      title: "Select a route leg",
      body: "Switch to Select mode (T key) and then click a waypoint on the map to highlight its leg.",
      advance: {
        kind: "event",
        event: "ship:legSelected",
        when: (payload) => hasWaypointIndexAtLeast(payload, 0),
      },
    },
    {
      id: "ship-delete-leg",
      target: "shipDelete",
      title: "Delete a route leg",
      body: "Remove the selected waypoint using the Delete control or the Delete key.",
      advance: {
        kind: "event",
        event: "ship:waypointDeleted",
      },
    },
    {
      id: "ship-clear-route",
      target: "shipClear",
      title: "Clear the route",
      body: "Clear remaining waypoints to reset your plotted course.",
      advance: {
        kind: "event",
        event: "ship:clearInvoked",
      },
    },
    {
      id: "missile-set-mode",
      target: "missileSet",
      title: "Switch to missile planning",
      body: "Tap Set so every click drops missile waypoints on the active route.",
      advance: {
        kind: "event",
        event: "missile:toolChanged",
        when: payloadToolEquals("set"),
      },
    },
    {
      id: "missile-plot-initial",
      target: "canvas",
      title: "Plot missile waypoints",
      body: "Click the map to drop at least two guidance points for the current missile route.",
      advance: {
        kind: "event",
        event: "missile:waypointAdded",
        when: (payload) => {
          if (!hasWaypointIndexAtLeast(payload, 1)) return false;
          const routeId = extractRouteId(payload);
          if (routeId) {
            initialRouteId = routeId;
          }
          return true;
        },
      },
    },
    {
      id: "missile-launch-initial",
      target: "missileLaunch",
      title: "Launch the strike",
      body: "Send the planned missile route live with the Launch control (L key).",
      advance: {
        kind: "event",
        event: "missile:launchRequested",
        when: (payload) => {
          const routeId = extractRouteId(payload);
          if (!routeId) return true;
          if (!initialRouteId) {
            initialRouteId = routeId;
            return true;
          }
          return routeId === initialRouteId;
        },
      },
    },
    {
      id: "missile-add-route",
      target: "missileAddRoute",
      title: "Create a new missile route",
      body: "Press New to add a second missile route for another strike group.",
      advance: {
        kind: "event",
        event: "missile:routeAdded",
        when: (payload) => {
          const routeId = extractRouteId(payload);
          if (!routeId) return false;
          newRouteId = routeId;
          return true;
        },
      },
    },
    {
      id: "missile-set-mode-again",
      target: "missileSet",
      title: "Return to Set mode",
      body: "Switch back to Set so you can chart waypoints on the new missile route.",
      advance: {
        kind: "event",
        event: "missile:toolChanged",
        when: payloadToolEquals("set"),
      },
    },
    {
      id: "missile-plot-new-route",
      target: "canvas",
      title: "Plot the new missile route",
      body: "Drop at least two waypoints on the new route to define its path.",
      advance: {
        kind: "event",
        event: "missile:waypointAdded",
        when: (payload) => {
          if (!hasWaypointIndexAtLeast(payload, 1)) return false;
          const routeId = extractRouteId(payload);
          if (newRouteId && routeId && routeId !== newRouteId) {
            return false;
          }
          if (!newRouteId && routeId) {
            newRouteId = routeId;
          }
          return true;
        },
      },
    },
    {
      id: "missile-launch-new-route",
      target: "missileLaunch",
      title: "Launch the new route",
      body: "Launch the fresh missile route to confirm its pattern.",
      advance: {
        kind: "event",
        event: "missile:launchRequested",
        when: (payload) => {
          const routeId = extractRouteId(payload);
          if (!newRouteId || !routeId) return true;
          return routeId === newRouteId;
        },
      },
    },
    {
      id: "missile-switch-route",
      target: "routeNext",
      title: "Switch back to the original route",
      body: "Use the ◀ ▶ controls (or Tab/Shift+Tab) to select your first missile route again.",
      onEnter: () => {
        routeSwitchesSinceEnter = 0;
      },
      advance: {
        kind: "event",
        event: "missile:activeRouteChanged",
        when: (payload) => {
          routeSwitchesSinceEnter += 1;
          if (routeSwitchesSinceEnter < 1) return false;
          const routeId = extractRouteId(payload);
          if (!initialRouteId || !routeId) {
            return true;
          }
          return routeId === initialRouteId;
        },
      },
    },
    {
      id: "missile-launch-after-switch",
      target: "missileLaunch",
      title: "Launch from the other route",
      body: "Fire the original missile route to practice round-robin strikes.",
      advance: {
        kind: "event",
        event: "missile:launchRequested",
        when: (payload) => {
          const routeId = extractRouteId(payload);
          if (!initialRouteId || !routeId) return true;
          return routeId === initialRouteId;
        },
      },
    },
    {
      id: "tutorial-practice",
      target: "spawnBot",
      title: "Spawn a practice bot",
      body: "Use the Bot control to add a target and rehearse these maneuvers in real time.",
      advance: {
        kind: "event",
        event: "bot:spawnRequested",
      },
      allowSkip: false,
    },
    {
      id: "tutorial-complete",
      target: null,
      title: "You’re ready",
      body: "Great work. Reload the console or rejoin a room to revisit these drills.",
      advance: {
        kind: "manual",
        nextLabel: "Finish",
      },
      allowSkip: false,
    },
  ];
}
