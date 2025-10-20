export interface MissionOfferDTO {
  missionId: string;
  templateId: string;
  displayName: string;
  archetype: string;
  objectives: string[];
  storyNodeId?: string;
  timeout: number;
}

export interface ObjectiveStateDTO {
  id: string;
  type: string;
  progress: number;
  complete: boolean;
  description: string;
}

export interface MissionUpdateDTO {
  missionId: string;
  status: string;
  objectives: ObjectiveStateDTO[];
  serverTime: number;
}
