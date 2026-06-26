import { formatShiftTimeRange, type ShiftSlot } from "@/lib/shiftSlots";
import { getDateLabel } from "../date-utils";
import { TrashIcon, WarningIcon, XIcon } from "./icons";

export function DeleteSlotModal({
  target,
  isDeleting,
  onClose,
  onConfirm,
}: {
  target: ShiftSlot;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
      <section className="w-full max-w-[512px] rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <WarningIcon />
            <h2 className="text-xl font-semibold">シフト枠の削除</h2>
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
          以下のシフト枠を削除します。この操作は元に戻せません。従業員からの希望も同時に削除されます。
        </p>

        <div className="mt-6 rounded-lg bg-[#f7f8fb] px-4 py-4">
          <p className="font-semibold">{getDateLabel(target.date)}</p>
          <p className="mt-2 text-sm font-semibold text-[#1d4ed8]">
            {target.positionName || "ポジション未設定"}
          </p>
          <p className="mt-2 text-sm text-[#475569]">
            {formatShiftTimeRange(target.startTime, target.endTime)}
            <span className="ml-4">募集 {target.capacity}人</span>
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex h-10 items-center justify-center gap-3 rounded-md bg-[#db1741] text-sm font-semibold text-white transition hover:bg-[#c51239] disabled:cursor-not-allowed disabled:bg-[#c56c7f]"
          >
            <TrashIcon />
            {isDeleting ? "削除中..." : "削除する"}
          </button>
        </div>
      </section>
    </div>
  );
}
