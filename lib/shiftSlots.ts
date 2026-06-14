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

const organizationId = "nagoya-engineering";
const shiftSlotsCollection = collection(
  db,
  "organizations",
  organizationId,
  "shiftSlots",
);

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
): Unsubscribe {
  return onSnapshot(
    shiftSlotsCollection,
    (snapshot) => {
      onNext(snapshot.docs.map(toShiftSlot));
    },
    onError,
  );
}

export async function createShiftSlot(input: ShiftSlotInput) {
  await addDoc(shiftSlotsCollection, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateShiftSlot(id: string, input: ShiftSlotInput) {
  await updateDoc(doc(shiftSlotsCollection, id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function removeShiftSlot(id: string) {
  await removeShiftRequestsBySlot(id);
  await deleteDoc(doc(shiftSlotsCollection, id));
}
