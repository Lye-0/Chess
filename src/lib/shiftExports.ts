import type { EmployeeProfile } from "./people";
import {
  calculateShiftPayroll,
  formatCurrency,
  type PayrollSettings,
  type ShiftPayroll,
} from "./payroll";
import { getShiftRequestPositionLabel, type ShiftRequest } from "./shiftRequests";

export type ShiftExportFormat = "ics" | "png" | "pdf" | "csv" | "excel" | "print" | "calendarSubscription";
export type ShiftExportScope = "month" | "monthDaily" | "day";

export type MonthlyShiftExportRow = {
  employee: EmployeeProfile | null;
  request: ShiftRequest;
  payroll: ShiftPayroll;
};

export type MonthlyShiftExportData = {
  organizationName: string;
  department: string;
  month: string;
  employees: EmployeeProfile[];
  rows: MonthlyShiftExportRow[];
};

export type DailyShiftExportData = {
  organizationName: string;
  department: string;
  date: string;
  employees: EmployeeProfile[];
  rows: MonthlyShiftExportRow[];
};

type DailyShiftExportLaneRow = MonthlyShiftExportRow & {
  lane: number;
};

type BuildMonthlyShiftExportDataInput = {
  organizationName: string;
  department?: string;
  month: string;
  employees: EmployeeProfile[];
  requests: ShiftRequest[];
  payrollSettings: PayrollSettings;
  employeeId?: string;
};

type BuildDailyShiftExportDataInput = Omit<
  BuildMonthlyShiftExportDataInput,
  "month"
> & {
  date: string;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const shiftExportColors = [
  { fill: "#dbeafe", stroke: "#60a5fa", text: "#1d4ed8" },
  { fill: "#dcfce7", stroke: "#4ade80", text: "#166534" },
  { fill: "#ede9fe", stroke: "#a78bfa", text: "#6d28d9" },
  { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  { fill: "#fce7f3", stroke: "#f472b6", text: "#be185d" },
  { fill: "#cffafe", stroke: "#22d3ee", text: "#0e7490" },
];

function getShiftExportColor(positionName: string) {
  const source = positionName || "ポジション未設定";
  const hash = Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return shiftExportColors[hash % shiftExportColors.length];
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getCurrentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function getCurrentDateValue(date = new Date()) {
  return `${getCurrentMonthValue(date)}-${padDatePart(date.getDate())}`;
}

function parseShiftDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function getShiftStartEnd(request: ShiftRequest) {
  const startAt = parseShiftDateTime(request.date, request.startTime);
  const endAt = parseShiftDateTime(request.date, request.endTime);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return { startAt, endAt };
}

function getShiftStartEndMinutesFromTimes(timeRange: Pick<ShiftRequest, "startTime" | "endTime">) {
  const start = parseTimeToMinutes(timeRange.startTime);
  const end = parseTimeToMinutes(timeRange.endTime);

  return {
    start,
    end: end > start ? end : end + 24 * 60,
  };
}

function getShiftStartEndMinutes(request: ShiftRequest) {
  return getShiftStartEndMinutesFromTimes(request);
}

function hasActualTimeAdjustment(request: ShiftRequest) {
  const actualStartTime = request.actualStartTime.trim();
  const actualEndTime = request.actualEndTime.trim();

  return Boolean(
    actualStartTime &&
      actualEndTime &&
      (actualStartTime !== request.startTime || actualEndTime !== request.endTime),
  );
}

function getEffectiveShiftTimeRange(request: ShiftRequest) {
  if (hasActualTimeAdjustment(request)) {
    return {
      startTime: request.actualStartTime.trim(),
      endTime: request.actualEndTime.trim(),
    };
  }

  return {
    startTime: request.startTime,
    endTime: request.endTime,
  };
}

function getExcelShiftStartEndMinutes(request: ShiftRequest) {
  return getShiftStartEndMinutesFromTimes(getEffectiveShiftTimeRange(request));
}

function getShiftDurationMinutes(range: { start: number; end: number }) {
  return Math.max(0, range.end - range.start);
}

function assignDailyShiftLanes(
  rows: MonthlyShiftExportRow[],
  getRange: (request: ShiftRequest) => { start: number; end: number } = getShiftStartEndMinutes,
  getPositionLabel: (request: ShiftRequest) => string = getShiftRequestPositionLabel,
) {
  const groups = new Map<string, MonthlyShiftExportRow[]>();

  rows
    .slice()
    .sort((a, b) => {
      const aRange = getRange(a.request);
      const bRange = getRange(b.request);

      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      if (aRange.end !== bRange.end) return aRange.end - bRange.end;

      return getPositionLabel(a.request).localeCompare(
        getPositionLabel(b.request),
        "ja",
      );
    })
    .forEach((row) => {
      const positionKey =
        row.request.positionId ||
        getPositionLabel(row.request) ||
        "ポジション未設定";
      const group = groups.get(positionKey) ?? [];
      group.push(row);
      groups.set(positionKey, group);
    });

  const placedRows: DailyShiftExportLaneRow[] = [];
  let nextBaseLane = 0;

  Array.from(groups.values())
    .sort((a, b) => {
      const aFirst = Math.min(
        ...a.map((row) => getRange(row.request).start),
      );
      const bFirst = Math.min(
        ...b.map((row) => getRange(row.request).start),
      );

      if (aFirst !== bFirst) return aFirst - bFirst;

      return getPositionLabel(a[0].request).localeCompare(
        getPositionLabel(b[0].request),
        "ja",
      );
    })
    .forEach((items) => {
      const laneEndMinutes: number[] = [];

      items.forEach((row) => {
        const range = getRange(row.request);
        const lane = laneEndMinutes.findIndex(
          (endMinutes) => endMinutes <= range.start,
        );
        const nextLane = lane >= 0 ? lane : laneEndMinutes.length;
        laneEndMinutes[nextLane] = range.end;
        placedRows.push({ ...row, lane: nextBaseLane + nextLane });
      });

      nextBaseLane += Math.max(1, laneEndMinutes.length);
    });

  return placedRows.sort((a, b) => {
    const aRange = getRange(a.request);
    const bRange = getRange(b.request);

    if (aRange.start !== bRange.start) return aRange.start - bRange.start;
    return aRange.end - bRange.end;
  });
}

function getDailyShiftLaneCount(rows: DailyShiftExportLaneRow[]) {
  return rows.length > 0 ? Math.max(...rows.map((row) => row.lane)) + 1 : 1;
}

function getDailyRosterRowHeight(laneCount: number) {
  const blockHeight = 46;
  const blockGap = 6;
  const verticalPadding = 22;

  return Math.max(68, verticalPadding + laneCount * blockHeight + (laneCount - 1) * blockGap);
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year}年${Number(monthNumber)}月`;
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getMonth() + 1}/${parsedDate.getDate()} (${weekdays[parsedDate.getDay()]})`;
}

function formatFullDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日 ${weekdays[parsedDate.getDay()]}`;
}

function getDaysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber, 0).getDate();
}

function getMonthDays(month: string) {
  return Array.from({ length: getDaysInMonth(month) }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${padDatePart(day)}`;
    const parsedDate = new Date(`${date}T00:00:00`);
    const weekdayIndex = parsedDate.getDay();

    return {
      date,
      day,
      weekday: weekdays[weekdayIndex],
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

function formatHours(minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;

  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function escapeCsvValue(value: string | number) {
  const text = String(value);

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function formatIcsDateTime(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    "00",
  ].join("");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

function getFilenameBase(data: MonthlyShiftExportData | DailyShiftExportData) {
  return "month" in data ? `shift-${data.month}` : `shift-${data.date}`;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function getWrappedTextLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";

  [...text].forEach((character) => {
    const nextLine = `${line}${character}`;
    if (context.measureText(nextLine).width <= maxWidth || !line) {
      line = nextLine;
      return;
    }

    lines.push(line);
    line = character;
  });

  if (line) lines.push(line);

  return lines.slice(0, maxLines);
}

function drawCenteredWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  lineHeight: number,
  maxLines: number,
) {
  const lines = getWrappedTextLines(context, text, width, maxLines);
  const totalTextHeight = (lines.length - 1) * lineHeight;
  const firstLineY = y + height / 2 - totalTextHeight / 2;

  lines.forEach((line, index) => {
    context.fillText(line, x, firstLineY + index * lineHeight);
  });
}

function getEmployeeDisplayRows(data: MonthlyShiftExportData | DailyShiftExportData) {
  return data.employees.length > 0 ? data.employees : [null];
}

function getMonthlyRosterRowHeight(maxDailyShiftCount: number) {
  const blockHeight = 24;
  const blockGap = 4;
  const verticalPadding = 6;
  const visibleShiftCount = Math.max(1, maxDailyShiftCount);

  return Math.max(
    58,
    visibleShiftCount * blockHeight +
      Math.max(0, visibleShiftCount - 1) * blockGap +
      verticalPadding,
  );
}


function drawFittedCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { maxFontSize: number; minFontSize: number; fontWeight?: string },
) {
  const fontWeight = options.fontWeight ? `${options.fontWeight} ` : "";
  let fontSize = options.maxFontSize;

  while (fontSize > options.minFontSize) {
    context.font = `${fontWeight}${fontSize}px Arial, sans-serif`;
    if (context.measureText(text).width <= width - 6) break;
    fontSize -= 1;
  }

  context.font = `${fontWeight}${Math.max(fontSize, options.minFontSize)}px Arial, sans-serif`;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.textAlign = "center";
  context.fillText(text, x + width / 2, y + height / 2);
  context.restore();
}
function drawShiftExportBlock(
  context: CanvasRenderingContext2D,
  row: MonthlyShiftExportRow,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const positionName = getShiftRequestPositionLabel(row.request);
  const color = getShiftExportColor(positionName);
  const timeLabel = `${row.request.startTime}-${row.request.endTime}`;

  context.fillStyle = color.fill;
  context.fillRect(x, y, width, height);
  context.strokeStyle = color.stroke;
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);

  context.save();
  context.beginPath();
  context.rect(x + 2, y + 2, Math.max(1, width - 4), Math.max(1, height - 4));
  context.clip();
  context.textAlign = "center";
  context.fillStyle = color.text;

  if (height >= 34 && width >= 54) {
    context.font = "bold 12px Arial, sans-serif";
    context.fillText(timeLabel, x + width / 2, y + height / 2 - 7);
    context.font = "bold 10px Arial, sans-serif";
    context.fillText(positionName, x + width / 2, y + height / 2 + 8);
  } else {
    context.font = "bold 10px Arial, sans-serif";
    context.fillText(width >= 42 ? timeLabel : positionName.slice(0, 2), x + width / 2, y + height / 2);
  }

  context.restore();
}


function drawCompactShiftExportBlock(
  context: CanvasRenderingContext2D,
  row: MonthlyShiftExportRow,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const positionName = getShiftRequestPositionLabel(row.request);
  const color = getShiftExportColor(positionName);
  const timeLabel = `${row.request.startTime}-${row.request.endTime}`;
  const topLineHeight = Math.max(9, Math.floor(height * 0.52));
  const bottomLineHeight = Math.max(8, height - topLineHeight - 1);

  context.fillStyle = color.fill;
  context.fillRect(x, y, width, height);
  context.strokeStyle = color.stroke;
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);
  context.fillStyle = color.text;
  drawFittedCenteredText(context, timeLabel, x + 2, y + 1, width - 4, topLineHeight, {
    maxFontSize: 9,
    minFontSize: 7,
    fontWeight: "bold",
  });
  context.fillStyle = color.text;
  drawFittedCenteredText(context, positionName, x + 2, y + topLineHeight, width - 4, bottomLineHeight, {
    maxFontSize: 8,
    minFontSize: 6,
    fontWeight: "bold",
  });
}
function drawEmployeeRoster(data: MonthlyShiftExportData) {
  const [year, monthNumber] = data.month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const firstCalendarDate = new Date(year, monthIndex, 1 - firstDay);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);
    const dateValue = [
      date.getFullYear(),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getDate()),
    ].join("-");

    return {
      date: dateValue,
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
    };
  });
  const rowsByDate = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>(
    (groups, row) => {
      groups[row.request.date] = [...(groups[row.request.date] ?? []), row];
      return groups;
    },
    {},
  );
  const width = 1520;
  const marginX = 24;
  const headerHeight = 86;
  const weekdayHeight = 40;
  const shiftLineHeight = 20;
  const weekRowHeights = Array.from({ length: 6 }, (_, weekIndex) => {
    const maxShiftCountInWeek = Math.max(
      1,
      ...calendarDays
        .slice(weekIndex * 7, weekIndex * 7 + 7)
        .map((day) => rowsByDate[day.date]?.length ?? 0),
    );

    return Math.max(120, 50 + maxShiftCountInWeek * shiftLineHeight);
  });
  const footerHeight = 42;
  const calendarWidth = width - marginX * 2;
  const cellWidth = calendarWidth / 7;
  const calendarBodyHeight = weekRowHeights.reduce((total, rowHeight) => total + rowHeight, 0);
  const height = headerHeight + weekdayHeight + calendarBodyHeight + footerHeight;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas is not available.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "middle";
  context.fillStyle = "#030213";
  context.font = "bold 28px Arial, sans-serif";
  context.fillText("マイカレンダー", marginX, 24);
  context.font = "16px Arial, sans-serif";
  context.fillStyle = "#717182";
  context.fillText("自分の確定シフトを月ごとに確認できます", marginX, 54);
  context.fillStyle = "#030213";
  context.font = "bold 18px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(formatMonthLabel(data.month), width / 2, 32);
  context.textAlign = "left";

  const calendarTop = headerHeight;
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 1.25;
  weekdays.forEach((weekday, index) => {
    const x = marginX + index * cellWidth;

    context.fillStyle = "#ffffff";
    context.fillRect(x, calendarTop, cellWidth, weekdayHeight);
    context.strokeRect(x, calendarTop, cellWidth, weekdayHeight);
    context.fillStyle = "#475569";
    context.font = "bold 16px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(weekday, x + cellWidth / 2, calendarTop + weekdayHeight / 2);
  });
  context.textAlign = "left";

  calendarDays.forEach((day, index) => {
    const column = index % 7;
    const row = Math.floor(index / 7);
    const x = marginX + column * cellWidth;
    const rowHeight = weekRowHeights[row] ?? 120;
    const y = calendarTop + weekdayHeight + weekRowHeights
      .slice(0, row)
      .reduce((total, height) => total + height, 0);
    const dayRows = (rowsByDate[day.date] ?? []).slice().sort((a, b) => {
      if (a.request.startTime !== b.request.startTime) {
        return a.request.startTime.localeCompare(b.request.startTime);
      }
      return getShiftRequestPositionLabel(a.request).localeCompare(
        getShiftRequestPositionLabel(b.request),
        "ja",
      );
    });
    context.fillStyle = day.outside ? "#fafafa" : "#ffffff";
    context.fillRect(x, y, cellWidth, rowHeight);
    context.strokeStyle = "#94a3b8";
    context.strokeRect(x, y, cellWidth, rowHeight);

    context.fillStyle = day.outside ? "#9ca3af" : "#475569";
    context.font = "bold 15px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(String(day.day), x + 24, y + 25);
    context.textAlign = "left";

    if (dayRows.length > 0) {
      context.fillStyle = "#eef2f7";
      context.beginPath();
      context.roundRect(x + cellWidth - 54, y + 14, 42, 22, 11);
      context.fill();
      context.fillStyle = "#475569";
      context.font = "bold 13px Arial, sans-serif";
      context.textAlign = "center";
      context.fillText(`${dayRows.length}件`, x + cellWidth - 33, y + 25);
      context.textAlign = "left";
    }

    dayRows.forEach((rowItem, rowIndex) => {
      const textY = y + 55 + rowIndex * shiftLineHeight;
      const positionName = getShiftRequestPositionLabel(rowItem.request);

      context.save();
      context.beginPath();
      context.rect(x + 12, textY - 10, cellWidth - 24, shiftLineHeight);
      context.clip();
      context.fillStyle = "#15803d";
      context.font = "bold 13px Arial, sans-serif";
      context.fillText(
        `${rowItem.request.startTime}～${rowItem.request.endTime}（${positionName}）`,
        x + 12,
        textY,
      );
      context.restore();
    });
  });

  context.fillStyle = "#475569";
  context.font = "13px Arial, sans-serif";
  context.fillText(`出力日時: ${new Date().toLocaleString("ja-JP")}`, marginX, height - 18);

  return canvas;
}

function drawManagerRoster(data: MonthlyShiftExportData) {
  const days = getMonthDays(data.month);
  const headerHeight = 122;
  const footerHeight = 52;
  const indexWidth = 46;
  const nameWidth = 176;
  const dayWidth = 88;
  const totalWidth = 88;
  const payWidth = 108;
  const width = indexWidth + nameWidth + days.length * dayWidth + totalWidth + payWidth;
  const rowsByEmployee = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>(
    (groups, row) => {
      groups[row.request.employeeId] = [...(groups[row.request.employeeId] ?? []), row];
      return groups;
    },
    {},
  );
  const displayEmployees = getEmployeeDisplayRows(data);
  const rowHeights = displayEmployees.map((employee) => {
    const employeeRows = employee ? rowsByEmployee[employee.employeeId] ?? [] : [];
    const maxDailyShiftCount = days.reduce((maxCount, day) => {
      const dayShiftCount = employeeRows.filter((row) => row.request.date === day.date).length;
      return Math.max(maxCount, dayShiftCount);
    }, 0);

    return getMonthlyRosterRowHeight(maxDailyShiftCount);
  });
  const bodyHeight = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0);
  const height = headerHeight + bodyHeight + footerHeight;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas is not available.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "middle";
  context.strokeStyle = "#2f3338";
  context.lineWidth = 1;
  context.fillStyle = "#111827";
  context.font = "bold 28px Arial, sans-serif";
  context.fillText("従業員シフト表", 28, 36);
  context.font = "16px Arial, sans-serif";
  context.fillText(`${data.organizationName}${data.department ? ` ${data.department}` : ""}`, 28, 70);
  context.fillText(formatMonthLabel(data.month), 28, 96);

  const tableTop = headerHeight - 42;
  const totalX = indexWidth + nameWidth + days.length * dayWidth;

  context.fillStyle = "#f3f4f6";
  context.fillRect(0, tableTop, width, 42);
  context.fillStyle = "#111827";
  context.font = "bold 13px Arial, sans-serif";
  context.fillText("No.", 14, tableTop + 21);
  context.fillText("氏名", indexWidth + 14, tableTop + 21);
  days.forEach((day, index) => {
    const x = indexWidth + nameWidth + index * dayWidth;

    context.fillStyle = day.isWeekend ? "#fff7ed" : "#f8fafc";
    context.fillRect(x, tableTop, dayWidth, 42);
    context.fillStyle = "#111827";
    context.font = "bold 13px Arial, sans-serif";
    context.fillText(`${day.day}`, x + 10, tableTop + 16);
    context.font = "12px Arial, sans-serif";
    context.fillText(day.weekday, x + 38, tableTop + 16);
  });
  context.fillStyle = "#fef08a";
  context.fillRect(totalX, tableTop, totalWidth, 42);
  context.fillStyle = "#fef3c7";
  context.fillRect(totalX + totalWidth, tableTop, payWidth, 42);
  context.fillStyle = "#111827";
  context.font = "bold 13px Arial, sans-serif";
  context.fillText("合計", totalX + 22, tableTop + 21);
  context.fillText("給与目安", totalX + totalWidth + 18, tableTop + 21);

  let nextRowY = headerHeight;

  displayEmployees.forEach((employee, rowIndex) => {
    const y = nextRowY;
    const rowHeight = rowHeights[rowIndex] ?? getMonthlyRosterRowHeight(0);
    const employeeRows = employee ? rowsByEmployee[employee.employeeId] ?? [] : [];
    const totalMinutes = employeeRows.reduce((total, row) => total + row.payroll.totalMinutes, 0);
    const totalPay = employeeRows.reduce((total, row) => total + row.payroll.totalPay, 0);

    context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    context.fillRect(0, y, width, rowHeight);
    context.fillStyle = "#e0f2fe";
    context.fillRect(indexWidth, y, nameWidth, rowHeight);
    context.fillStyle = "#111827";
    context.font = "13px Arial, sans-serif";
    context.fillText(String(rowIndex + 1), 16, y + rowHeight / 2);
    context.font = "bold 17px Arial, sans-serif";
    drawCenteredWrappedText(context, employee?.name ?? "対象従業員なし", indexWidth + 12, y, nameWidth - 20, rowHeight, 20, 2);

    days.forEach((day, dayIndex) => {
      const x = indexWidth + nameWidth + dayIndex * dayWidth;
      const dayRows = employeeRows.filter((row) => row.request.date === day.date);

      const blockHeight = 24;
      const blockGap = 4;
      const blockGroupHeight = dayRows.length * blockHeight + Math.max(0, dayRows.length - 1) * blockGap;
      const firstBlockY = y + rowHeight / 2 - blockGroupHeight / 2;

      dayRows.forEach((row, index) => {
        const blockX = x + 4;
        const blockY = firstBlockY + index * (blockHeight + blockGap);
        const blockWidth = dayWidth - 8;

        drawCompactShiftExportBlock(context, row, blockX, blockY, blockWidth, blockHeight);
      });
    });

    context.fillStyle = "#fef08a";
    context.fillRect(totalX, y, totalWidth, rowHeight);
    context.fillStyle = "#fef3c7";
    context.fillRect(totalX + totalWidth, y, payWidth, rowHeight);
    context.fillStyle = "#111827";
    context.font = "bold 13px Arial, sans-serif";
    context.fillText(formatHours(totalMinutes), totalX + 16, y + rowHeight / 2);
    context.fillText(formatCurrency(totalPay), totalX + totalWidth + 12, y + rowHeight / 2);

    nextRowY += rowHeight;
  });

  const bottom = height - footerHeight;
  const verticalLines = [0, indexWidth, indexWidth + nameWidth, totalX, totalX + totalWidth, width];
  days.forEach((_, index) => verticalLines.push(indexWidth + nameWidth + index * dayWidth));
  verticalLines.forEach((x) => {
    context.beginPath();
    context.moveTo(x, tableTop);
    context.lineTo(x, bottom);
    context.stroke();
  });
  [tableTop, headerHeight].forEach((lineY) => {
    context.beginPath();
    context.moveTo(0, lineY);
    context.lineTo(width, lineY);
    context.stroke();
  });
  let nextLineY = headerHeight;
  rowHeights.forEach((rowHeight) => {
    nextLineY += rowHeight;
    context.beginPath();
    context.moveTo(0, nextLineY);
    context.lineTo(width, nextLineY);
    context.stroke();
  });

  context.fillStyle = "#475569";
  context.font = "13px Arial, sans-serif";
  context.fillText(`出力日時: ${new Date().toLocaleString("ja-JP")}`, 28, height - 24);

  return canvas;
}

function getDailyTimeRange(rows: MonthlyShiftExportRow[]) {
  const shiftRanges = rows.map((row) => getShiftStartEndMinutes(row.request));
  const minShiftStart = Math.min(...shiftRanges.map((range) => range.start), 9 * 60);
  const maxShiftEnd = Math.max(...shiftRanges.map((range) => range.end), 22 * 60);
  const start = Math.floor(minShiftStart / 30) * 30;
  const end = Math.max(start + 60, Math.ceil(maxShiftEnd / 30) * 30 + 30);

  return { start, end };
}

function drawDailyRoster(data: DailyShiftExportData) {
  const headerHeight = 138;
  const timeHeaderHeight = 56;
  const footerHeight = 52;
  const indexWidth = 46;
  const nameWidth = 190;
  const slotWidth = 34;
  const totalWidth = 90;
  const payWidth = 112;
  const displayEmployees = getEmployeeDisplayRows(data);
  const rowsByEmployee = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>(
    (groups, row) => {
      groups[row.request.employeeId] = [...(groups[row.request.employeeId] ?? []), row];
      return groups;
    },
    {},
  );
  const laneRowsByEmployee = displayEmployees.reduce<Record<string, DailyShiftExportLaneRow[]>>(
    (groups, employee) => {
      if (!employee) return groups;
      groups[employee.employeeId] = assignDailyShiftLanes(
        rowsByEmployee[employee.employeeId] ?? [],
      );
      return groups;
    },
    {},
  );
  const rowHeights = displayEmployees.map((employee) => {
    const laneRows = employee ? laneRowsByEmployee[employee.employeeId] ?? [] : [];
    return getDailyRosterRowHeight(getDailyShiftLaneCount(laneRows));
  });
  const { start, end } = getDailyTimeRange(data.rows);
  const slotCount = Math.ceil((end - start) / 30);
  const timeWidth = slotCount * slotWidth;
  const totalX = indexWidth + nameWidth + timeWidth;
  const width = indexWidth + nameWidth + timeWidth + totalWidth + payWidth;
  const tableTop = headerHeight;
  const bodyTop = tableTop + timeHeaderHeight;
  const bodyHeight = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0);
  const height = bodyTop + bodyHeight + footerHeight;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas is not available.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "middle";
  context.strokeStyle = "#2f3338";
  context.lineWidth = 1;
  context.fillStyle = "#111827";
  context.font = "bold 28px Arial, sans-serif";
  context.fillText("従業員シフト表", 28, 36);

  const dateLabel = formatFullDateLabel(data.date);
  context.font = "bold 22px Arial, sans-serif";
  const dateLabelWidth = Math.ceil(context.measureText(dateLabel).width) + 36;
  context.fillStyle = "#fef3c7";
  context.fillRect(260, 17, dateLabelWidth, 38);
  context.strokeStyle = "#facc15";
  context.lineWidth = 1;
  context.strokeRect(260, 17, dateLabelWidth, 38);
  context.fillStyle = "#111827";
  context.fillText(dateLabel, 278, 36);

  context.font = "16px Arial, sans-serif";
  context.fillText(`${data.organizationName}${data.department ? ` ${data.department}` : ""}`, 28, 78);

  const totalMinutes = data.rows.reduce((total, row) => total + row.payroll.totalMinutes, 0);
  const totalPay = data.rows.reduce((total, row) => total + row.payroll.totalPay, 0);
  context.fillStyle = "#fef3c7";
  context.fillRect(width - 310, 20, 280, 78);
  context.fillStyle = "#111827";
  context.font = "bold 14px Arial, sans-serif";
  context.fillText(`総勤務時間 ${formatHours(totalMinutes)}`, width - 288, 44);
  context.fillText(`給与目安 ${formatCurrency(totalPay)}`, width - 288, 74);

  context.fillStyle = "#f3f4f6";
  context.fillRect(0, tableTop, width, timeHeaderHeight);
  context.fillStyle = "#111827";
  context.font = "bold 13px Arial, sans-serif";
  context.fillText("No.", 14, tableTop + timeHeaderHeight / 2);
  context.fillText("氏名", indexWidth + 14, tableTop + timeHeaderHeight / 2);
  context.fillText("合計", totalX + 22, tableTop + timeHeaderHeight / 2);
  context.fillText("給与目安", totalX + totalWidth + 14, tableTop + timeHeaderHeight / 2);

  for (let minute = start; minute < end; minute += 30) {
    const x = indexWidth + nameWidth + ((minute - start) / 30) * slotWidth;
    const hour = Math.floor((minute % (24 * 60)) / 60);
    const isHour = minute % 60 === 0;

    context.strokeStyle = isHour ? "#111827" : "#cbd5e1";
    context.lineWidth = isHour ? 2 : 1;
    context.beginPath();
    context.moveTo(x, tableTop);
    context.lineTo(x, bodyTop + bodyHeight);
    context.stroke();

    if (isHour) {
      context.fillStyle = "#111827";
      context.font = "bold 12px Arial, sans-serif";
      context.fillText(String(hour), x + 7, tableTop + 18);
    }
  }

  let nextRowY = bodyTop;

  displayEmployees.forEach((employee, rowIndex) => {
    const y = nextRowY;
    const rowHeight = rowHeights[rowIndex] ?? getDailyRosterRowHeight(1);
    const employeeRows = employee ? rowsByEmployee[employee.employeeId] ?? [] : [];
    const laneRows = employee ? laneRowsByEmployee[employee.employeeId] ?? [] : [];
    const laneCount = getDailyShiftLaneCount(laneRows);
    const employeeMinutes = employeeRows.reduce((total, row) => total + row.payroll.totalMinutes, 0);
    const employeePay = employeeRows.reduce((total, row) => total + row.payroll.totalPay, 0);

    context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    context.fillRect(0, y, width, rowHeight);
    context.fillStyle = "#e0f2fe";
    context.fillRect(indexWidth, y, nameWidth, rowHeight);
    context.fillStyle = "#111827";
    context.font = "13px Arial, sans-serif";
    context.fillText(String(rowIndex + 1), 16, y + rowHeight / 2);
    context.font = "bold 17px Arial, sans-serif";
    drawCenteredWrappedText(context, employee?.name ?? "対象従業員なし", indexWidth + 12, y, nameWidth - 20, rowHeight, 20, 2);

    laneRows.forEach((row) => {
      const range = getShiftStartEndMinutes(row.request);
      const blockStart = Math.max(start, range.start);
      const blockEnd = Math.min(end, range.end);
      const x = indexWidth + nameWidth + ((blockStart - start) / 30) * slotWidth + 2;
      const blockWidth = Math.max(10, ((blockEnd - blockStart) / 30) * slotWidth - 4);
      const blockHeight = 46;
      const blockGap = 6;
      const blockGroupHeight = laneCount * blockHeight + (laneCount - 1) * blockGap;
      const blockY = y + rowHeight / 2 - blockGroupHeight / 2 + row.lane * (blockHeight + blockGap);

      if (blockEnd <= blockStart) return;
      drawShiftExportBlock(context, row, x, blockY, blockWidth, blockHeight);
    });

    context.fillStyle = "#fef08a";
    context.fillRect(totalX, y, totalWidth, rowHeight);
    context.fillStyle = "#fef3c7";
    context.fillRect(totalX + totalWidth, y, payWidth, rowHeight);
    context.fillStyle = "#111827";
    context.font = "bold 13px Arial, sans-serif";
    context.fillText(formatHours(employeeMinutes), totalX + 16, y + rowHeight / 2);
    context.fillText(formatCurrency(employeePay), totalX + totalWidth + 12, y + rowHeight / 2);

    nextRowY += rowHeight;
  });

  const verticalLines = [0, indexWidth, indexWidth + nameWidth, totalX, totalX + totalWidth, width];
  verticalLines.forEach((x) => {
    context.strokeStyle = "#2f3338";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, tableTop);
    context.lineTo(x, bodyTop + bodyHeight);
    context.stroke();
  });
  [tableTop, bodyTop].forEach((lineY) => {
    context.strokeStyle = "#2f3338";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, lineY);
    context.lineTo(width, lineY);
    context.stroke();
  });
  let nextLineY = bodyTop;
  rowHeights.forEach((rowHeight) => {
    nextLineY += rowHeight;
    context.strokeStyle = "#2f3338";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, nextLineY);
    context.lineTo(width, nextLineY);
    context.stroke();
  });

  context.fillStyle = "#475569";
  context.font = "13px Arial, sans-serif";
  context.fillText(`出力日時: ${new Date().toLocaleString("ja-JP")}`, 28, height - 24);

  return canvas;
}

function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  const base64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function buildPdfFromJpegs(images: { bytes: Uint8Array; width: number; height: number }[]) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  function pushText(text: string) {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    length += bytes.length;
  }

  function pushBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    length += bytes.length;
  }

  function addObject(id: number, content: string) {
    offsets[id] = length;
    pushText(`${id} 0 obj\n${content}\nendobj\n`);
  }

  const pageIds = images.map((_, index) => 3 + index * 3);

  pushText("%PDF-1.4\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`);

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;
    const contentStream = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im${index} Do\nQ`;

    addObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    offsets[imageId] = length;
    pushText(` ${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`.trimStart());
    pushBytes(image.bytes);
    pushText("\nendstream\nendobj\n");
    addObject(contentId, `<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}\nendstream`);
  });

  const objectCount = 2 + images.length * 3;
  const xrefOffset = length;
  pushText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    pushText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdfBytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    pdfBytes.set(chunk, offset);
    offset += chunk.length;
  });

  return pdfBytes;
}

function canvasesToPdfBytes(canvases: HTMLCanvasElement[]) {
  return buildPdfFromJpegs(
    canvases.map((canvas) => ({
      bytes: canvasToJpegBytes(canvas),
      width: canvas.width,
      height: canvas.height,
    })),
  );
}

export function getShiftExportMonths(requests: ShiftRequest[]) {
  const months = new Set<string>([getCurrentMonthValue()]);

  requests.forEach((request) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
      months.add(request.date.slice(0, 7));
    }
  });

  return [...months].sort().reverse();
}

export function getShiftExportDates(requests: ShiftRequest[], month?: string) {
  const dates = new Set<string>();

  requests.forEach((request) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(request.date) && (!month || request.date.startsWith(month))) {
      dates.add(request.date);
    }
  });

  if (dates.size === 0) {
    dates.add(month ? `${month}-01` : getCurrentDateValue());
  }

  return [...dates].sort().reverse();
}

export function buildMonthlyShiftExportData({
  organizationName,
  department = "",
  month,
  employees,
  requests,
  payrollSettings,
  employeeId,
}: BuildMonthlyShiftExportDataInput): MonthlyShiftExportData {
  const employeesById = new Map(employees.map((employee) => [employee.employeeId, employee]));
  const rows = requests
    .filter((request) => request.status === "承認済")
    .filter((request) => request.date.startsWith(month))
    .filter((request) => !employeeId || request.employeeId === employeeId)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.employeeName.localeCompare(b.employeeName);
    })
    .map((request) => ({
      employee: employeesById.get(request.employeeId) ?? null,
      request,
      payroll: calculateShiftPayroll(request, payrollSettings),
    }));
  const scopedEmployees = employeeId
    ? employees.filter((employee) => employee.employeeId === employeeId)
    : employees;

  return {
    organizationName,
    department,
    month,
    employees: scopedEmployees,
    rows,
  };
}

export function buildDailyShiftExportData({
  organizationName,
  department = "",
  date,
  employees,
  requests,
  payrollSettings,
  employeeId,
}: BuildDailyShiftExportDataInput): DailyShiftExportData {
  const monthlyData = buildMonthlyShiftExportData({
    organizationName,
    department,
    month: date.slice(0, 7),
    employees,
    requests,
    payrollSettings,
    employeeId,
  });

  return {
    organizationName,
    department,
    date,
    employees: monthlyData.employees,
    rows: monthlyData.rows.filter((row) => row.request.date === date),
  };
}

export function buildShiftRequestsIcsContent(
  requests: ShiftRequest[],
  calendarName?: string,
) {
  const now = new Date();
  const events = requests
    .map((request) => {
      const { startAt, endAt } = getShiftStartEnd(request);
      const positionName = getShiftRequestPositionLabel(request);
      const description = `${formatDateLabel(request.date)} ${request.startTime}-${request.endTime} ${positionName}`;

      return [
        "BEGIN:VEVENT",
        `UID:${request.id}@chess-shift`,
        `DTSTAMP:${formatIcsDateTime(now)}`,
        `DTSTART:${formatIcsDateTime(startAt)}`,
        `DTEND:${formatIcsDateTime(endAt)}`,
        `SUMMARY:${escapeIcsText(`シフト ${positionName}`)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chess Shift//Shift Export//JA",
    "CALSCALE:GREGORIAN",
    calendarName ? `X-WR-CALNAME:${escapeIcsText(calendarName)}` : "",
    events,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function buildIcsContent(data: MonthlyShiftExportData) {
  return buildShiftRequestsIcsContent(data.rows.map((row) => row.request));
}

export function downloadIcs(data: MonthlyShiftExportData) {
  downloadTextFile(
    `${getFilenameBase(data)}.ics`,
    buildIcsContent(data),
    "text/calendar;charset=utf-8",
  );
}

export function downloadCsv(data: MonthlyShiftExportData) {
  const headers = ["日付", "曜日", "開始", "終了", "ポジション", "従業員ID", "氏名", "雇用形態", "勤務時間", "給与目安"];
  const rows = data.rows.map((row) => {
    const parsedDate = new Date(`${row.request.date}T00:00:00`);

    return [
      row.request.date,
      weekdays[parsedDate.getDay()],
      row.request.startTime,
      row.request.endTime,
      getShiftRequestPositionLabel(row.request),
      row.request.employeeId,
      row.request.employeeName,
      row.request.employmentType,
      formatHours(row.payroll.totalMinutes),
      row.payroll.totalPay,
    ];
  });
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");

  downloadTextFile(`${getFilenameBase(data)}.csv`, `\uFEFF${content}`, "text/csv;charset=utf-8");
}

export function downloadDailyCsv(data: DailyShiftExportData) {
  const headers = ["日付", "曜日", "開始", "終了", "ポジション", "従業員ID", "氏名", "雇用形態", "勤務時間", "給与目安"];
  const parsedDate = new Date(`${data.date}T00:00:00`);
  const rows = data.rows.map((row) => [
    data.date,
    weekdays[parsedDate.getDay()],
    row.request.startTime,
    row.request.endTime,
    getShiftRequestPositionLabel(row.request),
    row.request.employeeId,
    row.request.employeeName,
    row.request.employmentType,
    formatHours(row.payroll.totalMinutes),
    row.payroll.totalPay,
  ]);
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");

  downloadTextFile(`${getFilenameBase(data)}.csv`, `\uFEFF${content}`, "text/csv;charset=utf-8");
}

type XlsxCellValue = string | number;

type XlsxCell = {
  ref: string;
  value: XlsxCellValue;
  style?: number;
  type?: "inlineStr" | "n";
};

function getExcelDailyTimeRange(rows: MonthlyShiftExportRow[]) {
  const shiftRanges = rows.map((row) => getExcelShiftStartEndMinutes(row.request));
  const defaultStart = 9 * 60;
  const defaultEnd = 23 * 60 + 30;
  const minShiftStart = shiftRanges.length > 0
    ? Math.min(...shiftRanges.map((range) => range.start), defaultStart)
    : defaultStart;
  const maxShiftEnd = shiftRanges.length > 0
    ? Math.max(...shiftRanges.map((range) => range.end), defaultEnd)
    : defaultEnd;
  const start = Math.floor(minShiftStart / 30) * 30;
  const end = Math.max(defaultEnd, Math.ceil(maxShiftEnd / 30) * 30);

  return { start, end };
}

function formatExcelWorkHours(minutes: number) {
  const hours = Math.round((minutes / 60) * 10) / 10;

  return Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
}

function getColumnName(column: number) {
  let value = column;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function getCellColumnIndex(ref: string) {
  const columnName = ref.match(/^[A-Z]+/)?.[0] ?? "";

  return [...columnName].reduce(
    (total, character) => total * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

function escapeXml(value: XlsxCellValue) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createXlsxCellXml(cell: XlsxCell) {
  const style = cell.style !== undefined ? ` s="${cell.style}"` : "";

  if (cell.type === "n" || typeof cell.value === "number") {
    return `<c r="${cell.ref}"${style}><v>${cell.value}</v></c>`;
  }

  if (cell.value === "") {
    return `<c r="${cell.ref}"${style}/>`;
  }

  const textAttributes = String(cell.value).includes("\n") ? ` xml:space="preserve"` : "";
  return `<c r="${cell.ref}" t="inlineStr"${style}><is><t${textAttributes}>${escapeXml(cell.value)}</t></is></c>`;
}

const excelTimelineSlotMinutes = 10;

type ExcelTimelineLineKind = "hour" | "half" | "minor";
type ExcelLaneEdge = "single" | "top" | "middle" | "bottom";

function getExcelLaneEdge(lane: number, laneCount: number): ExcelLaneEdge {
  if (laneCount <= 1) return "single";
  if (lane === 0) return "top";
  if (lane === laneCount - 1) return "bottom";
  return "middle";
}

function getExcelLaneEdgeOffset(edge: Exclude<ExcelLaneEdge, "single">) {
  if (edge === "top") return 0;
  if (edge === "middle") return 1;
  return 2;
}

function getExcelLaneStyleStart() {
  return 14 + shiftExportColors.length * 3;
}

function getExcelTimelineLineKind(minutes: number): ExcelTimelineLineKind {
  if (minutes % 60 === 0) return "hour";
  if (minutes % 30 === 0) return "half";
  return "minor";
}

function getExcelTimelineGridStyleIndex(minutes: number, edge: ExcelLaneEdge = "single") {
  const lineKind = getExcelTimelineLineKind(minutes);
  if (edge !== "single") {
    const lineOffset = lineKind === "hour" ? 0 : lineKind === "half" ? 1 : 2;
    return getExcelLaneStyleStart() + 12 + lineOffset * 3 + getExcelLaneEdgeOffset(edge);
  }
  if (lineKind === "hour") return 8;
  if (lineKind === "half") return 9;
  return 13;
}

function getExcelTimelineHeaderStyleIndex(minutes: number) {
  const lineKind = getExcelTimelineLineKind(minutes);
  if (lineKind === "hour") return 5;
  if (lineKind === "half") return 9;
  return 13;
}

function getShiftExportXlsxStyleIndex(
  positionName: string,
  lineKind: ExcelTimelineLineKind,
  edge: ExcelLaneEdge = "single",
) {
  const colorIndex = shiftExportColors.indexOf(getShiftExportColor(positionName));
  const lineOffset = lineKind === "hour" ? 0 : lineKind === "half" ? 1 : 2;
  const safeColorIndex = Math.max(0, colorIndex);

  if (edge !== "single") {
    return getExcelLaneStyleStart() + 21 + safeColorIndex * 9 + lineOffset * 3 + getExcelLaneEdgeOffset(edge);
  }

  return 14 + safeColorIndex * 3 + lineOffset;
}

function getExcelBodyLaneStyleIndex(baseStyle: number, edge: ExcelLaneEdge) {
  if (edge === "single") return baseStyle;

  const bodyStyleOffsets = new Map<number, number>([
    [6, 0],
    [7, 1],
    [10, 2],
    [11, 3],
  ]);
  const bodyOffset = bodyStyleOffsets.get(baseStyle);

  return bodyOffset === undefined
    ? baseStyle
    : getExcelLaneStyleStart() + bodyOffset * 3 + getExcelLaneEdgeOffset(edge);
}

function createExcelPositionNameResolver(rows: MonthlyShiftExportRow[]) {
  const namesByKey = new Map<string, string>();
  const addName = (key: string, positionName: string) => {
    if (!key || key.endsWith(":") || !positionName || namesByKey.has(key)) return;
    namesByKey.set(key, positionName);
  };

  rows.forEach((row) => {
    const { request } = row;
    const positionName = request.positionName.trim();
    if (!positionName) return;

    addName(`slot:${request.slotId}`, positionName);
    addName(`position:${request.positionId}`, positionName);
  });

  return (request: ShiftRequest) => {
    const directName = request.positionName.trim();
    if (directName) return directName;

    return (
      namesByKey.get(`slot:${request.slotId}`) ??
      namesByKey.get(`position:${request.positionId}`) ??
      getShiftRequestPositionLabel(request)
    );
  };
}

function buildDailyRosterSheetXml(data: DailyShiftExportData) {
  const { start, end } = getExcelDailyTimeRange(data.rows);
  const slotCount = Math.ceil((end - start) / excelTimelineSlotMinutes);
  const timelineStartColumn = 3;
  const workColumn = timelineStartColumn + slotCount;
  const noteColumn = workColumn + 1;
  const maxColumn = noteColumn;
  const displayEmployees = getEmployeeDisplayRows(data);
  const resolvePositionName = createExcelPositionNameResolver(data.rows);
  const rowsByEmployee = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>(
    (groups, row) => {
      groups[row.request.employeeId] = [...(groups[row.request.employeeId] ?? []), row];
      return groups;
    },
    {},
  );
  const laneRowsByEmployee = displayEmployees.reduce<Record<string, DailyShiftExportLaneRow[]>>(
    (groups, employee) => {
      if (!employee) return groups;
      groups[employee.employeeId] = assignDailyShiftLanes(
        rowsByEmployee[employee.employeeId] ?? [],
        getExcelShiftStartEndMinutes,
        resolvePositionName,
      );
      return groups;
    },
    {},
  );
  const cellsByRow = new Map<number, XlsxCell[]>();
  const merges: string[] = [];
  const rowHeights = new Map<number, number>();
  const addCell = (row: number, column: number, value: XlsxCellValue, style?: number, type?: XlsxCell["type"]) => {
    const ref = `${getColumnName(column)}${row}`;
    const cells = [...(cellsByRow.get(row) ?? [])];
    const cell = { ref, value, style, type };
    const existingIndex = cells.findIndex((item) => item.ref === ref);

    if (existingIndex >= 0) {
      cells[existingIndex] = cell;
    } else {
      cells.push(cell);
    }

    cellsByRow.set(row, cells);
  };
  const addMerge = (startRow: number, startColumn: number, endRow: number, endColumn: number) => {
    if (startRow === endRow && startColumn === endColumn) return;
    merges.push(`${getColumnName(startColumn)}${startRow}:${getColumnName(endColumn)}${endRow}`);
  };

  rowHeights.set(1, 34);
  rowHeights.set(3, 28);
  rowHeights.set(4, 24);
  const dateLabelColumn = timelineStartColumn + Math.round((6 * 30) / excelTimelineSlotMinutes);
  const dateValueColumn = dateLabelColumn + Math.round((2 * 30) / excelTimelineSlotMinutes);
  const dateValueEndColumn = Math.min(
    dateValueColumn + Math.round((8 * 30) / excelTimelineSlotMinutes) - 1,
    maxColumn,
  );

  addCell(1, 1, "従業員シフト表", 1);
  for (let column = dateLabelColumn; column < dateValueColumn; column += 1) {
    addCell(1, column, column === dateLabelColumn ? "日付" : "", 2);
  }
  for (let column = dateValueColumn; column <= dateValueEndColumn; column += 1) {
    addCell(1, column, column === dateValueColumn ? formatFullDateLabel(data.date) : "", 3);
  }
  addCell(2, 1, `${data.organizationName}${data.department ? ` ${data.department}` : ""}`, 0);
  addCell(3, 1, "No.", 4);
  addCell(3, 2, "名前", 4);

  for (let slot = 0; slot < slotCount; slot += 1) {
    const minute = start + slot * excelTimelineSlotMinutes;
    const column = timelineStartColumn + slot;

    addCell(3, column, slot === 0 ? `タイムテーブル` : "", 12);

    if ((minute - start) % 30 === 0) {
      const headerEndColumn = Math.min(
        column + Math.round(30 / excelTimelineSlotMinutes) - 1,
        workColumn - 1,
      );
      const lineKind = getExcelTimelineLineKind(minute);
      const hour = Math.floor((minute % (24 * 60)) / 60);
      const label = lineKind === "hour" ? hour : "";

      addCell(4, column, label, getExcelTimelineHeaderStyleIndex(minute), typeof label === "number" ? "n" : "inlineStr");
      addMerge(4, column, 4, headerEndColumn);
    }
  }

  addCell(3, workColumn, "勤務時間", 4);
  addCell(3, noteColumn, "備考", 4);
  addCell(4, 1, "", 4);
  addCell(4, 2, "", 4);
  addCell(4, workColumn, "", 4);
  addCell(4, noteColumn, "", 4);

  let currentRow = 5;
  displayEmployees.forEach((employee, rowIndex) => {
    const employeeRows = employee ? rowsByEmployee[employee.employeeId] ?? [] : [];
    const laneRows = employee ? laneRowsByEmployee[employee.employeeId] ?? [] : [];
    const laneCount = getDailyShiftLaneCount(laneRows);
    const startRow = currentRow;
    const employeeMinutes = employeeRows.reduce(
      (total, row) => total + getShiftDurationMinutes(getExcelShiftStartEndMinutes(row.request)),
      0,
    );

    for (let lane = 0; lane < laneCount; lane += 1) {
      const rowNumber = startRow + lane;
      const isFirstLane = lane === 0;
      const laneEdge = getExcelLaneEdge(lane, laneCount);
      rowHeights.set(rowNumber, 30);
      addCell(rowNumber, 1, isFirstLane ? rowIndex + 1 : "", getExcelBodyLaneStyleIndex(6, laneEdge), isFirstLane ? "n" : "inlineStr");
      addCell(rowNumber, 2, isFirstLane ? employee?.name ?? "対象従業員なし" : "", getExcelBodyLaneStyleIndex(7, laneEdge));
      addCell(
        rowNumber,
        workColumn,
        isFirstLane && employeeMinutes > 0 ? formatExcelWorkHours(employeeMinutes) : "",
        getExcelBodyLaneStyleIndex(10, laneEdge),
        isFirstLane && employeeMinutes > 0 ? "n" : "inlineStr",
      );
      addCell(rowNumber, noteColumn, "", getExcelBodyLaneStyleIndex(11, laneEdge));
      for (let slot = 0; slot < slotCount; slot += 1) {
        const minute = start + slot * excelTimelineSlotMinutes;
        addCell(rowNumber, timelineStartColumn + slot, "", getExcelTimelineGridStyleIndex(minute, laneEdge));
      }
    }

    laneRows.forEach((laneRow) => {
      const range = getExcelShiftStartEndMinutes(laneRow.request);
      const blockStart = Math.max(start, range.start);
      const blockEnd = Math.min(end, range.end);
      if (blockEnd <= blockStart) return;

      const startColumn = timelineStartColumn + Math.floor((blockStart - start) / excelTimelineSlotMinutes);
      const endColumn = timelineStartColumn + Math.max(0, Math.ceil((blockEnd - start) / excelTimelineSlotMinutes) - 1);
      const rowNumber = startRow + laneRow.lane;
      const positionName = resolvePositionName(laneRow.request);
      const timeRange = getEffectiveShiftTimeRange(laneRow.request);
      const blockText = `${timeRange.startTime}-${timeRange.endTime}\n${positionName}`;
      for (let column = startColumn; column <= endColumn; column += 1) {
        const minute = start + (column - timelineStartColumn) * excelTimelineSlotMinutes;
        const isStartColumn = column === startColumn;
        const blockStyle = getShiftExportXlsxStyleIndex(positionName, getExcelTimelineLineKind(minute), getExcelLaneEdge(laneRow.lane, laneCount));

        addCell(rowNumber, column, isStartColumn ? blockText : "", blockStyle);
      }
    });

    currentRow += laneCount;
  });

  const sheetRows = Array.from(cellsByRow.entries())
    .sort(([a], [b]) => a - b)
    .map(([row, cells]) => {
      const height = rowHeights.get(row);
      const heightAttributes = height ? ` ht="${height}" customHeight="1"` : "";
      const sortedCells = cells.sort((a, b) => getCellColumnIndex(a.ref) - getCellColumnIndex(b.ref));
      return `<row r="${row}"${heightAttributes}>${sortedCells.map(createXlsxCellXml).join("")}</row>`;
    })
    .join("");
  const columnXml = [
    '<col min="1" max="1" width="5.2" customWidth="1"/>',
    '<col min="2" max="2" width="15" customWidth="1"/>',
    `<col min="${timelineStartColumn}" max="${workColumn - 1}" width="1.04" customWidth="1"/>`,
    `<col min="${workColumn}" max="${workColumn}" width="8.5" customWidth="1"/>`,
    `<col min="${noteColumn}" max="${noteColumn}" width="12.5" customWidth="1"/>`,
  ].join("");
  const mergeXml = merges.length > 0
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${getColumnName(maxColumn)}${Math.max(4, currentRow - 1)}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnXml}</cols>
  <sheetData>${sheetRows}</sheetData>
  ${mergeXml}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function buildXlsxStylesXml() {
  const shiftFills = shiftExportColors
    .map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color.fill.slice(1).toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`)
    .join("");
  const bodyLaneXfs = [
    { fontId: 0, fillId: 0, borderIds: [6, 7, 8], alignment: `<alignment horizontal="center" vertical="center"/>` },
    { fontId: 0, fillId: 4, borderIds: [6, 7, 8], alignment: `<alignment vertical="center"/>` },
    { fontId: 2, fillId: 3, borderIds: [6, 7, 8], alignment: `<alignment horizontal="centerContinuous" vertical="center"/>` },
    { fontId: 0, fillId: 0, borderIds: [6, 7, 8], alignment: "" },
  ]
    .map((style) => style.borderIds
      .map((borderId) => `<xf numFmtId="0" fontId="${style.fontId}" fillId="${style.fillId}" borderId="${borderId}" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">${style.alignment}</xf>`)
      .join(""))
    .join("");
  const timelineLaneXfs = [9, 10, 11, 12, 13, 14, 15, 16, 17]
    .map((borderId) => `<xf numFmtId="0" fontId="0" fillId="0" borderId="${borderId}" xfId="0" applyBorder="1"/>`)
    .join("");
  const shiftLaneXfs = shiftExportColors
    .map((_, index) => [9, 10, 11, 12, 13, 14, 15, 16, 17]
      .map((borderId) => `<xf numFmtId="0" fontId="3" fillId="${6 + index}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center" wrapText="1"/></xf>`)
      .join(""))
    .join("");
  const cellXfCount = 14 + shiftExportColors.length * 3 + 12 + 9 + shiftExportColors.length * 9;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Yu Gothic"/></font>
    <font><b/><sz val="20"/><name val="Yu Gothic"/></font>
    <font><b/><sz val="11"/><name val="Yu Gothic"/></font>
    <font><b/><sz val="8"/><name val="Yu Gothic"/></font>
  </fonts>
  <fills count="${6 + shiftExportColors.length}">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF99"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
    ${shiftFills}
  </fills>
  <borders count="18">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF444444"/></left><right style="thin"><color rgb="FF444444"/></right><top style="thin"><color rgb="FF444444"/></top><bottom style="thin"><color rgb="FF444444"/></bottom><diagonal/></border>
    <border><left style="medium"><color rgb="FF111111"/></left><right/><top style="thin"><color rgb="FF777777"/></top><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border>
    <border><left style="dotted"><color rgb="FF111111"/></left><right/><top style="thin"><color rgb="FF777777"/></top><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FF666666"/></left><right style="thin"><color rgb="FF666666"/></right><top style="thin"><color rgb="FF666666"/></top><bottom style="thin"><color rgb="FF666666"/></bottom><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FF444444"/></top><bottom style="thin"><color rgb="FF444444"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FF444444"/></left><right style="thin"><color rgb="FF444444"/></right><top style="thin"><color rgb="FF444444"/></top><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF444444"/></left><right style="thin"><color rgb="FF444444"/></right><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF444444"/></left><right style="thin"><color rgb="FF444444"/></right><top/><bottom style="thin"><color rgb="FF444444"/></bottom><diagonal/></border>
    <border><left style="medium"><color rgb="FF111111"/></left><right/><top style="thin"><color rgb="FF777777"/></top><bottom/><diagonal/></border>
    <border><left style="medium"><color rgb="FF111111"/></left><right/><top/><bottom/><diagonal/></border>
    <border><left style="medium"><color rgb="FF111111"/></left><right/><top/><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border>
    <border><left style="dotted"><color rgb="FF111111"/></left><right/><top style="thin"><color rgb="FF777777"/></top><bottom/><diagonal/></border>
    <border><left style="dotted"><color rgb="FF111111"/></left><right/><top/><bottom/><diagonal/></border>
    <border><left style="dotted"><color rgb="FF111111"/></left><right/><top/><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FF444444"/></top><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FF444444"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${cellXfCount}">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="3" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="5" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="5" xfId="0" applyBorder="1"/>
    ${shiftExportColors.map((_, index) => [
      `<xf numFmtId="0" fontId="3" fillId="${6 + index}" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center" wrapText="1"/></xf>`,
      `<xf numFmtId="0" fontId="3" fillId="${6 + index}" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center" wrapText="1"/></xf>`,
      `<xf numFmtId="0" fontId="3" fillId="${6 + index}" borderId="5" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="center" wrapText="1"/></xf>`,
    ].join("")).join("")}
    ${bodyLaneXfs}
    ${timelineLaneXfs}
    ${shiftLaneXfs}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function createZip(files: { name: string; content: string }[]) {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const writeUint16 = (view: DataView, byteOffset: number, value: number) => view.setUint16(byteOffset, value, true);
  const writeUint32 = (view: DataView, byteOffset: number, value: number) => view.setUint32(byteOffset, value >>> 0, true);

  files.forEach((file) => {
    const nameBytes = stringToBytes(file.name);
    const contentBytes = stringToBytes(file.content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  });

  const centralOffset = offset;
  const centralBytes = concatBytes(centralDirectory);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralBytes.length);
  writeUint32(endView, 16, centralOffset);
  writeUint16(endView, 20, 0);

  return concatBytes([...chunks, centralBytes, endHeader]);
}

function getExcelSheetName(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`;
}

function buildDailyRosterXlsxBytes(data: DailyShiftExportData) {
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${escapeXml(getExcelSheetName(data.date))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", content: buildXlsxStylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildDailyRosterSheetXml(data) },
  ]);
}

export function downloadDailyRosterExcel(data: DailyShiftExportData) {
  const bytes = buildDailyRosterXlsxBytes(data);

  downloadBlob(
    `${getFilenameBase(data)}.xlsx`,
    new Blob([bytes.buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

export function downloadRosterPng(data: MonthlyShiftExportData) {
  const canvas = drawEmployeeRoster(data);

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(`${getFilenameBase(data)}.png`, blob);
  }, "image/png");
}

export function downloadRosterPdf(data: MonthlyShiftExportData) {
  const pdfBytes = canvasesToPdfBytes([drawManagerRoster(data)]);

  downloadBlob(`${getFilenameBase(data)}.pdf`, new Blob([pdfBytes.buffer], { type: "application/pdf" }));
}

export function downloadDailyRosterPdf(data: DailyShiftExportData) {
  const pdfBytes = canvasesToPdfBytes([drawDailyRoster(data)]);

  downloadBlob(`${getFilenameBase(data)}.pdf`, new Blob([pdfBytes.buffer], { type: "application/pdf" }));
}

export function downloadMonthDailyRosterPdf(data: MonthlyShiftExportData) {
  const canvases = getMonthDays(data.month).map((day) =>
    drawDailyRoster({
      organizationName: data.organizationName,
      department: data.department,
      date: day.date,
      employees: data.employees,
      rows: data.rows.filter((row) => row.request.date === day.date),
    }),
  );
  const pdfBytes = canvasesToPdfBytes(canvases);

  downloadBlob(`shift-${data.month}-daily.pdf`, new Blob([pdfBytes.buffer], { type: "application/pdf" }));
}
