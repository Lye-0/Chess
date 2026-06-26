"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getEmployeeSessionServerSnapshot,
  getEmployeeSessionSnapshot,
  loadEmployeeSession,
  parseEmployeeSessionSnapshot,
  subscribeEmployeeSession,
} from "@/lib/people";
import {
  formatShiftTimeRange,
  subscribeShiftSlots,
  type ShiftSlot,
} from "@/lib/shiftSlots";
import {
  createShiftRequests,
  isShiftStartInFuture,
  subscribeEmployeeShiftRequests,
  type ShiftRequest,
} from "@/lib/shiftRequests";

const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {direction === "left" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
      )}
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="#ff650b"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.7 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${year}年${month}月${day}日（${weekday}）`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function getMonthCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = firstDay + daysInMonth > 35 ? 42 : 35;
  const firstCalendarDate = new Date(year, month, 1 - firstDay);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);

    return {
      value: date.getDate(),
      date: toDateString(date),
      outside: date.getMonth() !== month,
    };
  });
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sortSlots(slots: ShiftSlot[]) {
  return [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

function getSlotPositionLabel(slot: Pick<ShiftSlot, "positionName">) {
  return slot.positionName || "ポジション未設定";
}

function EmployeeShiftRequestContent() {
  const router = useRouter();
  const sessionSnapshot = useSyncExternalStore(
    subscribeEmployeeSession,
    getEmployeeSessionSnapshot,
    getEmployeeSessionServerSnapshot,
  );
  const sessionEmployee = useMemo(
    () => parseEmployeeSessionSnapshot(sessionSnapshot),
    [sessionSnapshot],
  );
  const employee = sessionEmployee;
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [displayMonth, setDisplayMonth] = useState(() => getMonthStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [draftSlots, setDraftSlots] = useState<ShiftSlot[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlotsLoading, setIsSlotsLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = isSlotsLoading || isRequestsLoading;


  useEffect(() => {
    if (!sessionEmployee && !loadEmployeeSession()) {
      router.replace("/login");
    }
  }, [router, sessionEmployee]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!employee) return;

    const unsubscribeSlots = subscribeShiftSlots(
      (nextSlots) => {
        setSlots(nextSlots);
        setIsSlotsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsSlotsLoading(false);
        setErrorMessage("シフト枠の読み込みに失敗しました。");
      },
      employee.organizationId,
    );
    const unsubscribeRequests = subscribeEmployeeShiftRequests(
      employee.employeeId,
      (nextRequests) => {
        setRequests(nextRequests);
        setIsRequestsLoading(false);
        setErrorMessage(null);
      },
      (error) => {
        console.error(error);
        setIsRequestsLoading(false);
        setErrorMessage("希望シフトの読み込みに失敗しました。");
      },
      employee.organizationId,
    );

    return () => {
      unsubscribeSlots();
      unsubscribeRequests();
    };
  }, [employee]);

  const requestedSlotIds = useMemo(
    () => new Set(requests.map((request) => request.slotId)),
    [requests],
  );
  const draftSlotIds = useMemo(
    () => new Set(draftSlots.map((slot) => slot.id)),
    [draftSlots],
  );
  const requestableSlots = useMemo(() => {
    return slots.filter(
      (slot) => isShiftStartInFuture(slot, now),
    );
  }, [now, slots]);
  const slotsByDate = useMemo(() => {
    return requestableSlots.reduce<Record<string, ShiftSlot[]>>((groups, slot) => {
      groups[slot.date] = [...(groups[slot.date] ?? []), slot];
      return groups;
    }, {});
  }, [requestableSlots]);
  const selectableDates = useMemo(() => {
    return new Set(
      requestableSlots
        .filter((slot) => !requestedSlotIds.has(slot.id) && !draftSlotIds.has(slot.id))
        .map((slot) => slot.date),
    );
  }, [draftSlotIds, requestableSlots, requestedSlotIds]);
  const availableSlotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];

    return sortSlots(slotsByDate[selectedDate] ?? []).filter(
      (slot) => !requestedSlotIds.has(slot.id) && !draftSlotIds.has(slot.id),
    );
  }, [draftSlotIds, requestedSlotIds, selectedDate, slotsByDate]);
  const selectedSlot = useMemo(
    () => availableSlotsForSelectedDate.find((slot) => slot.id === selectedSlotId),
    [availableSlotsForSelectedDate, selectedSlotId],
  );
  const calendarDays = useMemo(
    () => getMonthCalendarDays(displayMonth),
    [displayMonth],
  );
  const monthLabel = useMemo(
    () => monthFormatter.format(displayMonth),
    [displayMonth],
  );
  const todayDate = useMemo(() => toDateString(new Date()), []);

  function changeDisplayMonth(offset: number) {
    setDisplayMonth((currentMonth) => {
      return new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1,
      );
    });
    setSelectedDate(null);
    setSelectedSlotId("");
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setSelectedSlotId("");
  }

  function addDraftSlot() {
    if (!selectedSlot) return;
    if (!isShiftStartInFuture(selectedSlot)) {
      setSelectedSlotId("");
      setErrorMessage("過去または開始済みのシフトには希望を提出できません。");
      return;
    }

    setDraftSlots((current) => sortSlots([...current, selectedSlot]));
    setSelectedSlotId("");
  }

  function removeDraftSlot(slotId: string) {
    setDraftSlots((current) => current.filter((slot) => slot.id !== slotId));
  }

  async function submitRequests() {
    if (!employee || draftSlots.length === 0) return;

    const requestableDraftSlots = draftSlots.filter((slot) =>
      isShiftStartInFuture(slot),
    );

    if (requestableDraftSlots.length !== draftSlots.length) {
      setDraftSlots(requestableDraftSlots);
      setIsConfirmOpen(false);
      setErrorMessage("過去または開始済みのシフトには希望を提出できません。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await createShiftRequests(
        requestableDraftSlots.map((slot) => ({
          employeeId: employee.employeeId,
          employeeName: employee.name,
          employeeEmail: employee.email,
          employmentType: employee.employmentType,
          slotId: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          positionId: slot.positionId,
          positionName: slot.positionName,
        })),
        employee.organizationId,
      );
      setDraftSlots([]);
      setIsConfirmOpen(false);
    } catch (error) {
      console.error(error);
      setErrorMessage("希望シフトの送信に失敗しました。Firestore Rulesを確認してください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!employee) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fa] text-[#717182]">
        <p>ログイン情報を確認しています</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#030213]">
      <header className="border-b border-black/10 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1248px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <Link
            href="/employee"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
          >
            <BackIcon />
            戻る
          </Link>
          <p className="text-sm text-[#717182]">
            {employee.organization} - {employee.department}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[992px] px-4 py-8 sm:px-0">
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <header>
            <h1 className="text-xl font-semibold">希望シフト入力</h1>
            <p className="mt-1 text-sm text-[#717182]">
              {employee.organization} {employee.department}の募集シフト枠から希望を選択してください
            </p>
          </header>

          {errorMessage && (
            <div className="mt-5 rounded-md border border-[#ffb3b3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b00020]">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="font-semibold">日付を選択</h2>
              <p className="mt-1 text-sm text-[#717182]">
                ※ グレーアウトの日はシフト枠がありません
              </p>

              <div className="mt-3 rounded-md border border-black/10 p-4">
                <div className="relative flex max-w-56 items-center justify-center">
                  <button
                    type="button"
                    aria-label="前の月へ"
                    onClick={() => changeDisplayMonth(-1)}
                    className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-[#717182] shadow-sm"
                  >
                    <ChevronIcon direction="left" />
                  </button>
                  <h3 className="text-sm font-semibold">{monthLabel}</h3>
                  <button
                    type="button"
                    aria-label="次の月へ"
                    onClick={() => changeDisplayMonth(1)}
                    className="absolute right-0 flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-[#717182] shadow-sm"
                  >
                    <ChevronIcon direction="right" />
                  </button>
                </div>

                <div className="mt-5 grid max-w-56 grid-cols-7 gap-y-2 text-center text-sm text-[#717182]">
                  {dayNames.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                  {calendarDays.map((day, index) => {
                    const enabled = !day.outside && selectableDates.has(day.date);
                    const selected = selectedDate === day.date;

                    return (
                      <button
                        key={`${day.date}-${index}`}
                        type="button"
                        disabled={!enabled}
                        onClick={() => selectDate(day.date)}
                        className={[
                          "flex h-8 w-8 items-center justify-center rounded-md text-sm transition",
                          selected
                            ? "bg-[#030213] text-white"
                            : enabled
                              ? "text-[#030213] hover:bg-[#e9ebef]"
                              : "cursor-not-allowed text-[#b4b7c0]",
                          day.date === todayDate && !selected ? "bg-[#ececf0]" : "",
                        ].join(" ")}
                      >
                        {day.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isLoading && (
                <p className="mt-5 text-sm text-[#717182]">
                  募集シフト枠を読み込んでいます
                </p>
              )}

              {selectedDate && (
                <div className="mt-5">
                  <label htmlFor="shift-slot" className="block font-semibold">
                    {formatDateLabel(selectedDate)} のシフト枠
                  </label>
                  {availableSlotsForSelectedDate.length > 0 ? (
                    <>
                      <select
                        id="shift-slot"
                        value={selectedSlotId}
                        onChange={(event) => setSelectedSlotId(event.target.value)}
                        className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm"
                      >
                        <option value="" disabled>
                          シフト枠を選択
                        </option>
                        {availableSlotsForSelectedDate.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {getSlotPositionLabel(slot)} / {formatShiftTimeRange(slot.startTime, slot.endTime)}（募集 {slot.capacity}人 / 希望{" "}
                            {slot.requestCount}人）
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedSlot}
                        onClick={addDraftSlot}
                        className={[
                          "mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white",
                          selectedSlot
                            ? "bg-[#030213] hover:bg-[#171624]"
                            : "cursor-not-allowed bg-[#b8b7bf]",
                        ].join(" ")}
                      >
                        <SendIcon />
                        希望を追加
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[#717182]">
                      この日の選択可能なシフト枠はありません（既に希望済み・枠なし）
                    </p>
                  )}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-semibold">追加したシフト希望</h2>
              {draftSlots.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center text-[#717182]">
                  <p>まだシフト希望がありません</p>
                  <p className="mt-1 text-sm">
                    左側から日付とシフト枠を選択してください
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="space-y-3">
                    {draftSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-4"
                      >
                        <div>
                          <p className="font-semibold">{formatDateLabel(slot.date)}</p>
                          <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">
                            {getSlotPositionLabel(slot)}
                          </p>
                          <p className="mt-1 text-sm text-[#717182]">
                            {formatShiftTimeRange(slot.startTime, slot.endTime)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDraftSlot(slot.id)}
                          className="rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="mt-6 text-sm text-[#717182]">
                    ※ 送信後は変更できません。管理者が応募者の中から承認します。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(true)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#030213] px-4 text-sm font-semibold text-white"
                  >
                    <SendIcon />
                    シフト希望を送信（{draftSlots.length}件）
                  </button>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>

      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8">
          <section className="w-full max-w-[512px] rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <WarningIcon />
                <h2 className="text-xl font-semibold">送信の確認</h2>
              </div>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-md p-1 text-[#596074] transition hover:bg-[#f0f1f4] hover:text-[#030213]"
              >
                <XIcon />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#717182]">
              以下のシフト希望を送信します。送信後は変更できません。
            </p>

            <div className="mt-6 space-y-3">
              {draftSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between rounded-lg bg-[#f7f8fb] px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">{formatDateLabel(slot.date)}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">
                      {getSlotPositionLabel(slot)}
                    </p>
                  </div>
                  <p className="text-sm text-[#475569]">
                    {formatShiftTimeRange(slot.startTime, slot.endTime)}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-[#717182]">
              ※ 管理者が承認後、シフトが確定します。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="h-10 rounded-md border border-black/10 bg-white text-sm font-semibold shadow-sm transition hover:bg-[#f7f8fb]"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={submitRequests}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#030213] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#8e8d95]"
              >
                <SendIcon />
                {isSubmitting ? "送信中..." : "送信する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export default function EmployeeShiftRequestPage() {
  return (
    <Suspense>
      <EmployeeShiftRequestContent />
    </Suspense>
  );
}
