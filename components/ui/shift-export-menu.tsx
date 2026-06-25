"use client";

import { useState } from "react";
import { ChevronDownIcon, DownloadIcon } from "@/components/icons";
import type { ShiftExportFormat, ShiftExportScope } from "@/lib/shiftExports";

type ExportOption = {
  format: ShiftExportFormat;
  label: string;
};

type ScopeOption = {
  scope: ShiftExportScope;
  label: string;
};

type ShiftExportMenuProps = {
  label?: string;
  formats: ExportOption[];
  months: string[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onExport: (format: ShiftExportFormat) => void;
  disabled?: boolean;
  hasData: boolean;
  scopeOptions?: ScopeOption[];
  selectedScope?: ShiftExportScope;
  onScopeChange?: (scope: ShiftExportScope) => void;
  dates?: string[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
};

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year}年${Number(monthNumber)}月`;
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日（${weekdays[parsedDate.getDay()]}）`;
}

export function ShiftExportMenu({
  label = "エクスポート",
  formats,
  months,
  selectedMonth,
  onMonthChange,
  onExport,
  disabled = false,
  hasData,
  scopeOptions,
  selectedScope = "month",
  onScopeChange,
  dates = [],
  selectedDate = "",
  onDateChange,
}: ShiftExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const usesDate = selectedScope === "day";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-[#030213] shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:bg-[#e9ebef] disabled:text-[#717182]"
      >
        <DownloadIcon />
        {label}
        <ChevronDownIcon />
      </button>

      {isOpen && !disabled && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-black/10 bg-white p-3 text-[#030213] shadow-xl">
          {scopeOptions && onScopeChange && (
            <>
              <label className="block text-xs font-semibold text-[#717182]" htmlFor="shift-export-scope">
                出力単位
              </label>
              <select
                id="shift-export-scope"
                value={selectedScope}
                onChange={(event) => onScopeChange(event.target.value as ShiftExportScope)}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none"
              >
                {scopeOptions.map((option) => (
                  <option key={option.scope} value={option.scope}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {usesDate ? (
            <>
              <label className="mt-3 block text-xs font-semibold text-[#717182]" htmlFor="shift-export-date">
                対象日
              </label>
              <select
                id="shift-export-date"
                value={selectedDate}
                onChange={(event) => onDateChange?.(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none"
              >
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="mt-3 block text-xs font-semibold text-[#717182]" htmlFor="shift-export-month">
                対象月
              </label>
              <select
                id="shift-export-month"
                value={selectedMonth}
                onChange={(event) => onMonthChange(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none"
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </>
          )}

          {!hasData && (
            <p className="mt-3 rounded-md bg-[#f7f8fb] px-3 py-2 text-sm text-[#717182]">
              この条件の承認済みシフトはありません
            </p>
          )}

          <div className="mt-3 grid gap-2">
            {formats.map((option) => (
              <button
                key={option.format}
                type="button"
                disabled={!hasData}
                onClick={() => {
                  onExport(option.format);
                  setIsOpen(false);
                }}
                className="h-10 rounded-md bg-[#030213] px-3 text-left text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#cbd5e1]"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
