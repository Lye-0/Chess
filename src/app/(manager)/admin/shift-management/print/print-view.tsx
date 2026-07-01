"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildDailyShiftExportData,
  buildMonthlyShiftExportData,
  type DailyShiftExportData,
  type MonthlyShiftExportData,
  type MonthlyShiftExportRow,
  type ShiftExportScope,
} from "@/lib/shiftExports";
import { defaultPayrollSettings, subscribePayrollSettings } from "@/lib/payroll";
import { subscribeEmployees, type EmployeeProfile } from "@/lib/people";
import { type ShiftRequest, subscribeShiftRequestsByMonth } from "@/lib/shiftRequests";
import { subscribeShiftSlotsByMonth, type ShiftSlot } from "@/lib/shiftSlots";
import { useManagerOrganizationAccess } from "@/lib/useManagerOrganizationAccess";

type ShiftPrintViewProps = {
  scope: ShiftExportScope;
  targetDate: string;
  targetMonth: string;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year}年${Number(monthNumber)}月`;
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日（${weekdays[parsedDate.getDay()]}）`;
}

function getMonthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const parsedDate = new Date(`${date}T00:00:00`);

    return {
      date,
      day,
      weekday: weekdays[parsedDate.getDay()],
      isWeekend: parsedDate.getDay() === 0 || parsedDate.getDay() === 6,
    };
  });
}

function getEmployeeDisplayName(row: MonthlyShiftExportRow) {
  return row.employee?.name || row.request.employeeName || row.request.employeeId || "未登録";
}

function getPositionLabel(request: ShiftRequest) {
  return request.positionName.trim() || "ポジション未設定";
}

function applySlotPositionNames(requests: ShiftRequest[], slots: ShiftSlot[]) {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  return requests.map((request) => {
    const currentPositionName = request.positionName.trim();
    if (currentPositionName && currentPositionName !== "ポジション未設定") return request;

    const slot = slotsById.get(request.slotId);
    const slotPositionName = slot?.positionName.trim() ?? "";
    if (!slotPositionName) return request;

    return {
      ...request,
      positionId: request.positionId || slot?.positionId || "",
      positionName: slotPositionName,
    };
  });
}

function groupRowsByDate(rows: MonthlyShiftExportRow[]) {
  return rows.reduce<Record<string, MonthlyShiftExportRow[]>>((groups, row) => {
    groups[row.request.date] = [...(groups[row.request.date] ?? []), row];
    return groups;
  }, {});
}

function sortRows(rows: MonthlyShiftExportRow[]) {
  return rows.slice().sort((a, b) => {
    if (a.request.startTime !== b.request.startTime) {
      return a.request.startTime.localeCompare(b.request.startTime);
    }

    return getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b), "ja");
  });
}

function PrintToolbar({
  isLoading,
  hasRows,
}: {
  isLoading: boolean;
  hasRows: boolean;
}) {
  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">
        {isLoading ? "印刷用シフト表を読み込んでいます" : "印刷用シフト表"}
      </p>
      <button
        type="button"
        disabled={isLoading || !hasRows}
        onClick={() => window.print()}
        className="rounded-md bg-[#030213] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        印刷
      </button>
    </div>
  );
}

function DocumentHeader({
  title,
  organizationName,
  department,
}: {
  title: string;
  organizationName: string;
  department: string;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-6 border-b-2 border-slate-900 pb-3">
      <div>
        <p className="text-sm font-semibold text-slate-500">{organizationName}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
      </div>
      {department && <p className="text-sm font-semibold text-slate-600">{department}</p>}
    </header>
  );
}

function DailyPrintSection({
  data,
  forcePageBreak = false,
}: {
  data: DailyShiftExportData;
  forcePageBreak?: boolean;
}) {
  const rows = sortRows(data.rows);

  return (
    <section className={forcePageBreak ? "print-page" : undefined}>
      <DocumentHeader
        title={`${formatDateLabel(data.date)} シフト表`}
        organizationName={data.organizationName}
        department={data.department}
      />
      {rows.length === 0 ? (
        <p className="rounded-md border border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          この日の承認済みシフトはありません。
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-28 border border-slate-400 bg-slate-100 px-3 py-2 text-left">時間</th>
              <th className="w-40 border border-slate-400 bg-slate-100 px-3 py-2 text-left">氏名</th>
              <th className="w-36 border border-slate-400 bg-slate-100 px-3 py-2 text-left">ポジション</th>
              <th className="border border-slate-400 bg-slate-100 px-3 py-2 text-left">備考</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.request.id}>
                <td className="border border-slate-300 px-3 py-2 font-semibold">
                  {row.request.startTime}-{row.request.endTime}
                </td>
                <td className="border border-slate-300 px-3 py-2">{getEmployeeDisplayName(row)}</td>
                <td className="border border-slate-300 px-3 py-2">{getPositionLabel(row.request)}</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-500">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MonthlyPrintSection({ data }: { data: MonthlyShiftExportData }) {
  const days = getMonthDays(data.month);
  const rowsByEmployee = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>((groups, row) => {
    const key = row.employee?.employeeId || row.request.employeeId || row.request.employeeName;
    groups[key] = [...(groups[key] ?? []), row];
    return groups;
  }, {});
  const employeeRows = Object.values(rowsByEmployee)
    .map((rows) => sortRows(rows))
    .sort((a, b) => getEmployeeDisplayName(a[0]).localeCompare(getEmployeeDisplayName(b[0]), "ja"));

  return (
    <section>
      <DocumentHeader
        title={`${formatMonthLabel(data.month)} シフト一覧`}
        organizationName={data.organizationName}
        department={data.department}
      />
      {employeeRows.length === 0 ? (
        <p className="rounded-md border border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          この月の承認済みシフトはありません。
        </p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="w-28 border border-slate-400 bg-slate-100 px-2 py-2 text-left">氏名</th>
              {days.map((day) => (
                <th
                  key={day.date}
                  className={`border border-slate-400 px-1 py-2 text-center ${day.isWeekend ? "bg-slate-200" : "bg-slate-100"}`}
                >
                  <span className="block font-bold">{day.day}</span>
                  <span className="block text-[10px]">{day.weekday}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employeeRows.map((rows) => {
              const rowsByDate = groupRowsByDate(rows);

              return (
                <tr key={rows[0].request.employeeId || rows[0].request.employeeName}>
                  <th className="border border-slate-400 bg-slate-50 px-2 py-2 text-left align-top">
                    {getEmployeeDisplayName(rows[0])}
                  </th>
                  {days.map((day) => (
                    <td key={day.date} className="border border-slate-300 px-1 py-1 align-top">
                      {(rowsByDate[day.date] ?? []).map((row) => (
                        <div key={row.request.id} className="leading-tight">
                          <strong>{row.request.startTime}-{row.request.endTime}</strong>
                          <br />
                          {getPositionLabel(row.request)}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function ShiftPrintView({
  scope,
  targetDate,
  targetMonth,
}: ShiftPrintViewProps) {
  const {
    organizationId,
    organization,
    isCheckingOrganization,
  } = useManagerOrganizationAccess();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [payrollSettings, setPayrollSettings] = useState(defaultPayrollSettings);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const month = scope === "day" ? targetDate.slice(0, 7) : targetMonth;
  const loadKey = `${organizationId}:${month}`;

  useEffect(() => {
    if (!organizationId) return;

    const currentLoadKey = `${organizationId}:${month}`;
    let pendingSources = 4;
    const finishSource = () => {
      pendingSources -= 1;
      if (pendingSources <= 0) setLoadedKey(currentLoadKey);
    };
    const handleError = (error: unknown) => {
      console.error(error);
      setLoadError({
        key: currentLoadKey,
        message: "印刷用シフト表の読み込みに失敗しました。",
      });
    };
    const unsubscribeRequests = subscribeShiftRequestsByMonth(
      month,
      (nextRequests) => {
        setRequests(nextRequests);
        finishSource();
      },
      handleError,
      organizationId,
    );
    const unsubscribeSlots = subscribeShiftSlotsByMonth(
      month,
      (nextSlots) => {
        setSlots(nextSlots);
        finishSource();
      },
      handleError,
      organizationId,
    );
    const unsubscribeEmployees = subscribeEmployees(
      (nextEmployees) => {
        setEmployees(nextEmployees);
        finishSource();
      },
      handleError,
      organizationId,
    );
    const unsubscribePayroll = subscribePayrollSettings(
      (nextSettings) => {
        setPayrollSettings(nextSettings);
        finishSource();
      },
      handleError,
      organizationId,
    );

    return () => {
      unsubscribeRequests();
      unsubscribeSlots();
      unsubscribeEmployees();
      unsubscribePayroll();
    };
  }, [month, organizationId]);

  const exportRequests = useMemo(
    () => applySlotPositionNames(requests, slots),
    [requests, slots],
  );
  const monthlyData = useMemo(
    () =>
      buildMonthlyShiftExportData({
        organizationName: organization?.name ?? "",
        department: organization?.department ?? "",
        month,
        employees,
        requests: exportRequests,
        payrollSettings,
      }),
    [employees, exportRequests, month, organization, payrollSettings],
  );
  const dailyData = useMemo(
    () =>
      buildDailyShiftExportData({
        organizationName: organization?.name ?? "",
        department: organization?.department ?? "",
        date: targetDate,
        employees,
        requests: exportRequests,
        payrollSettings,
      }),
    [employees, exportRequests, organization, payrollSettings, targetDate],
  );
  const dailyPages = useMemo(() => {
    const rowsByDate = groupRowsByDate(monthlyData.rows);

    return getMonthDays(month)
      .filter((day) => rowsByDate[day.date]?.length)
      .map((day) => ({
        ...dailyData,
        date: day.date,
        rows: rowsByDate[day.date] ?? [],
      }));
  }, [dailyData, month, monthlyData.rows]);
  const errorMessage = loadError?.key === loadKey ? loadError.message : "";
  const isLoading = isCheckingOrganization || (!errorMessage && loadedKey !== loadKey);
  const hasRows = scope === "day" ? dailyData.rows.length > 0 : monthlyData.rows.length > 0;

  useEffect(() => {
    if (isLoading || !hasRows || errorMessage) return;

    const timerId = window.setTimeout(() => {
      window.print();
    }, 350);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [errorMessage, hasRows, isLoading]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 print:bg-white">
      <PrintToolbar isLoading={isLoading} hasRows={hasRows} />
      <div className="mx-auto max-w-[1180px] px-4 py-6 print:max-w-none print:p-0">
        <style jsx global>{`
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          @media print {
            html,
            body {
              background: white !important;
            }

            .print-page {
              break-after: page;
              page-break-after: always;
            }

            .print-page:last-child {
              break-after: auto;
              page-break-after: auto;
            }

            table {
              break-inside: auto;
            }

            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}</style>

        {errorMessage ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:border-slate-400 print:bg-white print:text-slate-900">
            {errorMessage}
          </p>
        ) : isLoading ? (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            印刷用シフト表を読み込んでいます。
          </p>
        ) : scope === "day" ? (
          <DailyPrintSection data={dailyData} />
        ) : scope === "monthDaily" ? (
          dailyPages.length > 0 ? (
            dailyPages.map((page) => (
              <DailyPrintSection key={page.date} data={page} forcePageBreak />
            ))
          ) : (
            <DailyPrintSection
              data={{
                ...dailyData,
                date: `${month}-01`,
                rows: [],
              }}
            />
          )
        ) : (
          <MonthlyPrintSection data={monthlyData} />
        )}
      </div>
    </main>
  );
}