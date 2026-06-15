import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultOrganizationId } from "./people";

function getShiftRequestsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftRequests");
}

export type ShiftRequestStatus = "希望済";

export type ShiftRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employmentType: string;
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftRequestStatus;
  submittedDate: string;
};

export type ShiftRequestInput = Omit<
  ShiftRequest,
  "id" | "status" | "submittedDate"
>;

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function toShiftRequest(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ShiftRequest {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    employeeId: String(data.employeeId ?? ""),
    employeeName: String(data.employeeName ?? ""),
    employeeEmail: String(data.employeeEmail ?? ""),
    employmentType: String(data.employmentType ?? ""),
    slotId: String(data.slotId ?? ""),
    date: String(data.date ?? ""),
    startTime: String(data.startTime ?? ""),
    endTime: String(data.endTime ?? ""),
    status: "希望済",
    submittedDate: String(data.submittedDate ?? ""),
  };
}

export function subscribeShiftRequests(
  onNext: (requests: ShiftRequest[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getShiftRequestsCollection(organizationId),
    (snapshot) => {
      onNext(snapshot.docs.map(toShiftRequest));
    },
    onError,
  );
}

export function subscribeEmployeeShiftRequests(
  employeeId: string,
  onNext: (requests: ShiftRequest[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return subscribeShiftRequests(
    (requests) => {
      onNext(requests.filter((request) => request.employeeId === employeeId));
    },
    onError,
    organizationId,
  );
}

export async function createShiftRequests(
  inputs: ShiftRequestInput[],
  organizationId = defaultOrganizationId,
) {
  const batch = writeBatch(db);
  const submittedDate = getTodayString();

  inputs.forEach((input) => {
    const requestRef = doc(getShiftRequestsCollection(organizationId));
    batch.set(requestRef, {
      ...input,
      status: "希望済",
      submittedDate,
      submittedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function removeShiftRequestsBySlot(
  slotId: string,
  organizationId = defaultOrganizationId,
) {
  const snapshot = await getDocs(getShiftRequestsCollection(organizationId));
  const batch = writeBatch(db);
  let deleteCount = 0;

  snapshot.docs.forEach((requestSnapshot) => {
    if (requestSnapshot.data().slotId === slotId) {
      batch.delete(
        doc(getShiftRequestsCollection(organizationId), requestSnapshot.id),
      );
      deleteCount += 1;
    }
  });

  if (deleteCount === 0) return;

  await batch.commit();
}
