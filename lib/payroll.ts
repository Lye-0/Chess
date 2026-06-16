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

export const employmentTypes = ["正社員", "パート", "アルバイト", "契約社員"];

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
};

export const defaultPayrollSettings: PayrollSettings = {
  hourlyRates: employmentTypes.reduce<Record<string, number>>((rates, type) => {
    rates[type] = 0;
    return rates;
  }, {}),
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

function getShiftStartEnd(request: ShiftRequest) {
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

function getNightMinutes(request: ShiftRequest, settings: PayrollSettings) {
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
  request: ShiftRequest,
  settings: PayrollSettings,
): ShiftPayroll {
  const { startAt, endAt } = getShiftStartEnd(request);
  const totalMinutes = Math.max(
    0,
    Math.round((endAt.getTime() - startAt.getTime()) / 60000),
  );
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

export function sumShiftPay(requests: ShiftRequest[], settings: PayrollSettings) {
  return requests.reduce(
    (total, request) => total + calculateShiftPayroll(request, settings).totalPay,
    0,
  );
}

export function formatCurrency(amount: number) {
  return `¥${Math.round(amount).toLocaleString()}`;
}
