import {
  getShiftRequestPositionLabel,
  type ShiftRequest,
} from "@/lib/shiftRequests";
import { getDateLabel } from "../date-utils";
import { RequestStatusBadge } from "./request-status-badge";
import { TrashIcon, WarningIcon, XIcon } from "./icons";

export function DeleteRequestModal({
  target,
  isProcessing,
  onClose,
  onConfirm,
}: {
  target: ShiftRequest;
  isProcessing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isApproved = target.status === "承認済";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
      <section className="w-full max-w-[640px] rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <WarningIcon />
            <h2 className="text-xl font-semibold">
              {isApproved ? "承認の取り消し" : "シフト希望の削除"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
          >
            <XIcon />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[#717182]">
          {isApproved
            ? "この承認を取り消し、承認待ちに戻します。申請自体は削除されません。"
            : "このシフト希望を削除します。この操作は元に戻せません。"}
        </p>

        <div className="mt-6 rounded-lg bg-[#f7f8fb] px-5 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{target.employeeName}</p>
              <p className="mt-2 text-sm text-[#475569]">
                {target.employeeEmail}
                <span className="ml-4">{target.employmentType}</span>
              </p>
              <p className="mt-2 font-mono text-sm font-semibold text-[#1d4ed8]">
                {target.employeeId}
              </p>
            </div>
            <RequestStatusBadge status={target.status} />
          </div>
          <p className="mt-4 text-sm font-semibold text-[#1d4ed8]">
            {getShiftRequestPositionLabel(target)}
          </p>
          <p className="mt-2 text-sm font-semibold text-[#475569]">
            {getDateLabel(target.date)}
            <span className="ml-4">
              {target.startTime} - {target.endTime}
            </span>
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="inline-flex h-10 items-center justify-center gap-3 rounded-md bg-[#db1741] text-sm font-semibold text-white transition hover:bg-[#c51239] disabled:cursor-not-allowed disabled:bg-[#c56c7f]"
          >
            <TrashIcon />
            {isProcessing
              ? "処理中..."
              : isApproved
                ? "承認を取り消す"
                : "削除する"}
          </button>
        </div>
      </section>
    </div>
  );
}
