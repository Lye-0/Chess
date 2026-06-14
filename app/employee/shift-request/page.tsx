"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const organization = {
  companyName: "名古屋エンジニアリング",
  department: "開発部",
};

const availableDays = new Set([15, 16, 18]);
const days = [
  { value: 31, outside: true },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
  { value: 7 },
  { value: 8 },
  { value: 9 },
  { value: 10 },
  { value: 11 },
  { value: 12 },
  { value: 13 },
  { value: 14 },
  { value: 15 },
  { value: 16 },
  { value: 17 },
  { value: 18 },
  { value: 19 },
  { value: 20 },
  { value: 21 },
  { value: 22 },
  { value: 23 },
  { value: 24 },
  { value: 25 },
  { value: 26 },
  { value: 27 },
  { value: 28 },
  { value: 29 },
  { value: 30 },
  { value: 1, outside: true },
  { value: 2, outside: true },
  { value: 3, outside: true },
  { value: 4, outside: true },
];

const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

function formatSelectedDay(day: number) {
  const dayOfWeek = day === 15 ? "月" : day === 16 ? "火" : "木";
  return `2026年6月${day}日 (${dayOfWeek})`;
}

export default function EmployeeShiftRequestPage() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const slotLabel = useMemo(() => {
    if (!selectedDay) return "";
    return `${formatSelectedDay(selectedDay)} のシフト枠`;
  }, [selectedDay]);

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
            {organization.companyName} - {organization.department}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-[992px] px-4 py-8 sm:px-0">
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <header>
            <h1 className="text-xl font-semibold">希望シフト入力</h1>
            <p className="mt-1 text-sm text-[#717182]">
              {organization.companyName} {organization.department}の募集シフト枠から希望を選択してください
            </p>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="font-semibold">日付を選択</h2>
              <p className="mt-1 text-sm text-[#717182]">※ グレーアウトの日はシフト枠がありません</p>

              <div className="mt-3 rounded-md border border-black/10 p-4">
                <div className="relative flex max-w-56 items-center justify-center">
                  <button
                    type="button"
                    aria-label="Go to previous month"
                    className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-[#717182] shadow-sm"
                  >
                    <ChevronIcon direction="left" />
                  </button>
                  <h3 className="text-sm font-semibold">June 2026</h3>
                  <button
                    type="button"
                    aria-label="Go to next month"
                    className="absolute right-0 flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-[#717182] shadow-sm"
                  >
                    <ChevronIcon direction="right" />
                  </button>
                </div>

                <div className="mt-5 grid max-w-56 grid-cols-7 gap-y-2 text-center text-sm text-[#717182]">
                  {dayNames.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                  {days.map((day, index) => {
                    const enabled = !day.outside && availableDays.has(day.value);
                    const selected = selectedDay === day.value && enabled;
                    return (
                      <button
                        key={`${day.value}-${index}`}
                        type="button"
                        disabled={!enabled}
                        onClick={() => setSelectedDay(day.value)}
                        className={[
                          "flex h-8 w-8 items-center justify-center rounded-md text-sm transition",
                          selected
                            ? "bg-[#030213] text-white"
                            : enabled
                              ? "text-[#030213] hover:bg-[#e9ebef]"
                              : "cursor-not-allowed text-[#b4b7c0]",
                          day.value === 14 && !selected ? "bg-[#ececf0]" : "",
                        ].join(" ")}
                      >
                        {day.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDay && (
                <div className="mt-5">
                  <label htmlFor="shift-slot" className="block font-semibold">
                    {slotLabel}
                  </label>
                  <select
                    id="shift-slot"
                    className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      シフト枠を選択
                    </option>
                    <option value="13-22">13:00 - 22:00（募集 2人）</option>
                  </select>
                  <button
                    type="button"
                    className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#8e8d95] px-4 text-sm font-semibold text-white"
                  >
                    <SendIcon />
                    希望を追加
                  </button>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-semibold">追加したシフト希望</h2>
              <div className="flex min-h-72 flex-col items-center justify-center text-center text-[#717182]">
                <p>まだシフト希望がありません</p>
                <p className="mt-1 text-sm">左側から日付とシフト枠を選択してください</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
