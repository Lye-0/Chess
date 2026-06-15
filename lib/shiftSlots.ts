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
