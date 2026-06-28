import type { FormEvent } from "react";
import type { OrganizationPosition } from "@/lib/managerOrganizations";
import {
  isFourDigitShiftDate,
  isOvernightShiftTime,
  isValidShiftTimeRange,
} from "@/lib/shiftSlots";
import { normalizeDateInput } from "../date-utils";
import type { ShiftForm } from "../types";
import { XIcon } from "./icons";

export function ShiftFormModal({
  editingId,
  form,
  positions,
  onFormChange,
  isMonthlyPattern,
  onMonthlyPatternChange,
  monthlyPatternCount,
  isEditingRequestedSlot,
  editedSlotStartsInFuture,
  formStartsInFuture,
  minimumCapacity,
  editingApprovedCount,
  capacityValue,
  canSave,
  isSaving,
  onClose,
  onSubmit,
}: {
  editingId: string | null;
  form: ShiftForm;
  positions: OrganizationPosition[];
  onFormChange: (form: ShiftForm) => void;
  isMonthlyPattern: boolean;
  onMonthlyPatternChange: (enabled: boolean) => void;
  monthlyPatternCount: number;
  isEditingRequestedSlot: boolean;
  editedSlotStartsInFuture: boolean;
  formStartsInFuture: boolean;
  minimumCapacity: number;
  editingApprovedCount: number;
  capacityValue: number;
  canSave: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 sm:items-center">
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-[512px] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {editingId ? "シフト枠を編集" : "シフト枠を追加"}
            </h2>
            <p className="mt-1 text-sm text-[#717182]">
              従業員が希望できるシフト枠を設定します
            </p>
            {isEditingRequestedSlot && (
              <p className="mt-3 rounded-md bg-[#fff7ed] px-3 py-2 text-sm text-[#c2410c]">
                希望者がいるため、日付・開始時刻・終了時刻・ポジションは変更できません。募集人数のみ変更できます。
              </p>
            )}
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

        <div className="mt-8 space-y-5">
          <div>
            <label htmlFor="shift-date" className="block text-sm font-semibold">
              日付
            </label>
            <input
              id="shift-date"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={form.date}
              disabled={isEditingRequestedSlot}
              onChange={(event) => {
                const nextDate = normalizeDateInput(event.target.value);
                if (nextDate === null) return;

                onFormChange({ ...form, date: nextDate });
              }}
              className="mt-2 h-10 w-full rounded-md border border-black/20 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
            />
            {!editingId && !isEditingRequestedSlot && (
              <label className="mt-3 flex items-start gap-2 rounded-md border border-black/10 bg-[#f7f8fb] px-3 py-2 text-sm text-[#475569]">
                <input
                  type="checkbox"
                  checked={isMonthlyPattern}
                  onChange={(event) => onMonthlyPatternChange(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-black/20"
                />
                <span>
                  <span className="block font-semibold text-[#030213]">
                    この曜日で月内一括作成
                  </span>
                  <span className="mt-1 block text-xs text-[#717182]">
                    選択した日付と同じ曜日の未来日をまとめて募集します。
                    {isMonthlyPattern && ` 作成予定: ${monthlyPatternCount}件`}
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="shift-start" className="block text-sm font-semibold">
                開始時刻
              </label>
              <input
                id="shift-start"
                type="time"
                value={form.startTime}
                disabled={isEditingRequestedSlot}
                onChange={(event) => onFormChange({ ...form, startTime: event.target.value })}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
              />
            </div>

            <div>
              <label htmlFor="shift-end" className="block text-sm font-semibold">
                終了時刻
              </label>
              <input
                id="shift-end"
                type="time"
                value={form.endTime}
                disabled={isEditingRequestedSlot}
                onChange={(event) => onFormChange({ ...form, endTime: event.target.value })}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
              />
            </div>
          </div>

          {!isEditingRequestedSlot && form.startTime && form.endTime && (
            <p
              className={[
                "rounded-md px-3 py-2 text-sm",
                form.startTime === form.endTime
                  ? "bg-[#fff1f1] text-[#b00020]"
                  : isFourDigitShiftDate(form.date) &&
                      isValidShiftTimeRange(form.startTime, form.endTime) &&
                      !formStartsInFuture
                    ? "bg-[#fff1f1] text-[#b00020]"
                  : isOvernightShiftTime(form.startTime, form.endTime)
                    ? "bg-[#eff6ff] text-[#1d4ed8]"
                    : "bg-[#f7f8fb] text-[#475569]",
              ].join(" ")}
            >
              {form.startTime === form.endTime
                ? "開始時刻と終了時刻は別の時刻にしてください。"
                : isFourDigitShiftDate(form.date) &&
                    isValidShiftTimeRange(form.startTime, form.endTime) &&
                    !formStartsInFuture
                  ? "過去または開始済みの日時ではシフト枠を登録できません。"
                : isOvernightShiftTime(form.startTime, form.endTime)
                  ? "終了時刻は翌日の時刻として保存されます。"
                  : "同じ日のシフトとして保存されます。"}
            </p>
          )}

          {isEditingRequestedSlot && !editedSlotStartsInFuture && (
            <p className="rounded-md bg-[#fff1f1] px-3 py-2 text-sm text-[#b00020]">
              このシフトは過去または開始済みのため更新できません。
            </p>
          )}
          <div>
            <label htmlFor="shift-position" className="block text-sm font-semibold">
              ポジション
            </label>
            {positions.length === 0 ? (
              <p className="mt-2 rounded-md bg-[#fff7ed] px-3 py-2 text-sm text-[#c2410c]">
                ポジションが未登録です。従業員登録画面からポジションを追加してください。
              </p>
            ) : (
              <select
                id="shift-position"
                value={form.positionId}
                disabled={isEditingRequestedSlot}
                onChange={(event) => {
                  const selectedPosition = positions.find(
                    (position) => position.id === event.target.value,
                  );
                  onFormChange({
                    ...form,
                    positionId: selectedPosition?.id ?? "",
                    positionName: selectedPosition?.name ?? "",
                  });
                }}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm outline-none focus:border-[#030213] disabled:cursor-not-allowed disabled:bg-[#f0f1f4] disabled:text-[#717182]"
              >
                <option value="" disabled>
                  ポジションを選択
                </option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.name}
                  </option>
                ))}
              </select>
            )}
          </div>


          <div>
            <label htmlFor="shift-capacity" className="block text-sm font-semibold">
              募集人数（{minimumCapacity}〜100人）
            </label>
            <input
              id="shift-capacity"
              type="number"
              min={minimumCapacity}
              max="100"
              value={form.capacity}
              onChange={(event) => onFormChange({ ...form, capacity: event.target.value })}
              className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none focus:border-[#030213]"
            />
            {editingApprovedCount > 0 && (
              <p className="mt-2 text-sm text-[#717182]">
                承認済みが{editingApprovedCount}人いるため、募集人数は
                {editingApprovedCount}人未満にできません。
              </p>
            )}
            {form.capacity && capacityValue < minimumCapacity && (
              <p className="mt-2 rounded-md bg-[#fff1f1] px-3 py-2 text-sm text-[#b00020]">
                承認済み人数（{minimumCapacity}人）未満には変更できません。
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSave || isSaving}
            className={[
              "h-10 w-full rounded-md text-sm font-semibold text-white transition",
              canSave && !isSaving
                ? "bg-[#030213] hover:bg-[#171624]"
                : "cursor-not-allowed bg-[#8e8d95]",
            ].join(" ")}
          >
            {isSaving ? "保存中..." : editingId ? "更新" : isMonthlyPattern ? `一括作成（${monthlyPatternCount}件）` : "追加"}
          </button>
        </div>
      </form>
    </div>
  );
}
