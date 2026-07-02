"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, DownloadIcon } from "@/components/icons";
import type { ShiftExportFormat, ShiftExportScope } from "@/lib/shiftExports";

type ExportOption = {
  format: ShiftExportFormat;
  label: string;
  actionLabel?: string;
  disabled?: boolean;
  requiresData?: boolean;
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
  onExport: (format: ShiftExportFormat) => void | Promise<void>;
  selectedFormat?: ShiftExportFormat;
  onFormatChange?: (format: ShiftExportFormat) => void;
  disabled?: boolean;
  hasData: boolean;
  scopeOptions?: ScopeOption[];
  selectedScope?: ShiftExportScope;
  onScopeChange?: (scope: ShiftExportScope) => void;
  dates?: string[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showMobileLabel?: boolean;
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

function getDefaultActionLabel(format: ShiftExportFormat) {
  if (format === "print") return "印刷ページを開く";
  return format === "calendarSubscription" ? "準備中" : "ダウンロード";
}

export function ShiftExportMenu({
  label = "エクスポート",
  formats,
  months,
  selectedMonth,
  onMonthChange,
  onExport,
  selectedFormat: controlledSelectedFormat,
  onFormatChange,
  disabled = false,
  hasData,
  scopeOptions,
  selectedScope = "month",
  onScopeChange,
  dates = [],
  selectedDate = "",
  onDateChange,
  showMobileLabel = false,
}: ShiftExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [internalSelectedFormat, setInternalSelectedFormat] = useState<ShiftExportFormat>(
    formats[0]?.format ?? "png",
  );
  const selectedFormat = controlledSelectedFormat ?? internalSelectedFormat;
  const showsTargetDate = selectedFormat !== "calendarSubscription";
  const selectedOption =
    formats.find((option) => option.format === selectedFormat) ?? formats[0];
  const availableScopeOptions = selectedFormat === "excel"
    ? scopeOptions?.filter((option) => option.scope === "day")
    : selectedFormat === "csv"
      ? scopeOptions?.filter((option) => option.scope !== "monthDaily")
      : scopeOptions;
  const selectedScopeValue = availableScopeOptions?.some(
    (option) => option.scope === selectedScope,
  )
    ? selectedScope
    : availableScopeOptions?.[0]?.scope ?? selectedScope;
  const usesDate = selectedScopeValue === "day";
  const requiresData = selectedOption?.requiresData ?? true;
  const canExport =
    !isExporting &&
    Boolean(selectedOption) &&
    !selectedOption.disabled &&
    (!requiresData || hasData);

  useEffect(() => {
    if (!availableScopeOptions || !onScopeChange || selectedScopeValue === selectedScope) return;

    onScopeChange(selectedScopeValue);
  }, [availableScopeOptions, onScopeChange, selectedScope, selectedScopeValue]);
  useEffect(() => {
    if (!isOpen) return;

    function closeOnScroll() {
      setIsOpen(false);
    }

    window.addEventListener("scroll", closeOnScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", closeOnScroll);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className={showMobileLabel ? "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-[#030213] shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:bg-[#e9ebef] disabled:text-[#717182] sm:px-4" : "inline-flex h-10 w-10 items-center justify-center gap-1 rounded-md border border-black/10 bg-white text-sm font-semibold text-[#030213] shadow-sm transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:bg-[#e9ebef] disabled:text-[#717182] sm:w-auto sm:gap-2 sm:px-4"}
      >
        <DownloadIcon />
        <span className={showMobileLabel ? "inline" : "hidden sm:inline"}>{label}</span>
        <ChevronDownIcon />
      </button>

      {isOpen && !disabled && (
        <div className="fixed left-4 right-4 top-20 z-40 rounded-lg border border-black/10 bg-white p-3 text-[#030213] shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-72">
          <label className="block text-xs font-semibold text-[#717182]" htmlFor="shift-export-format">
            形式
          </label>
          <select
            id="shift-export-format"
            value={selectedOption?.format ?? ""}
            onChange={(event) => {
              const nextFormat = event.target.value as ShiftExportFormat;
              setInternalSelectedFormat(nextFormat);
              onFormatChange?.(nextFormat);
            }}
            className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none"
          >
            {formats.map((option) => (
              <option key={option.format} value={option.format}>
                {option.label}
              </option>
            ))}
          </select>

          {availableScopeOptions && onScopeChange && (
            <>
              <label className="mt-3 block text-xs font-semibold text-[#717182]" htmlFor="shift-export-scope">
                出力単位
              </label>
              <select
                id="shift-export-scope"
                value={selectedScopeValue}
                onChange={(event) => onScopeChange(event.target.value as ShiftExportScope)}
                className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none"
              >
                {availableScopeOptions.map((option) => (
                  <option key={option.scope} value={option.scope}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {showsTargetDate && (usesDate ? (
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
          ))}

          {!hasData && requiresData && (
            <p className="mt-3 rounded-md bg-[#f7f8fb] px-3 py-2 text-sm text-[#717182]">
              この条件の承認済みシフトはありません
            </p>
          )}

          {selectedOption?.disabled && (
            <p className="mt-3 rounded-md bg-[#fef3c7] px-3 py-2 text-sm text-[#92400e]">
              この形式は次のステップで利用できるようにします
            </p>
          )}

          <button
            type="button"
            disabled={!canExport}
            onClick={async () => {
              if (!selectedOption) return;
              setIsExporting(true);
              try {
                await onExport(selectedOption.format);
                setIsOpen(false);
              } finally {
                setIsExporting(false);
              }
            }}
            className="mt-3 h-10 w-full rounded-md bg-[#030213] px-3 text-center text-sm font-semibold text-white transition hover:bg-[#171624] disabled:cursor-not-allowed disabled:bg-[#cbd5e1]"
          >
            {isExporting
              ? "処理中"
              : selectedOption?.actionLabel ??
                getDefaultActionLabel(selectedOption?.format ?? "png")}
          </button>
        </div>
      )}
    </div>
  );
}
