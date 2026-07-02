import ShiftPrintView from "./print-view";
import type { ShiftExportScope } from "@/lib/shiftExports";

type ShiftPrintPageProps = {
  searchParams: Promise<{
    scope?: string | string[];
    month?: string | string[];
    date?: string | string[];
  }>;
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeScope(value: string | string[] | undefined): ShiftExportScope {
  const scope = getParamValue(value);

  return scope === "day" || scope === "monthDaily" ? scope : "month";
}

function getCurrentMonthValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDateValue() {
  const now = new Date();

  return `${getCurrentMonthValue()}-${String(now.getDate()).padStart(2, "0")}`;
}

export default async function AdminShiftPrintPage({
  searchParams,
}: ShiftPrintPageProps) {
  const params = await searchParams;
  const scope = normalizeScope(params.scope);
  const date = getParamValue(params.date);
  const month = getParamValue(params.month);
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
    ? date!
    : getCurrentDateValue();
  const targetMonth = /^\d{4}-\d{2}$/.test(month ?? "")
    ? month!
    : targetDate.slice(0, 7) || getCurrentMonthValue();

  return (
    <ShiftPrintView
      scope={scope}
      targetDate={targetDate}
      targetMonth={scope === "day" ? targetDate.slice(0, 7) : targetMonth}
    />
  );
}