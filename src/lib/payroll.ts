import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultOrganizationId } from "./people";
import type { ShiftRequest } from "./shiftRequests";

export const employmentTypes = ["正社員", "アルバイト", "契約社員"];

export type PayrollSettings = {
  hourlyRates: Record<string, number>;
  nightStartTime: string;
  nightEndTime: string;
  nightMultiplier: number;
};

export type ShiftPayroll = {
  hourlyRate: number;
  totalMinutes: number;
  regularMinutes: number;
  nightMinutes: number;
  totalPay: number;
  scheduledPay: number;
  calculatedPay: number;
  actualPay: number | null;
  usesActualTime: boolean;
  usesActualPay: boolean;
};

type ShiftPayrollRequest = Pick<
  ShiftRequest,
  "date" | "startTime" | "endTime" | "employmentType"
> &
  Partial<
    Pick<
      ShiftRequest,
      "actualStartTime" | "actualEndTime" | "actualPay" | "actualMemo"
    >
  >;

type ShiftTimeRange = Pick<ShiftRequest, "date" | "startTime" | "endTime">;

type BaseShiftPayroll = Pick<
  ShiftPayroll,
  "hourlyRate" | "totalMinutes" | "regularMinutes" | "nightMinutes" | "totalPay"
>;

export const defaultPayrollSettings: PayrollSettings = {
  hourlyRates: {
    正社員: 1500,
    アルバイト: 1000,
    契約社員: 1200,
  },
  nightStartTime: "22:00",
  nightEndTime: "05:00",
  nightMultiplier: 1.25,
};

function getPayrollSettingsDocument(organizationId = defaultOrganizationId) {
  return doc(db, "organizations", organizationId, "settings", "payroll");
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;

  return hour * 60 + minute;
}

function normalizeActualPay(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getShiftStartEnd(request: ShiftTimeRange) {
  const startAt = new Date(`${request.date}T${request.startTime}:00`);
  const endAt = new Date(`${request.date}T${request.endTime}:00`);

  if (endAt <= startAt) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return { startAt, endAt };
}

function overlapMinutes(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());

  return Math.max(0, Math.round((end - start) / 60000));
}

function buildDateAtMinutes(baseDay: Date, minutes: number) {
  const date = new Date(baseDay);
  date.setHours(0, minutes, 0, 0);
  return date;
}

function getNightMinutes(request: ShiftTimeRange, settings: PayrollSettings) {
  const { startAt, endAt } = getShiftStartEnd(request);
  const nightStartMinutes = parseTimeToMinutes(settings.nightStartTime);
  const nightEndMinutes = parseTimeToMinutes(settings.nightEndTime);

  if (nightStartMinutes === nightEndMinutes) return 0;

  const baseDay = new Date(startAt);
  baseDay.setHours(0, 0, 0, 0);
  let nightMinutes = 0;

  for (let offset = -1; offset <= 1; offset += 1) {
    const nightBaseDay = new Date(baseDay);
    nightBaseDay.setDate(baseDay.getDate() + offset);

    const windowStart = buildDateAtMinutes(nightBaseDay, nightStartMinutes);
    const windowEndBaseDay = new Date(nightBaseDay);
    if (nightEndMinutes <= nightStartMinutes) {
      windowEndBaseDay.setDate(windowEndBaseDay.getDate() + 1);
    }
    const windowEnd = buildDateAtMinutes(windowEndBaseDay, nightEndMinutes);

    nightMinutes += overlapMinutes(startAt, endAt, windowStart, windowEnd);
  }

  return nightMinutes;
}

function hasActualTimeRange(request: ShiftPayrollRequest) {
  const actualStartTime = request.actualStartTime?.trim();
  const actualEndTime = request.actualEndTime?.trim();

  return Boolean(
    actualStartTime &&
      actualEndTime &&
      (actualStartTime !== request.startTime || actualEndTime !== request.endTime),
  );
}

export function hasActualShiftAdjustment(request: ShiftPayrollRequest) {
  return Boolean(
    hasActualTimeRange(request) ||
      normalizeActualPay(request.actualPay) !== null ||
      request.actualMemo?.trim(),
  );
}

export function getEffectiveShiftTimeRange(
  request: ShiftPayrollRequest,
): ShiftTimeRange {
  if (hasActualTimeRange(request)) {
    return {
      date: request.date,
      startTime: request.actualStartTime!.trim(),
      endTime: request.actualEndTime!.trim(),
    };
  }

  return {
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
  };
}

export function calculateShiftWorkMinutes(request: ShiftPayrollRequest) {
  const effectiveTimeRange = getEffectiveShiftTimeRange(request);
  const { startAt, endAt } = getShiftStartEnd(effectiveTimeRange);
  const diff = endAt.getTime() - startAt.getTime();

  if (!Number.isFinite(diff) || diff < 0) return 0;

  return Math.round(diff / 60000);
}

export function calculateScheduledShiftWorkMinutes(request: ShiftPayrollRequest) {
  const { startAt, endAt } = getShiftStartEnd(request);
  const diff = endAt.getTime() - startAt.getTime();

  if (!Number.isFinite(diff) || diff < 0) return 0;

  return Math.round(diff / 60000);
}

function calculateBaseShiftPayroll(
  request: ShiftPayrollRequest,
  settings: PayrollSettings,
): BaseShiftPayroll {
  const totalMinutes = calculateScheduledShiftWorkMinutes(request);
  const nightMinutes = Math.min(totalMinutes, getNightMinutes(request, settings));
  const regularMinutes = totalMinutes - nightMinutes;
  const hourlyRate = settings.hourlyRates[request.employmentType] ?? 0;
  const totalPay = Math.round(
    (regularMinutes / 60) * hourlyRate +
      (nightMinutes / 60) * hourlyRate * settings.nightMultiplier,
  );

  return {
    hourlyRate,
    totalMinutes,
    regularMinutes,
    nightMinutes,
    totalPay,
  };
}

export function calculateScheduledShiftPayroll(
  request: ShiftPayrollRequest,
  settings: PayrollSettings,
): ShiftPayroll {
  const scheduledPayroll = calculateBaseShiftPayroll(request, settings);

  return {
    ...scheduledPayroll,
    scheduledPay: scheduledPayroll.totalPay,
    calculatedPay: scheduledPayroll.totalPay,
    actualPay: null,
    usesActualTime: false,
    usesActualPay: false,
  };
}

export function normalizePayrollSettings(data?: DocumentData): PayrollSettings {
  const hourlyRates = { ...defaultPayrollSettings.hourlyRates };
  const savedRates = data?.hourlyRates;

  if (savedRates && typeof savedRates === "object") {
    Object.entries(savedRates).forEach(([type, value]) => {
      const rate = Number(value);
      hourlyRates[type] = Number.isFinite(rate) && rate >= 0 ? rate : 0;
    });
  }

  const nightMultiplier = Number(data?.nightMultiplier);

  return {
    hourlyRates,
    nightStartTime: String(data?.nightStartTime ?? defaultPayrollSettings.nightStartTime),
    nightEndTime: String(data?.nightEndTime ?? defaultPayrollSettings.nightEndTime),
    nightMultiplier:
      Number.isFinite(nightMultiplier) && nightMultiplier >= 1
        ? nightMultiplier
        : defaultPayrollSettings.nightMultiplier,
  };
}

export function subscribePayrollSettings(
  onNext: (settings: PayrollSettings) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getPayrollSettingsDocument(organizationId),
    (snapshot) => {
      onNext(normalizePayrollSettings(snapshot.data()));
    },
    onError,
  );
}

export async function updatePayrollSettings(
  settings: PayrollSettings,
  organizationId = defaultOrganizationId,
) {
  await setDoc(
    getPayrollSettingsDocument(organizationId),
    {
      ...normalizePayrollSettings(settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function calculateShiftPayroll(
  request: ShiftPayrollRequest,
  settings: PayrollSettings,
): ShiftPayroll {
  const scheduledPayroll = calculateBaseShiftPayroll(request, settings);
  const effectiveTimeRange = getEffectiveShiftTimeRange(request);
  const calculatedPayroll = calculateBaseShiftPayroll(
    { ...request, ...effectiveTimeRange },
    settings,
  );
  const actualPay = normalizeActualPay(request.actualPay);

  return {
    ...calculatedPayroll,
    totalPay: actualPay ?? calculatedPayroll.totalPay,
    scheduledPay: scheduledPayroll.totalPay,
    calculatedPay: calculatedPayroll.totalPay,
    actualPay,
    usesActualTime: hasActualTimeRange(request),
    usesActualPay: actualPay !== null,
  };
}

export function sumShiftPay(
  requests: ShiftPayrollRequest[],
  settings: PayrollSettings,
) {
  return requests.reduce(
    (total, request) => total + calculateShiftPayroll(request, settings).totalPay,
    0,
  );
}

export function formatCurrency(amount: number) {
  return `¥${Math.round(amount).toLocaleString()}`;
}
