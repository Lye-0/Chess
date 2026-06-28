import type { RecommendationWeightId } from "@/lib/recommendationSettings";
import type { ShiftRequest } from "@/lib/shiftRequests";

export type ShiftForm = {
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  positionName: string;
  capacity: string;
};

export type RecommendedCombination = {
  requests: ShiftRequest[];
  finalScore: number;
  compatibilityAverage: number;
  workScoreAverage: number;
};

export type RecommendationWeightOption = {
  id: RecommendationWeightId;
  label: string;
  compatibilityWeight: number;
  workScoreWeight: number;
};
