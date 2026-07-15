import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  countApprovedShiftRequestsBySlot,
  isShiftStartInFuture,
  removeShiftRequestsBySlot,
} from "./shiftRequests";
import { defaultOrganizationId } from "./people";

function getShiftSlotsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftSlots");
}

export type ShiftSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  positionName: string;
  employeeGenerated: boolean;
  capacity: number;
  requestCount: number;
  approvedCount: number;
};

export type ShiftSlotInput = Omit<ShiftSlot, "id" | "requestCount" | "approvedCount" | "employeeGenerated"> & {
  employeeGenerated?: boolean;
};

const fourDigitDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function getMonthDateRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const format = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

  return {
    startDate: format(start),
    endDate: format(end),
  };
}
export function isFourDigitShiftDate(date: string) {
  if (!fourDigitDatePattern.test(date)) return false;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const parsedDate = new Date(`${date}T00:00:00`);

  return (
    year >= 1 &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() + 1 === month &&
    parsedDate.getDate() === day
  );
}

function isValidShiftTime(time: string) {
  if (!timePattern.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);

  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

export function isValidShiftTimeRange(startTime: string, endTime: string) {
  return (
    isValidShiftTime(startTime) &&
    isValidShiftTime(endTime) &&
    startTime !== endTime
  );
}

export function isOvernightShiftTime(startTime: string, endTime: string) {
  return isValidShiftTimeRange(startTime, endTime) && startTime > endTime;
}

export function formatShiftTimeRange(startTime: string, endTime: string) {
  return isOvernightShiftTime(startTime, endTime)
    ? `${startTime} - 翌日${endTime}`
    : `${startTime} - ${endTime}`;
}

function assertValidShiftSlotInput(input: ShiftSlotInput) {
  if (!isFourDigitShiftDate(input.date)) {
    throw new Error("Shift slot date must use a valid four-digit year.");
  }

  if (!isValidShiftTimeRange(input.startTime, input.endTime)) {
    throw new Error("Shift slot time range must be valid.");
  }

  if (!isShiftStartInFuture(input)) {
    throw new Error("Shift slot start time must be in the future.");
  }
}

function toShiftSlot(snapshot: QueryDocumentSnapshot<DocumentData>): ShiftSlot {
  const data = snapshot.data();
  const requestCount = Number(data.requestCount ?? 0);
  const approvedCount = Number(data.approvedCount ?? 0);

  return {
    id: snapshot.id,
    date: String(data.date ?? ""),
    startTime: String(data.startTime ?? ""),
    endTime: String(data.endTime ?? ""),
    positionId: String(data.positionId ?? ""),
    positionName: String(data.positionName ?? ""),
    employeeGenerated: data.employeeGenerated === true,
    capacity: Number(data.capacity ?? 0),
    requestCount:
      Number.isFinite(requestCount) && requestCount > 0 ? requestCount : 0,
    approvedCount:
      Number.isFinite(approvedCount) && approvedCount > 0 ? approvedCount : 0,
  };
}

export function subscribeShiftSlots(
  onNext: (slots: ShiftSlot[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  const cache = new Map<string, ShiftSlot>();

  return onSnapshot(
    getShiftSlotsCollection(organizationId),
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          cache.delete(change.doc.id);
        } else {
          cache.set(change.doc.id, toShiftSlot(change.doc));
        }
      }

      onNext(snapshot.docs.map((document) => cache.get(document.id)!));
    },
    onError,
  );
}

export function subscribeShiftSlotsByMonth(
  month: string,
  onNext: (slots: ShiftSlot[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  const range = getMonthDateRange(month);
  if (!range) {
    onNext([]);
    return () => {};
  }

  return onSnapshot(
    query(
      getShiftSlotsCollection(organizationId),
      where("date", ">=", range.startDate),
      where("date", "<", range.endDate),
    ),
    (snapshot) => {
      onNext(snapshot.docs.map(toShiftSlot));
    },
    onError,
  );
}
export async function createShiftSlot(
  input: ShiftSlotInput,
  organizationId = defaultOrganizationId,
) {
  assertValidShiftSlotInput(input);

  await addDoc(getShiftSlotsCollection(organizationId), {
    ...input,
    requestCount: 0,
    approvedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateShiftSlot(
  id: string,
  input: ShiftSlotInput,
  organizationId = defaultOrganizationId,
) {
  assertValidShiftSlotInput(input);
  const slotRef = doc(getShiftSlotsCollection(organizationId), id);

  const preflightSlotSnapshot = await getDoc(slotRef);

  if (!preflightSlotSnapshot.exists()) {
    throw new Error("Shift slot is not available.");
  }

  const storedApprovedCount = Number(preflightSlotSnapshot.data().approvedCount);
  const legacyApprovedCount =
    Number.isFinite(storedApprovedCount) && storedApprovedCount >= 0
      ? storedApprovedCount
      : await countApprovedShiftRequestsBySlot(id, organizationId);

  await runTransaction(db, async (transaction) => {
    const slotSnapshot = await transaction.get(slotRef);

    if (!slotSnapshot.exists()) {
      throw new Error("Shift slot is not available.");
    }

    const storedApprovedCount = Number(slotSnapshot.data().approvedCount);
    const approvedCount =
      Number.isFinite(storedApprovedCount) && storedApprovedCount >= 0
        ? storedApprovedCount
        : legacyApprovedCount;

    if (input.capacity < approvedCount) {
      throw new Error("Shift slot capacity cannot be less than approved requests.");
    }

    transaction.update(slotRef, {
      ...input,
      approvedCount,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeShiftSlot(
  id: string,
  organizationId = defaultOrganizationId,
) {
  await removeShiftRequestsBySlot(id, organizationId);
  await deleteDoc(doc(getShiftSlotsCollection(organizationId), id));
}
