import { memo } from "react";
import type { RecommendationWeightOption, RecommendedCombination } from "../types";

function formatHours(minutes: number) {
  const roundedHours = Math.round((minutes / 60) * 10) / 10;

  if (Number.isInteger(roundedHours)) {
    return `${roundedHours.toLocaleString()}h`;
  }

  return `${roundedHours.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}
export const RecommendedCombinationPanel = memo(function RecommendedCombinationPanel({
  recommendedCombination,
  capacity,
  weights,
  fairnessEnabled,
  remainingApprovalCount,
  isApprovalLimitReached,
  isApproving,
  isDisabled = false,
  onApprove,
}: {
  recommendedCombination: RecommendedCombination | null;
  capacity: number;
  weights: RecommendationWeightOption;
  fairnessEnabled: boolean;
  remainingApprovalCount: number;
  isApprovalLimitReached: boolean;
  isApproving: boolean;
  isDisabled?: boolean;
  onApprove: () => void;
}) {
  if (!recommendedCombination && !isApprovalLimitReached) return null;

  const pendingRecommendedRequests = recommendedCombination?.requests.filter(
    (request) => request.status !== "承認済",
  ) ?? [];
  const canApproveRecommended =
    !isDisabled &&
    pendingRecommendedRequests.length > 0 &&
    pendingRecommendedRequests.length <= remainingApprovalCount;

  return (
    <section className="mt-4 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 py-3 text-[#1d4ed8]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold">おすすめ承認組み合わせ</p>
          <p className="mt-1 text-xs">
            {fairnessEnabled
              ? `募集${capacity}人に対して、公平性を優先した承認候補です`
              : `募集${capacity}人に対して、おすすめの承認候補です`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {recommendedCombination && (
              <>
                {fairnessEnabled && (
                  <span className="rounded-md bg-white/80 px-2.5 py-1">
                    公平性 月平均 {formatHours(recommendedCombination.fairnessAverageMinutes)}
                  </span>
                )}
                <span className="rounded-md bg-white/80 px-2.5 py-1">
                  {fairnessEnabled ? "補助スコア" : "最終"} {recommendedCombination.finalScore.toFixed(1)}
                </span>
                <span className="rounded-md bg-white/80 px-2.5 py-1">
                  相性平均 {recommendedCombination.compatibilityAverage.toFixed(1)}
                </span>
                <span className="rounded-md bg-white/80 px-2.5 py-1">
                  業務スキル平均 {recommendedCombination.workScoreAverage.toFixed(1)}
                </span>
              </>
            )}
            <span className="rounded-md bg-white/80 px-2.5 py-1">
              {Math.round(weights.compatibilityWeight * 100)}% /{" "}
              {Math.round(weights.workScoreWeight * 100)}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendedCombination?.requests.map((request) => (
              <span
                key={request.id}
                className="rounded-md bg-white/80 px-2.5 py-1 text-xs font-semibold"
              >
                {request.employeeName}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={isApproving || !canApproveRecommended}
            onClick={onApprove}
            title={isDisabled ? "過去のシフト希望は承認できません" : undefined}
            className="h-9 rounded-md bg-[#1763ff] px-4 text-xs font-semibold text-white transition hover:bg-[#0f4ed8] disabled:cursor-not-allowed disabled:bg-[#cbd5e1] disabled:text-white"
          >
            {isDisabled
              ? "過去のシフト"
              : isApprovalLimitReached
                ? "募集人数に達しました"
                : pendingRecommendedRequests.length === 0
                  ? "承認済み"
                  : isApproving
                    ? "承認中..."
                    : pendingRecommendedRequests.length > remainingApprovalCount
                      ? "承認枠不足"
                      : "おすすめを一括承認"}
          </button>
        </div>
      </div>
    </section>
  );
});
