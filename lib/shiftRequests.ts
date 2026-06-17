import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
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

function getShiftSlotDocument(slotId: string, organizationId = defaultOrganizationId) {
  return doc(db, "organizations", organizationId, "shiftSlots", slotId);
}

export type ShiftRequestStatus = "希望済" | "承認済";

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

type ShiftDateTime = {
  date: string;
  startTime: string;
};

function normalizeShiftRequestStatus(status: unknown): ShiftRequestStatus {
  return status === "承認済" ? "承認済" : "希望済";
}

function normalizeShiftSlotCapacity(capacity: unknown) {
  const normalizedCapacity = Number(capacity ?? 0);

  if (!Number.isFinite(normalizedCapacity) || normalizedCapacity < 1) {
    throw new Error("Shift slot capacity is invalid.");
  }

  return normalizedCapacity;
}

export function isShiftStartInFuture(
  shift: ShiftDateTime,
  now = new Date(),
) {
  const startAt = new Date(`${shift.date}T${shift.startTime}:00`);

  return (
    !Number.isNaN(startAt.getTime()) &&
    startAt.getTime() > now.getTime()
  );
}

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
    status: normalizeShiftRequestStatus(data.status),
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
  if (inputs.length === 0) return;

  const batch = writeBatch(db);
  const submittedDate = getTodayString();
  const now = new Date();

  if (inputs.some((input) => !isShiftStartInFuture(input, now))) {
    throw new Error("Started shift slots cannot be requested.");
  }

  const incomingCountBySlot = inputs.reduce<Record<string, number>>(
    (counts, input) => {
      counts[input.slotId] = (counts[input.slotId] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const currentRequestsSnapshot = await getDocs(
    getShiftRequestsCollection(organizationId),
  );
  const currentCountBySlot = currentRequestsSnapshot.docs.reduce<Record<string, number>>(
    (counts, requestSnapshot) => {
      const slotId = String(requestSnapshot.data().slotId ?? "");
      if (slotId) counts[slotId] = (counts[slotId] ?? 0) + 1;
      return counts;
    },
    {},
  );

  inputs.forEach((input) => {
    const requestRef = doc(getShiftRequestsCollection(organizationId));
    batch.set(requestRef, {
      ...input,
      status: "希望済",
      submittedDate,
      submittedAt: serverTimestamp(),
    });
  });

  Object.entries(incomingCountBySlot).forEach(([slotId, incomingCount]) => {
    batch.update(getShiftSlotDocument(slotId, organizationId), {
      requestCount: (currentCountBySlot[slotId] ?? 0) + incomingCount,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function removeShiftRequest(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) return;

  const slotId = String(requestSnapshot.data().slotId ?? "");
  const batch = writeBatch(db);

  batch.delete(requestRef);

  if (slotId) {
    const slotRef = getShiftSlotDocument(slotId, organizationId);
    const slotSnapshot = await getDoc(slotRef);

    if (slotSnapshot.exists()) {
      const currentRequestsSnapshot = await getDocs(
        getShiftRequestsCollection(organizationId),
      );
      const currentCount = currentRequestsSnapshot.docs.filter(
        (currentRequestSnapshot) =>
          currentRequestSnapshot.data().slotId === slotId,
      ).length;

      batch.update(slotRef, {
        requestCount: Math.max(0, currentCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

export async function approveShiftRequest(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) return;
  if (normalizeShiftRequestStatus(requestSnapshot.data().status) === "承認済") return;

  const slotId = String(requestSnapshot.data().slotId ?? "");
  if (!slotId) throw new Error("Shift request slot is invalid.");

  const slotSnapshot = await getDoc(getShiftSlotDocument(slotId, organizationId));
  if (!slotSnapshot.exists()) throw new Error("Shift slot is not available.");

  const capacity = normalizeShiftSlotCapacity(slotSnapshot.data().capacity);
  const currentRequestsSnapshot = await getDocs(
    getShiftRequestsCollection(organizationId),
  );
  const approvedCount = currentRequestsSnapshot.docs.filter((currentSnapshot) => {
    const data = currentSnapshot.data();
    return (
      currentSnapshot.id !== requestId &&
      data.slotId === slotId &&
      normalizeShiftRequestStatus(data.status) === "承認済"
    );
  }).length;

  if (approvedCount >= capacity) {
    throw new Error("Shift slot approval capacity reached.");
  }

  await updateDoc(requestRef, {
    status: "承認済",
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function approveShiftRequests(
  requestIds: string[],
  organizationId = defaultOrganizationId,
) {
  const uniqueRequestIds = [...new Set(requestIds.map((requestId) => requestId.trim()))]
    .filter(Boolean);

  if (uniqueRequestIds.length === 0) return;

  const requestSnapshots = await Promise.all(
    uniqueRequestIds.map((requestId) =>
      getDoc(doc(getShiftRequestsCollection(organizationId), requestId)),
    ),
  );
  const approvableRequests = requestSnapshots
    .filter((requestSnapshot) => requestSnapshot.exists())
    .filter(
      (requestSnapshot) =>
        normalizeShiftRequestStatus(requestSnapshot.data().status) !== "承認済",
    )
    .map((requestSnapshot) => ({
      id: requestSnapshot.id,
      slotId: String(requestSnapshot.data().slotId ?? ""),
    }))
    .filter((request) => request.slotId);

  if (approvableRequests.length === 0) return;

  const approvableIdsBySlot = approvableRequests.reduce<Record<string, string[]>>(
    (groups, request) => {
      groups[request.slotId] = [...(groups[request.slotId] ?? []), request.id];
      return groups;
    },
    {},
  );
  const currentRequestsSnapshot = await getDocs(
    getShiftRequestsCollection(organizationId),
  );

  await Promise.all(
    Object.entries(approvableIdsBySlot).map(async ([slotId, slotRequestIds]) => {
      const slotSnapshot = await getDoc(getShiftSlotDocument(slotId, organizationId));
      if (!slotSnapshot.exists()) throw new Error("Shift slot is not available.");

      const capacity = normalizeShiftSlotCapacity(slotSnapshot.data().capacity);
      const approvingRequestIds = new Set(slotRequestIds);
      const approvedCount = currentRequestsSnapshot.docs.filter((currentSnapshot) => {
        const data = currentSnapshot.data();
        return (
          !approvingRequestIds.has(currentSnapshot.id) &&
          data.slotId === slotId &&
          normalizeShiftRequestStatus(data.status) === "承認済"
        );
      }).length;

      if (approvedCount + slotRequestIds.length > capacity) {
        throw new Error("Shift slot approval capacity reached.");
      }
    }),
  );

  const batch = writeBatch(db);

  approvableRequests.forEach((request) => {
    batch.update(doc(getShiftRequestsCollection(organizationId), request.id), {
      status: "承認済",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function resetShiftRequestApproval(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  await updateDoc(doc(getShiftRequestsCollection(organizationId), requestId), {
    status: "希望済",
    approvedAt: deleteField(),
    updatedAt: serverTimestamp(),
  });
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
