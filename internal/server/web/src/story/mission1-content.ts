/**
 * Mission 1: Signal In The Static - Story Content
 * Maps DAG story nodes to dialogue and tutorial content
 */

export interface DialogueChoice {
  id: string;
  text: string;
}

export interface DialogueContent {
  speaker: string;
  text: string;
  intent?: "factory" | "unit";
  typingSpeedMs?: number;
  continueLabel?: string;
  choices?: DialogueChoice[];
  autoAdvance?: {
    delayMs: number;
  };
  tutorialTip?: {
    title: string;
    text: string;
  };
}

export const MISSION_1_CONTENT: Record<string, DialogueContent> = {
  // Mission start - garbled distress signal
  "story.signal-static-1.start": {
    speaker: "UNKNOWN SIGNAL",
    text: "–gnal… —issus… co–dinates…\n\n[A weak signal crackles through the void. The transmission is nearly unintelligible, but coordinates emerge from the static. Something—or someone—needs help.]",
    intent: "factory",
    typingSpeedMs: 20,
    choices: [
      { id: "investigate", text: "Investigate the signal" },
      { id: "cautious", text: "Approach with extreme caution" },
      { id: "ignore", text: "Log coordinates and continue patrol" },
    ],
    tutorialTip: {
      title: "Route Plotting",
      text: "Click on the map to plot waypoints for your ship. Right-click waypoints to adjust speed. Your route determines your heat buildup.",
    },
  },

  // Beacon 1 locked - signal improving
  "story.signal-static-1.beacon-1": {
    speaker: "DISTRESS BEACON",
    text: "Signal improving… triangulating source… maintain low thrust.\n\n[The first beacon lock stabilizes the transmission. The signal is getting clearer, but you'll need to reach more beacons to pinpoint the origin.]",
    intent: "factory",
    typingSpeedMs: 18,
    continueLabel: "Continue",
    tutorialTip: {
      title: "Heat Management",
      text: "Watch your heat gauge. Flying too fast heats your ship. If you overheat, you'll stall. Match your speed to the marker line for optimal efficiency.",
    },
  },

  // Beacon 2 locked - possible survivors
  "story.signal-static-1.beacon-2": {
    speaker: "DISTRESS BEACON",
    text: "Possible survivors detected… uplink unstable… watch for debris.\n\n[The second beacon reveals faint life signs. Something survived out here. The transmission warns of hazards ahead—proceed with caution.]",
    intent: "factory",
    typingSpeedMs: 18,
    continueLabel: "Proceed Carefully",
    tutorialTip: {
      title: "Evasive Routing",
      text: "Plot routes that avoid obstacles and give you reaction time. Light-time delay means you see missiles where they were, not where they are. Plan ahead.",
    },
  },

  // Beacon 3 locked - seeker signatures detected
  "story.signal-static-1.beacon-3": {
    speaker: "DISTRESS BEACON",
    text: "Beacon lock acquired… seeker signatures detected nearby… extreme caution advised.\n\n[The third beacon triangulates the distress source, but passive sensors detect automated defense systems. Whatever's out there, it's heavily guarded.]",
    intent: "factory",
    typingSpeedMs: 18,
    continueLabel: "Approach Final Beacon",
    tutorialTip: {
      title: "Combat Awareness",
      text: "Hostile seekers patrol this sector. Keep your speed low to avoid detection. High-speed runs generate heat signatures that draw attention.",
    },
  },

  // Mission complete - archives unlocked
  "story.signal-static-1.complete": {
    speaker: "UNIT-0 ARCHIVES",
    text: "Unit-0, you found us.\n\nArchives unlocked. Emergency protocols bypassed. Uploading next mission parameters to your nav system.\n\n[The distress signal resolves into a data stream. Ancient archives flicker to life, revealing coordinates for your next objective.]",
    intent: "unit",
    typingSpeedMs: 16,
    continueLabel: "Mission Complete",
  },
};

/**
 * Get dialogue content for a story node ID
 */
export function getDialogueForNode(nodeId: string): DialogueContent | null {
  return MISSION_1_CONTENT[nodeId] || null;
}

/**
 * Check if a node has tutorial content
 */
export function hasTutorialTip(nodeId: string): boolean {
  const content = MISSION_1_CONTENT[nodeId];
  return !!(content?.tutorialTip);
}
