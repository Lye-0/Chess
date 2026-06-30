import type { EmployeeProfile } from "./people";
import {
  calculateShiftPayroll,
  formatCurrency,
  type PayrollSettings,
  type ShiftPayroll,
} from "./payroll";
import { getShiftRequestPositionLabel, type ShiftRequest } from "./shiftRequests";

export type ShiftExportFormat = "ics" | "png" | "pdf" | "csv" | "calendarSubscription";
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

function getShiftStartEndMinutes(request: ShiftRequest) {
  const start = parseTimeToMinutes(request.startTime);
  const end = parseTimeToMinutes(request.endTime);

  return {
    start,
    end: end > start ? end : end + 24 * 60,
  };
}

function assignDailyShiftLanes(rows: MonthlyShiftExportRow[]) {
  const groups = new Map<string, MonthlyShiftExportRow[]>();

  rows
    .slice()
    .sort((a, b) => {
      const aRange = getShiftStartEndMinutes(a.request);
      const bRange = getShiftStartEndMinutes(b.request);

      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      if (aRange.end !== bRange.end) return aRange.end - bRange.end;

      return getShiftRequestPositionLabel(a.request).localeCompare(
        getShiftRequestPositionLabel(b.request),
        "ja",
      );
    })
    .forEach((row) => {
      const positionKey =
        row.request.positionId ||
        getShiftRequestPositionLabel(row.request) ||
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
        ...a.map((row) => getShiftStartEndMinutes(row.request).start),
      );
      const bFirst = Math.min(
        ...b.map((row) => getShiftStartEndMinutes(row.request).start),
      );

      if (aFirst !== bFirst) return aFirst - bFirst;

      return getShiftRequestPositionLabel(a[0].request).localeCompare(
        getShiftRequestPositionLabel(b[0].request),
        "ja",
      );
    })
    .forEach((items) => {
      const laneEndMinutes: number[] = [];

      items.forEach((row) => {
        const range = getShiftStartEndMinutes(row.request);
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
    const aRange = getShiftStartEndMinutes(a.request);
    const bRange = getShiftStartEndMinutes(b.request);

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
  const rows = data.rows;
  const width = 1100;
  const headerHeight = 132;
  const rowHeight = 58;
  const footerHeight = 52;
  const height = headerHeight + Math.max(1, rows.length) * rowHeight + footerHeight;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas is not available.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "middle";
  context.fillStyle = "#111827";
  context.font = "bold 30px Arial, sans-serif";
  context.fillText("月間シフト表", 32, 38);
  context.font = "16px Arial, sans-serif";
  context.fillText(`${data.organizationName}${data.department ? ` ${data.department}` : ""}`, 32, 74);
  context.fillText(formatMonthLabel(data.month), 32, 102);

  const columns = [
    { label: "日付", x: 32 },
    { label: "勤務時間", x: 202 },
    { label: "ポジション", x: 372 },
    { label: "氏名", x: 542 },
    { label: "合計", x: 742 },
    { label: "給与目安", x: 862 },
  ];

  context.fillStyle = "#f3f4f6";
  context.fillRect(24, headerHeight - 38, width - 48, 38);
  context.fillStyle = "#111827";
  context.font = "bold 14px Arial, sans-serif";
  columns.forEach((column) => context.fillText(column.label, column.x + 12, headerHeight - 19));

  if (rows.length === 0) {
    context.fillStyle = "#717182";
    context.font = "16px Arial, sans-serif";
    context.fillText("この月の承認済みシフトはありません", 32, headerHeight + 28);
  } else {
    rows.forEach((row, index) => {
      const y = headerHeight + index * rowHeight;

      context.fillStyle = index % 2 === 0 ? "#ffffff" : "#f8fafc";
      context.fillRect(24, y, width - 48, rowHeight);
      context.fillStyle = "#111827";
      context.font = "14px Arial, sans-serif";
      context.fillText(formatDateLabel(row.request.date), columns[0].x + 12, y + rowHeight / 2);
      context.fillText(`${row.request.startTime} - ${row.request.endTime}`, columns[1].x + 12, y + rowHeight / 2);
      context.fillText(getShiftRequestPositionLabel(row.request), columns[2].x + 12, y + rowHeight / 2);
      context.fillText(row.request.employeeName, columns[3].x + 12, y + rowHeight / 2);
      context.fillText(formatHours(row.payroll.totalMinutes), columns[4].x + 12, y + rowHeight / 2);
      context.fillText(formatCurrency(row.payroll.totalPay), columns[5].x + 12, y + rowHeight / 2);
    });
  }

  context.strokeStyle = "#cbd5e1";
  for (let y = headerHeight - 38; y <= height - footerHeight; y += rowHeight) {
    context.beginPath();
    context.moveTo(24, y);
    context.lineTo(width - 24, y);
    context.stroke();
  }

  context.fillStyle = "#475569";
  context.font = "13px Arial, sans-serif";
  context.fillText(`出力日時: ${new Date().toLocaleString("ja-JP")}`, 32, height - 24);

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

export function downloadIcs(data: MonthlyShiftExportData) {
  const events = data.rows
    .map((row) => {
      const { startAt, endAt } = getShiftStartEnd(row.request);
      const positionName = getShiftRequestPositionLabel(row.request);
      const description = `${formatDateLabel(row.request.date)} ${row.request.startTime}-${row.request.endTime} ${positionName}`;

      return [
        "BEGIN:VEVENT",
        `UID:${row.request.id}@chess-shift`,
        `DTSTAMP:${formatIcsDateTime(new Date())}`,
        `DTSTART:${formatIcsDateTime(startAt)}`,
        `DTEND:${formatIcsDateTime(endAt)}`,
        `SUMMARY:${escapeIcsText(`${row.request.employeeName} ${positionName} シフト`)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chess Shift//Shift Export//JA",
    "CALSCALE:GREGORIAN",
    events,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  downloadTextFile(`${getFilenameBase(data)}.ics`, content, "text/calendar;charset=utf-8");
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
