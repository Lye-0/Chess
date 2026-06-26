import { memo } from "react";
import { calculateShiftPayroll, formatCurrency, type PayrollSettings } from "@/lib/payroll";
import {
  getShiftRequestPositionLabel,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { RequestStatusBadge } from "./request-status-badge";
import { TrashIcon } from "./icons";

type ShiftRequestGroupVariant = "pending" | "approved";

const variantCopy: Record<ShiftRequestGroupVariant, { title: string; emptyText: string }> = {
  pending: { title: "承認待ち", emptyText: "承認待ちの希望はありません" },
  approved: { title: "承認済み", emptyText: "承認済みの希望はありません" },
};

export const ShiftRequestGroup = memo(function ShiftRequestGroup({
  variant,
  requests,
  approvingRequestId,
  deletingRequestId,
  payrollSettings,
  isApprovalLimitReached = false,
  onApprove,
  onRemove,
}: {
  variant: ShiftRequestGroupVariant;
  requests: ShiftRequest[];
  approvingRequestId: string | null;
  deletingRequestId: string | null;
  payrollSettings: PayrollSettings;
  isApprovalLimitReached?: boolean;
  onApprove: (request: ShiftRequest) => void;
  onRemove: (request: ShiftRequest) => void;
}) {
  const { title, emptyText } = variantCopy[variant];
  const filteredRequests = requests.filter((request) =>
    variant === "approved"
      ? request.status === "承認済"
      : request.status !== "承認済",
  );

  return (
    <section className="rounded-md border border-black/10 bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-[#eef2f7] px-2.5 py-0.5 text-xs font-semibold text-[#475569]">
          {filteredRequests.length}人
        </span>
      </div>

      {filteredRequests.length === 0 ? (
        <p className="mt-3 text-xs text-[#717182]">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {filteredRequests.map((request) => {
            const approved = request.status === "承認済";
            const approving = approvingRequestId === request.id;
            const deleting = deletingRequestId === request.id;
            const approvalDisabled =
              approving || deleting || isApprovalLimitReached;
            const payroll = calculateShiftPayroll(request, payrollSettings);

            return (
              <div
                key={request.id}
                className="flex flex-col gap-3 rounded-md bg-[#f7f8fb] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {request.employeeName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#717182]">
                    {request.employeeEmail} / {request.employmentType}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-[#1d4ed8]">
                    {getShiftRequestPositionLabel(request)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#00a63e]">
                    {formatCurrency(payroll.totalPay)}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <RequestStatusBadge status={request.status} />
                  {!approved && (
                    <button
                      type="button"
                      disabled={approvalDisabled}
                      onClick={() => onApprove(request)}
                      title={
                        isApprovalLimitReached
                          ? "募集人数に達しているため承認できません"
                          : undefined
                      }
                      className="h-8 rounded-md bg-[#030213] px-3 text-xs font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#d1d5db] disabled:text-white"
                    >
                      {approving ? "承認中..." : "承認"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={
                      approved
                        ? `${request.employeeName}の承認を取り消す`
                        : `${request.employeeName}のシフト希望を削除`
                    }
                    disabled={deleting}
                    onClick={() => onRemove(request)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#ff003d] transition hover:bg-[#ffe8ee] hover:text-[#cc0031] disabled:cursor-not-allowed disabled:text-[#c56c7f]"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});
