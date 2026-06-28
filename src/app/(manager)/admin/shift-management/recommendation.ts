import type { CompatibilityScoreMap } from "@/lib/compatibilities";
import { defaultWorkScore } from "@/lib/people";
import type { ShiftRequest } from "@/lib/shiftRequests";
import type { RecommendationWeightOption, RecommendedCombination } from "./types";

function getCompatibilityScore(
  scores: CompatibilityScoreMap,
  fromEmployeeId: string,
  toEmployeeId: string,
) {
  return scores[fromEmployeeId]?.[toEmployeeId] ?? 0;
}

function getEmployeeWorkScore(
  employeeWorkScores: Record<string, number>,
  employeeId: string,
) {
  return employeeWorkScores[employeeId] ?? defaultWorkScore;
}

function getCompatibilityAverage(
  requests: ShiftRequest[],
  scores: CompatibilityScoreMap,
) {
  const pairCount = (requests.length * (requests.length - 1)) / 2;
  if (pairCount === 0) return 0;

  let scoreTotal = 0;

  for (let firstIndex = 0; firstIndex < requests.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < requests.length;
      secondIndex += 1
    ) {
      const firstRequest = requests[firstIndex];
      const secondRequest = requests[secondIndex];
      const mutualCompatibility =
        (getCompatibilityScore(
          scores,
          firstRequest.employeeId,
          secondRequest.employeeId,
        ) +
          getCompatibilityScore(
            scores,
            secondRequest.employeeId,
            firstRequest.employeeId,
          )) /
        2;

      scoreTotal += mutualCompatibility;
    }
  }

  return scoreTotal / pairCount;
}

function getWorkScoreAverage(
  requests: ShiftRequest[],
  employeeWorkScores: Record<string, number>,
) {
  if (requests.length === 0) return 0;

  const scoreTotal = requests.reduce(
    (total, request) =>
      total + getEmployeeWorkScore(employeeWorkScores, request.employeeId),
    0,
  );

  return scoreTotal / requests.length;
}

function getFairnessAverageMinutes(
  requests: ShiftRequest[],
  employeeMonthlyMinutes: Record<string, number>,
) {
  if (requests.length === 0) return 0;

  const minutesTotal = requests.reduce(
    (total, request) => total + (employeeMonthlyMinutes[request.employeeId] ?? 0),
    0,
  );

  return minutesTotal / requests.length;
}

function getCombinationScore({
  requests,
  scores,
  employeeWorkScores,
  employeeMonthlyMinutes,
  weights,
}: {
  requests: ShiftRequest[];
  scores: CompatibilityScoreMap;
  employeeWorkScores: Record<string, number>;
  employeeMonthlyMinutes: Record<string, number>;
  weights: RecommendationWeightOption;
}) {
  const fairnessAverageMinutes = getFairnessAverageMinutes(
    requests,
    employeeMonthlyMinutes,
  );
  const compatibilityAverage = getCompatibilityAverage(requests, scores);
  const workScoreAverage = getWorkScoreAverage(requests, employeeWorkScores);
  const finalScore =
    compatibilityAverage * weights.compatibilityWeight +
    workScoreAverage * weights.workScoreWeight;

  return {
    finalScore,
    fairnessAverageMinutes,
    compatibilityAverage,
    workScoreAverage,
  };
}

export function getRecommendedCombination({
  requests,
  capacity,
  scores,
  employeeWorkScores,
  employeeMonthlyMinutes,
  weights,
  fairnessEnabled,
}: {
  requests: ShiftRequest[];
  capacity: number;
  scores: CompatibilityScoreMap;
  employeeWorkScores: Record<string, number>;
  employeeMonthlyMinutes: Record<string, number>;
  weights: RecommendationWeightOption;
  fairnessEnabled: boolean;
}): RecommendedCombination | null {
  const targetCount = Math.min(Math.max(1, capacity), requests.length);
  if (requests.length === 0 || targetCount === 0) return null;

  let bestCombination: ShiftRequest[] = [];
  let bestScore: Omit<RecommendedCombination, "requests"> = {
    finalScore: Number.NEGATIVE_INFINITY,
    fairnessAverageMinutes: Number.POSITIVE_INFINITY,
    compatibilityAverage: 0,
    workScoreAverage: 0,
  };

  function walk(startIndex: number, combination: ShiftRequest[]) {
    if (combination.length === targetCount) {
      const score = getCombinationScore({
        requests: combination,
        scores,
        employeeWorkScores,
        employeeMonthlyMinutes,
        weights,
      });
      const isFairer = score.fairnessAverageMinutes < bestScore.fairnessAverageMinutes;
      const isSameFairness =
        score.fairnessAverageMinutes === bestScore.fairnessAverageMinutes;
      const isBetterWeightedScore = score.finalScore > bestScore.finalScore;

      if (
        (fairnessEnabled && (isFairer || (isSameFairness && isBetterWeightedScore))) ||
        (!fairnessEnabled && isBetterWeightedScore)
      ) {
        bestScore = score;
        bestCombination = combination;
      }
      return;
    }

    const remainingSlots = targetCount - combination.length;
    const lastStartIndex = requests.length - remainingSlots;

    for (let index = startIndex; index <= lastStartIndex; index += 1) {
      walk(index + 1, [...combination, requests[index]]);
    }
  }

  walk(0, []);

  return {
    requests: bestCombination,
    finalScore: bestScore.finalScore,
    fairnessAverageMinutes: bestScore.fairnessAverageMinutes,
    compatibilityAverage: bestScore.compatibilityAverage,
    workScoreAverage: bestScore.workScoreAverage,
  };
}
