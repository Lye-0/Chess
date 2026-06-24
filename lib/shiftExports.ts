import type { EmployeeProfile } from "./people";
import {
  calculateShiftPayroll,
  formatCurrency,
  type PayrollSettings,
  type ShiftPayroll,
} from "./payroll";
import type { ShiftRequest } from "./shiftRequests";

export type ShiftExportFormat = "ics" | "png" | "pdf" | "csv";

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

type BuildMonthlyShiftExportDataInput = {
  organizationName: string;
  department?: string;
  month: string;
  employees: EmployeeProfile[];
  requests: ShiftRequest[];
  payrollSettings: PayrollSettings;
  employeeId?: string;
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getCurrentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function parseShiftDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function getShiftStartEnd(request: ShiftRequest) {
  const startAt = parseShiftDateTime(request.date, request.startTime);
  const endAt = parseShiftDateTime(request.date, request.endTime);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return { startAt, endAt };
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${year}年${Number(monthNumber)}月`;
}

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);

  return `${parsedDate.getMonth() + 1}/${parsedDate.getDate()} (${weekdays[parsedDate.getDay()]})`;
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

function getFilenameBase(data: MonthlyShiftExportData) {
  return `shift-${data.month}`;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function fillWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
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

  lines.slice(0, maxLines).forEach((currentLine, index) => {
    context.fillText(currentLine, x, y + index * lineHeight);
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
    { label: "勤務時間", x: 222 },
    { label: "氏名", x: 412 },
    { label: "合計", x: 662 },
    { label: "給与目安", x: 802 },
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
      context.fillText(row.request.employeeName, columns[2].x + 12, y + rowHeight / 2);
      context.fillText(formatHours(row.payroll.totalMinutes), columns[3].x + 12, y + rowHeight / 2);
      context.fillText(formatCurrency(row.payroll.totalPay), columns[4].x + 12, y + rowHeight / 2);
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
  const rowHeight = 58;
  const footerHeight = 52;
  const indexWidth = 46;
  const nameWidth = 176;
  const dayWidth = 66;
  const totalWidth = 88;
  const payWidth = 108;
  const width = indexWidth + nameWidth + days.length * dayWidth + totalWidth + payWidth;
  const height = headerHeight + Math.max(1, data.employees.length) * rowHeight + footerHeight;
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
  const rowsByEmployee = data.rows.reduce<Record<string, MonthlyShiftExportRow[]>>(
    (groups, row) => {
      groups[row.request.employeeId] = [...(groups[row.request.employeeId] ?? []), row];
      return groups;
    },
    {},
  );
  const displayEmployees = data.employees.length > 0 ? data.employees : [null];

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

  displayEmployees.forEach((employee, rowIndex) => {
    const y = headerHeight + rowIndex * rowHeight;
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
    context.font = "bold 14px Arial, sans-serif";
    fillWrappedText(context, employee?.name ?? "対象従業員なし", indexWidth + 12, y + 22, nameWidth - 20, 18, 2);

    days.forEach((day, dayIndex) => {
      const x = indexWidth + nameWidth + dayIndex * dayWidth;
      const dayRows = employeeRows.filter((row) => row.request.date === day.date);

      if (dayRows.length === 0) return;
      context.fillStyle = "#fce7f3";
      context.fillRect(x + 2, y + 8, dayWidth - 4, rowHeight - 16);
      context.fillStyle = "#111827";
      context.font = "11px Arial, sans-serif";
      dayRows.slice(0, 2).forEach((row, index) => {
        context.fillText(`${row.request.startTime}-${row.request.endTime}`, x + 5, y + 22 + index * 16);
      });
      if (dayRows.length > 2) context.fillText(`+${dayRows.length - 2}`, x + 5, y + 52);
    });

    context.fillStyle = "#fef08a";
    context.fillRect(totalX, y, totalWidth, rowHeight);
    context.fillStyle = "#fef3c7";
    context.fillRect(totalX + totalWidth, y, payWidth, rowHeight);
    context.fillStyle = "#111827";
    context.font = "bold 13px Arial, sans-serif";
    context.fillText(formatHours(totalMinutes), totalX + 16, y + rowHeight / 2);
    context.fillText(formatCurrency(totalPay), totalX + totalWidth + 12, y + rowHeight / 2);
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
  for (let y = tableTop; y <= bottom; y += rowHeight) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

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

function buildPdfFromJpeg(imageBytes: Uint8Array, imageWidth: number, imageHeight: number) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;
  const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const contentStream = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ`;
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

  pushText("%PDF-1.4\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  pushText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  pushBytes(imageBytes);
  pushText("\nendstream\nendobj\n");
  addObject(5, `<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}\nendstream`);

  const xrefOffset = length;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    pushText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdfBytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    pdfBytes.set(chunk, offset);
    offset += chunk.length;
  });

  return pdfBytes;
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

export function downloadIcs(data: MonthlyShiftExportData) {
  const events = data.rows
    .map((row) => {
      const { startAt, endAt } = getShiftStartEnd(row.request);
      const description = `${formatDateLabel(row.request.date)} ${row.request.startTime}-${row.request.endTime}`;

      return [
        "BEGIN:VEVENT",
        `UID:${row.request.id}@chess-shift`,
        `DTSTAMP:${formatIcsDateTime(new Date())}`,
        `DTSTART:${formatIcsDateTime(startAt)}`,
        `DTEND:${formatIcsDateTime(endAt)}`,
        `SUMMARY:${escapeIcsText(`${row.request.employeeName} シフト`)}`,
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
  const headers = ["日付", "曜日", "開始", "終了", "従業員ID", "氏名", "雇用形態", "勤務時間", "給与目安"];
  const rows = data.rows.map((row) => {
    const parsedDate = new Date(`${row.request.date}T00:00:00`);

    return [
      row.request.date,
      weekdays[parsedDate.getDay()],
      row.request.startTime,
      row.request.endTime,
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

export function downloadRosterPng(data: MonthlyShiftExportData) {
  const canvas = drawEmployeeRoster(data);

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(`${getFilenameBase(data)}.png`, blob);
  }, "image/png");
}

export function downloadRosterPdf(data: MonthlyShiftExportData) {
  const canvas = drawManagerRoster(data);
  const imageBytes = canvasToJpegBytes(canvas);
  const pdfBytes = buildPdfFromJpeg(imageBytes, canvas.width, canvas.height);

  downloadBlob(`${getFilenameBase(data)}.pdf`, new Blob([pdfBytes.buffer], { type: "application/pdf" }));
}
