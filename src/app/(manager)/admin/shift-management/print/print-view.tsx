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

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function getEffectiveTimeRange(request: ShiftRequest) {
  const actualStartTime = request.actualStartTime.trim();
  const actualEndTime = request.actualEndTime.trim();

  if (
    actualStartTime &&
    actualEndTime &&
    (actualStartTime !== request.startTime || actualEndTime !== request.endTime)
  ) {
    return { startTime: actualStartTime, endTime: actualEndTime };
  }

  return { startTime: request.startTime, endTime: request.endTime };
}

function getShiftStartEndMinutes(request: ShiftRequest) {
  const range = getEffectiveTimeRange(request);
  const start = parseTimeToMinutes(range.startTime);
  const end = parseTimeToMinutes(range.endTime);

  return {
    start,
    end: end > start ? end : end + 24 * 60,
  };
}

function getShiftDurationMinutes(request: ShiftRequest) {
  const range = getShiftStartEndMinutes(request);

  return Math.max(0, range.end - range.start);
}

function getWorkHoursLabel(minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;

  if (hours <= 0) return "";

  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function getDailyTimeRange(rows: MonthlyShiftExportRow[]) {
  const ranges = rows.map((row) => getShiftStartEndMinutes(row.request));
  const defaultStart = 9 * 60;
  const defaultEnd = 23 * 60 + 30;
  const minShiftStart = ranges.length > 0
    ? Math.min(defaultStart, ...ranges.map((range) => range.start))
    : defaultStart;
  const maxShiftEnd = ranges.length > 0
    ? Math.max(defaultEnd, ...ranges.map((range) => range.end))
    : defaultEnd;

  return {
    start: Math.floor(minShiftStart / 30) * 30,
    end: Math.max(defaultEnd, Math.ceil(maxShiftEnd / 30) * 30),
  };
}

type PrintTimelineRow = {
  row: MonthlyShiftExportRow;
  lane: number;
};

function assignPrintLanes(rows: MonthlyShiftExportRow[]) {
  const groups = new Map<string, MonthlyShiftExportRow[]>();

  rows
    .slice()
    .sort((a, b) => {
      const aRange = getShiftStartEndMinutes(a.request);
      const bRange = getShiftStartEndMinutes(b.request);

      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      if (aRange.end !== bRange.end) return aRange.end - bRange.end;

      return getPositionLabel(a.request).localeCompare(getPositionLabel(b.request), "ja");
    })
    .forEach((row) => {
      const positionKey = getPositionLabel(row.request);
      groups.set(positionKey, [...(groups.get(positionKey) ?? []), row]);
    });

  const placedRows: PrintTimelineRow[] = [];
  let nextBaseLane = 0;

  Array.from(groups.values()).forEach((items) => {
    const laneEndMinutes: number[] = [];

    items.forEach((row) => {
      const range = getShiftStartEndMinutes(row.request);
      const lane = laneEndMinutes.findIndex((endMinutes) => endMinutes <= range.start);
      const nextLane = lane >= 0 ? lane : laneEndMinutes.length;
      laneEndMinutes[nextLane] = range.end;
      placedRows.push({ row, lane: nextBaseLane + nextLane });
    });

    nextBaseLane += Math.max(1, laneEndMinutes.length);
  });

  return placedRows;
}

function getLaneCount(rows: PrintTimelineRow[]) {
  return rows.length > 0 ? Math.max(...rows.map((row) => row.lane)) + 1 : 1;
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

function getTimelineGridColumns(start: number, end: number) {
  const slotMinutes = 10;
  const slotCount = Math.ceil((end - start) / slotMinutes);

  return Array.from({ length: slotCount }, (_, index) => start + index * slotMinutes);
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
  const sortedRows = sortRows(data.rows);
  const { start, end } = getDailyTimeRange(sortedRows);
  const timelineSlots = getTimelineGridColumns(start, end);
  const rowsByEmployee = sortedRows.reduce<Record<string, MonthlyShiftExportRow[]>>((groups, row) => {
    groups[row.request.employeeId] = [...(groups[row.request.employeeId] ?? []), row];
    return groups;
  }, {});
  const displayEmployees = data.employees.length > 0
    ? data.employees
    : Array.from(
        new Map(sortedRows.map((row) => [
          row.request.employeeId,
          row.employee ?? {
            employeeId: row.request.employeeId,
            name: row.request.employeeName,
            email: row.request.employeeEmail,
            employmentType: row.request.employmentType,
            department: data.department,
            workScore: 0,
          },
        ])).values(),
      );

  const rowBaseHeight = 23;
  const laneHeight = 21;
  const slotWidth = 6;
  const timelineWidth = timelineSlots.length * slotWidth;

  return (
    <section className={forcePageBreak ? "print-page" : undefined}>
      <div className="print-header">
        <div className="print-title">従業員シフト表</div>
        <div className="print-date">{formatDateLabel(data.date)}</div>
        <div className="print-org">{data.organizationName}{data.department ? ` ${data.department}` : ""}</div>
      </div>

      <div className="excel-roster overflow-x-auto print:overflow-visible">
        <table className="daily-roster-table text-slate-950" style={{ "--timeline-width": `${timelineWidth}px` } as React.CSSProperties}>
          <colgroup>
            <col className="no-col" />
            <col className="name-col" />
            <col className="timeline-col" />
            <col className="work-col" />
            <col className="note-col" />
          </colgroup>
          <thead>
            <tr>
              <th className="header-cell" rowSpan={2}>No.</th>
              <th className="header-cell" rowSpan={2}>名前</th>
              <th className="header-cell timetable-title">タイムテーブル</th>
              <th className="header-cell" rowSpan={2}>勤務時間</th>
              <th className="header-cell" rowSpan={2}>備考</th>
            </tr>
            <tr>
              <th className="time-header-cell">
                <div className="timeline-grid time-grid" style={{ gridTemplateColumns: `repeat(${timelineSlots.length}, minmax(0, 1fr))` }}>
                  {timelineSlots.map((minute) => {
                    const isHalfHour = minute % 30 === 0;
                    const isHour = minute % 60 === 0;

                    return (
                      <div
                        key={minute}
                        className={`time-slot ${isHour ? "hour-line" : isHalfHour ? "half-line" : "no-line"}`}
                      />
                    );
                  })}
                  {timelineSlots
                    .filter((minute) => minute % 60 === 0)
                    .map((minute) => (
                      <span
                        key={`label-${minute}`}
                        className="time-label"
                        style={{ left: `${((minute - start) / (end - start)) * 100}%` }}
                      >
                        {Math.floor((minute % (24 * 60)) / 60)}
                      </span>
                    ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayEmployees.map((employee, index) => {
              const employeeRows = rowsByEmployee[employee.employeeId] ?? [];
              const laneRows = assignPrintLanes(employeeRows);
              const laneCount = getLaneCount(laneRows);
              const totalMinutes = employeeRows.reduce(
                (total, row) => total + getShiftDurationMinutes(row.request),
                0,
              );
              const rowHeight = Math.max(rowBaseHeight, laneCount * laneHeight);

              return (
                <tr key={employee.employeeId || `${employee.name}-${index}`} style={{ height: `${rowHeight}px` }}>
                  <td className="body-cell no-cell">{index + 1}</td>
                  <td className="body-cell name-cell">{employee.name}</td>
                  <td className="timeline-cell" style={{ height: `${rowHeight}px` }}>
                    <div
                      className="timeline-grid timeline-body-grid"
                      style={{
                        gridTemplateColumns: `repeat(${timelineSlots.length}, minmax(0, 1fr))`,
                        minHeight: `${rowHeight}px`,
                      }}
                    >
                      {timelineSlots.map((minute) => {
                        const isHalfHour = minute % 30 === 0;
                        const isHour = minute % 60 === 0;

                        return (
                          <div
                            key={minute}
                            className={`timeline-slot ${isHour ? "hour-line" : isHalfHour ? "half-line" : "no-line"}`}
                          />
                        );
                      })}
                      {laneRows.map(({ row, lane }) => {
                        const range = getShiftStartEndMinutes(row.request);
                        const blockStart = Math.max(start, range.start);
                        const blockEnd = Math.min(end, range.end);
                        if (blockEnd <= blockStart) return null;

                        const left = ((blockStart - start) / (end - start)) * 100;
                        const width = ((blockEnd - blockStart) / (end - start)) * 100;
                        const timeRange = getEffectiveTimeRange(row.request);

                        return (
                          <div
                            key={row.request.id}
                            className="shift-block"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              top: `${lane * laneHeight + 4}px`,
                            }}
                          >
                            <strong>{timeRange.startTime}-{timeRange.endTime}</strong>
                            <span>{getPositionLabel(row.request)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="body-cell work-cell">{getWorkHoursLabel(totalMinutes)}</td>
                  <td className="body-cell note-cell">&nbsp;</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
            size: A4 portrait;
            margin: 6mm;
          }

          .print-header {
            align-items: end;
            display: grid;
            grid-template-columns: 240px 1fr 240px;
            margin-bottom: 6px;
          }

          .print-title {
            font-size: 22px;
            font-weight: 800;
            line-height: 1;
          }

          .print-date {
            font-size: 14px;
            font-weight: 700;
            text-align: center;
          }

          .print-org {
            font-size: 11px;
            font-weight: 700;
            text-align: right;
          }

          .excel-roster {
            font-family: "Yu Gothic", "Meiryo", Arial, sans-serif;
          }

          .excel-roster,
          .excel-roster * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .daily-roster-table {
            background: #ffffff;
            border: 2px solid #444;
            border-collapse: collapse;
            table-layout: fixed;
            width: auto;
          }

          .daily-roster-table th,
          .daily-roster-table td {
            border: 1px solid #666;
            box-sizing: border-box;
            height: 23px;
            padding: 0 3px;
            vertical-align: middle;
          }

          .daily-roster-table thead th {
            border-bottom: 2px solid #444;
          }

          .daily-roster-table tbody tr:first-child td {
            border-top: 2px solid #444;
          }

          .no-col {
            width: 34px;
          }

          .name-col {
            width: 108px;
          }

          .timeline-col {
            width: var(--timeline-width);
          }

          .work-col {
            width: 72px;
          }

          .note-col {
            width: 84px;
          }

          .header-cell {
            background: #d9d9d9;
            font-size: 10px;
            font-weight: 800;
            line-height: 1.15;
            text-align: center;
            white-space: nowrap;
          }

          .timetable-title {
            height: 23px;
          }

          .body-cell {
            background: #ffffff;
            font-size: 10px;
          }

          .no-cell {
            text-align: center;
          }

          .name-cell {
            border-right: 2px solid #444 !important;
            background: #ddebf7;
            color: #1f4e79;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .work-cell {
            background: #ffff66;
            font-size: 12px;
            font-weight: 800;
            text-align: center;
          }

          .note-cell {
            background: #ffffff;
          }

          .time-header-cell,
          .timeline-cell {
            border-left: 2px solid #444 !important;
            border-right: 2px solid #444 !important;
            padding: 0 !important;
          }

          .time-header-cell {
            border-bottom: 2px solid #444 !important;
          }

          .timeline-grid {
            display: grid;
            position: relative;
            width: 100%;
          }

          .time-grid {
            height: 17px;
          }

          .time-slot {
            background: #ffffff;
            box-sizing: border-box;
            position: relative;
          }

          .time-label {
            display: block;
            font-size: 9px;
            font-weight: 800;
            line-height: 1;
            min-width: 14px;
            position: absolute;
            text-align: left;
            top: 2px;
            transform: translateX(2px);
            z-index: 3;
          }

          .timeline-body-grid {
            background: #ffffff;
            overflow: hidden;
          }

          .timeline-slot {
            box-sizing: border-box;
            min-height: 100%;
          }

          .hour-line {
            border-left: 1px solid #999;
          }

          .half-line {
            border-left: 1px dotted #b8b8b8;
          }

          .no-line {
            border-left: 0;
          }

          .shift-block {
            align-items: center;
            background: #f4bfd4;
            border: 1px solid #df7fa6;
            box-sizing: border-box;
            color: #111827;
            display: flex;
            flex-direction: column;
            font-size: 7px;
            font-weight: 800;
            height: 16px;
            justify-content: center;
            line-height: 1.05;
            overflow: hidden;
            padding: 0 1px;
            position: absolute;
            text-align: center;
            white-space: nowrap;
            z-index: 2;
          }

          .shift-block span {
            font-size: 7px;
          }
          @media print {
            html,
            body {
              background: white !important;
            }

            .print-header {
              margin-bottom: 2mm;
            }

            .print-title {
              font-size: 24px;
            }

            .excel-roster {
              transform-origin: top left;
            }

            .daily-roster-table {
              border-width: 1.5px;
              width: 100%;
            }

            .daily-roster-table th,
            .daily-roster-table td {
              border-color: #666;
            }

            .header-cell {
              background: #d9d9d9 !important;
              color: #000000 !important;
            }

            .body-cell,
            .note-cell,
            .time-slot,
            .timeline-body-grid {
              background: #ffffff !important;
              color: #000000 !important;
            }

            .name-cell {
              background: #ddebf7 !important;
              color: #1f4e79 !important;
            }

            .work-cell {
              background: #ffff66 !important;
              color: #000000 !important;
            }

            .shift-block {
              background: #f4bfd4 !important;
              border-color: #df7fa6 !important;
              color: #111827 !important;
            }

            .no-col {
              width: 7mm;
            }

            .name-col {
              width: 24mm;
            }

            .timeline-col {
              width: auto;
            }

            .work-col {
              width: 17mm;
            }

            .note-col {
              width: 18mm;
            }

            .time-header-cell,
            .timeline-cell,
            .name-cell {
              border-color: #444 !important;
              border-width: 1.5px !important;
            }

            .daily-roster-table thead th,
            .time-header-cell {
              border-bottom-color: #444 !important;
              border-bottom-width: 2px !important;
            }

            .daily-roster-table tbody tr:first-child td {
              border-top-color: #444 !important;
              border-top-width: 2px !important;
            }

            .hour-line {
              border-left-color: #999;
            }

            .half-line {
              border-left-color: #c4c4c4;
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