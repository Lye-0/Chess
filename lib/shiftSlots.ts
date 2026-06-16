import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { removeShiftRequestsBySlot } from "./shiftRequests";
import { defaultOrganizationId } from "./people";

function getShiftSlotsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftSlots");
}

export type ShiftSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
};

export type ShiftSlotInput = Omit<ShiftSlot, "id">;

const fourDigitDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

function assertValidShiftSlotInput(input: ShiftSlotInput) {
  if (!isFourDigitShiftDate(input.date)) {
    throw new Error("Shift slot date must use a valid four-digit year.");
  }
}

function toShiftSlot(snapshot: QueryDocumentSnapshot<DocumentData>): ShiftSlot {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    date: String(data.date ?? ""),
    startTime: String(data.startTime ?? ""),
    endTime: String(data.endTime ?? ""),
    capacity: Number(data.capacity ?? 0),
  };
}

export function subscribeShiftSlots(
  onNext: (slots: ShiftSlot[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getShiftSlotsCollection(organizationId),
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

  await updateDoc(doc(getShiftSlotsCollection(organizationId), id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function removeShiftSlot(
  id: string,
  organizationId = defaultOrganizationId,
) {
  await removeShiftRequestsBySlot(id, organizationId);
  await deleteDoc(doc(getShiftSlotsCollection(organizationId), id));
}
