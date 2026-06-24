import { memo, useCallback, useMemo } from "react";
import { formatShiftTimeRange } from "@/lib/shiftSlots";
import type { ShiftSlot } from "@/lib/shiftSlots";
import type { PayrollSettings } from "@/lib/payroll";
import type { ShiftRequest } from "@/lib/shiftRequests";
import type { CompatibilityScoreMap } from "@/lib/compatibilities";
import { getRecommendedCombination } from "../recommendation";
import type { RecommendationWeightOption, RecommendedCombination } from "../types";
import { SlotRequestStatus } from "./slot-request-status";
import { RecommendedCombinationPanel } from "./recommended-combination-panel";
import { ShiftRequestGroup } from "./shift-request-group";
import { PencilIcon, TrashIcon } from "./icons";

function ShiftSlotCard({
  slot,
  requests,
  displayedRequestCount,
  compatibilityScores,
  employeeWorkScores,
  weights,
  payrollSettings,
  approvingRequestId,
  deletingRequestId,
  isApprovingRecommended,
  onEdit,
  onDelete,
  onApproveRequest,
  onRemoveRequest,
  onApproveRecommended,
}: {
  slot: ShiftSlot;
  requests: ShiftRequest[];
  displayedRequestCount: number;
  compatibilityScores: CompatibilityScoreMap;
  employeeWorkScores: Record<string, number>;
  weights: RecommendationWeightOption;
  payrollSettings: PayrollSettings;
  approvingRequestId: string | null;
  deletingRequestId: string | null;
  isApprovingRecommended: boolean;
  onEdit: (slot: ShiftSlot) => void;
  onDelete: (slot: ShiftSlot) => void;
  onApproveRequest: (slotId: string, request: ShiftRequest) => void;
  onRemoveRequest: (request: ShiftRequest) => void;
  onApproveRecommended: (
    slotId: string,
    recommendedCombination: RecommendedCombination | null,
  ) => void;
}) {
  const approvedRequests = requests.filter(
    (request) => request.status === "承認済",
  );
  const pendingRequests = requests.filter(
    (request) => request.status !== "承認済",
  );
  const remainingApprovalCount = Math.max(
    0,
    slot.capacity - approvedRequests.length,
  );
  const isApprovalLimitReached = remainingApprovalCount === 0;

  const recommendedCombination = useMemo(
    () =>
      getRecommendedCombination({
        requests,
        capacity: slot.capacity,
        scores: compatibilityScores,
        employeeWorkScores,
        weights,
      }),
    [requests, slot.capacity, compatibilityScores, employeeWorkScores, weights],
  );

  const handleEdit = useCallback(() => onEdit(slot), [onEdit, slot]);
  const handleDelete = useCallback(() => onDelete(slot), [onDelete, slot]);
  const handleApprove = useCallback(
    (request: ShiftRequest) => onApproveRequest(slot.id, request),
    [onApproveRequest, slot.id],
  );
  const handleApproveRecommended = useCallback(
    () => onApproveRecommended(slot.id, recommendedCombination),
    [onApproveRecommended, slot.id, recommendedCombination],
  );

  return (
    <div className="rounded-lg bg-[#f7f8fb] px-4 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="font-semibold">
              {formatShiftTimeRange(slot.startTime, slot.endTime)}
            </p>
            <p className="text-sm text-[#475569]">募集: {slot.capacity}人</p>
          </div>
          <SlotRequestStatus requestCount={displayedRequestCount} />
        </div>

        <div className="flex items-center gap-5 self-end sm:self-auto">
          <button
            type="button"
            aria-label="シフト枠を編集"
            onClick={handleEdit}
            className="text-[#596074] transition hover:text-[#030213]"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            aria-label="シフト枠を削除"
            onClick={handleDelete}
            className="text-[#ff003d] transition hover:text-[#cc0031]"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <RecommendedCombinationPanel
        recommendedCombination={recommendedCombination}
        capacity={slot.capacity}
        weights={weights}
        remainingApprovalCount={remainingApprovalCount}
        isApproving={isApprovingRecommended}
        onApprove={handleApproveRecommended}
      />

      {requests.length > 0 && (
        <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 lg:grid-cols-2">
          <ShiftRequestGroup
            title="承認待ち"
            requests={pendingRequests}
            emptyText="承認待ちの希望はありません"
            approvingRequestId={approvingRequestId}
            deletingRequestId={deletingRequestId}
            payrollSettings={payrollSettings}
            isApprovalLimitReached={isApprovalLimitReached}
            onApprove={handleApprove}
            onRemove={onRemoveRequest}
          />
          <ShiftRequestGroup
            title="承認済み"
            requests={approvedRequests}
            emptyText="承認済みの希望はありません"
            approvingRequestId={approvingRequestId}
            deletingRequestId={deletingRequestId}
            payrollSettings={payrollSettings}
            onApprove={handleApprove}
            onRemove={onRemoveRequest}
          />
        </div>
      )}
    </div>
  );
}

export const MemoizedShiftSlotCard = memo(ShiftSlotCard);
