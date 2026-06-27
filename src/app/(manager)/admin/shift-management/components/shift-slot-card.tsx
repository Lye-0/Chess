import { memo, useCallback, useMemo, useState } from "react";
import { formatShiftTimeRange } from "@/lib/shiftSlots";
import type { ShiftSlot } from "@/lib/shiftSlots";
import type { PayrollSettings } from "@/lib/payroll";
import type { ShiftRequest } from "@/lib/shiftRequests";
import type { CompatibilityScoreMap } from "@/lib/compatibilities";
import { getRecommendedCombination } from "../recommendation";
import type { RecommendationWeightOption, RecommendedCombination } from "../types";
import { RecommendedCombinationPanel } from "./recommended-combination-panel";
import { ShiftRequestGroup } from "./shift-request-group";
import { PencilIcon, TrashIcon } from "./icons";

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function isShiftEnded(slot: Pick<ShiftSlot, "date" | "startTime" | "endTime">) {
  const endAt = new Date(`${slot.date}T${slot.endTime}:00`);

  if (parseTimeToMinutes(slot.endTime) <= parseTimeToMinutes(slot.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return !Number.isNaN(endAt.getTime()) && endAt <= new Date();
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={[
        "h-4 w-4 transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

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
  const [isOpen, setIsOpen] = useState(false);
  const approvedCount = requests.filter(
    (request) => request.status === "承認済",
  ).length;
  const remainingApprovalCount = Math.max(0, slot.capacity - approvedCount);
  const isApprovalLimitReached = remainingApprovalCount === 0;
  const isPastSlot = isShiftEnded(slot);
  const isEmployeeGeneratedSlot =
    slot.employeeGenerated || slot.id.startsWith("employee-generated:");

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

  const handleToggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={handleToggle}
          className="flex min-w-0 flex-1 items-start justify-between gap-4 rounded-md text-left transition hover:bg-black/[0.03] focus:outline-none focus:ring-2 focus:ring-[#030213]/20"
        >
          <div className="min-w-0 px-1 py-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="font-semibold">
                {formatShiftTimeRange(slot.startTime, slot.endTime)}
              </p>
              {isEmployeeGeneratedSlot && (
                <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">
                  従業員追加枠
                </span>
              )}
              <span className="rounded-md bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#1d4ed8]">
                {slot.positionName || "ポジション未設定"}
              </span>
              <p className="text-sm text-[#475569]">募集: {slot.capacity}人</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-5">
              <p className={displayedRequestCount > 0 ? "text-[#1763ff]" : "text-[#ff3b00]"}>
                {displayedRequestCount > 0 ? `希望者: ${displayedRequestCount}人` : "希望者なし"}
              </p>
              <p className="text-[#15803d]">
                承認: {approvedCount}/{slot.capacity}人
              </p>
            </div>
          </div>
          <span className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#596074]">
            <ChevronIcon open={isOpen} />
          </span>
        </button>

        {!isEmployeeGeneratedSlot && (
          <div className="flex items-center gap-5 self-end px-1 py-2 sm:self-auto">
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
        )}
      </div>

      {isOpen && (
        <>
          {!isEmployeeGeneratedSlot && (
            <RecommendedCombinationPanel
              recommendedCombination={recommendedCombination}
              capacity={slot.capacity}
              weights={weights}
              remainingApprovalCount={remainingApprovalCount}
              isApproving={isApprovingRecommended}
              isDisabled={isPastSlot}
              onApprove={handleApproveRecommended}
            />
          )}

          {requests.length > 0 && (
            <div className="mt-4 grid gap-3 border-t border-black/10 pt-3 lg:grid-cols-2">
              <ShiftRequestGroup
                variant="pending"
                requests={requests}
                approvingRequestId={approvingRequestId}
                deletingRequestId={deletingRequestId}
                payrollSettings={payrollSettings}
                isApprovalLimitReached={isEmployeeGeneratedSlot ? false : isApprovalLimitReached}
                isPastSlot={isPastSlot}
                onApprove={handleApprove}
                onRemove={onRemoveRequest}
              />
              <ShiftRequestGroup
                variant="approved"
                requests={requests}
                approvingRequestId={approvingRequestId}
                deletingRequestId={deletingRequestId}
                payrollSettings={payrollSettings}
                isPastSlot={isPastSlot}
                onApprove={handleApprove}
                onRemove={onRemoveRequest}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const MemoizedShiftSlotCard = memo(ShiftSlotCard);