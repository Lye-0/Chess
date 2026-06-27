import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { signInWithCustomToken } from "firebase/auth";
import { auth, db } from "./firebase";
import { defaultOrganizationId } from "./people";

function getShiftRequestsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftRequests");
}

function getShiftSlotsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftSlots");
}

function getShiftSlotDocument(slotId: string, organizationId = defaultOrganizationId) {
  return doc(getShiftSlotsCollection(organizationId), slotId);
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
  positionId: string;
  positionName: string;
  status: ShiftRequestStatus;
  submittedDate: string;
};

export type ShiftRequestInput = Omit<
  ShiftRequest,
  "id" | "status" | "submittedDate"
>;

export type EmployeeGeneratedShiftRequestInput = Omit<
  ShiftRequestInput,
  "slotId"
>;

type ShiftDateTime = {
  date: string;
  startTime: string;
};

type EmployeeRequestAuthContext = {
  organizationId: string;
  employeeId: string;
  employeeEmail: string;
};

type EmployeeLoginResponse = {
  customToken?: string;
  error?: string;
};

function getEmployeeUid(organizationId: string, employeeId: string) {
  return `employee:${organizationId}:${employeeId}`;
}

function isEmployeeAuthUser(
  context: EmployeeRequestAuthContext,
  claims: Record<string, unknown>,
) {
  return (
    auth.currentUser?.uid === getEmployeeUid(context.organizationId, context.employeeId) &&
    claims.role === "employee" &&
    claims.organizationId === context.organizationId &&
    claims.employeeId === context.employeeId
  );
}

async function refreshEmployeeAuth(context: EmployeeRequestAuthContext) {
  const response = await fetch("/api/employee/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId: context.organizationId,
      email: context.employeeEmail,
    }),
  });
  const result = (await response.json().catch(() => null)) as
    | EmployeeLoginResponse
    | null;

  if (!response.ok || !result?.customToken) {
    throw new Error(result?.error ?? "従業員ログインを確認できませんでした。");
  }

  await signInWithCustomToken(auth, result.customToken);
}

async function getEmployeeRequestToken(context: EmployeeRequestAuthContext) {
  if (auth.currentUser) {
    const tokenResult = await auth.currentUser.getIdTokenResult(true);

    if (isEmployeeAuthUser(context, tokenResult.claims)) {
      return tokenResult.token;
    }
  }

  await refreshEmployeeAuth(context);

  const tokenResult = await auth.currentUser?.getIdTokenResult(true);
  if (!tokenResult || !isEmployeeAuthUser(context, tokenResult.claims)) {
    throw new Error("従業員ログインを確認できませんでした。");
  }

  return tokenResult.token;
}
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
    positionId: String(data.positionId ?? ""),
    positionName: String(data.positionName ?? ""),
    status: normalizeShiftRequestStatus(data.status),
    submittedDate: String(data.submittedDate ?? ""),
  };
}

export function getShiftRequestPositionLabel(
  request: Pick<ShiftRequest, "positionName">,
) {
  return request.positionName || "ポジション未設定";
}

export function subscribeShiftRequests(
  onNext: (requests: ShiftRequest[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  const cache = new Map<string, ShiftRequest>();

  return onSnapshot(
    getShiftRequestsCollection(organizationId),
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          cache.delete(change.doc.id);
        } else {
          cache.set(change.doc.id, toShiftRequest(change.doc));
        }
      }

      onNext(snapshot.docs.map((document) => cache.get(document.id)!));
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
  const cache = new Map<string, ShiftRequest>();

  return onSnapshot(
    query(
      getShiftRequestsCollection(organizationId),
      where("employeeId", "==", employeeId),
    ),
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          cache.delete(change.doc.id);
        } else {
          cache.set(change.doc.id, toShiftRequest(change.doc));
        }
      }

      onNext(snapshot.docs.map((document) => cache.get(document.id)!));
    },
    onError,
  );
}

export async function createShiftRequests(
  inputs: ShiftRequestInput[],
  organizationId = defaultOrganizationId,
) {
  if (inputs.length === 0) return;

  const firstInput = inputs[0];
  const token = await getEmployeeRequestToken({
    organizationId,
    employeeId: firstInput.employeeId,
    employeeEmail: firstInput.employeeEmail,
  });

  const response = await fetch("/api/employee/shift-requests", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId,
      slotIds: inputs.map((input) => input.slotId),
    }),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "希望シフトの送信に失敗しました。");
  }
}
export async function createEmployeeGeneratedShiftRequests(
  inputs: EmployeeGeneratedShiftRequestInput[],
  organizationId = defaultOrganizationId,
) {
  if (inputs.length === 0) return;

  const firstInput = inputs[0];
  const token = await getEmployeeRequestToken({
    organizationId,
    employeeId: firstInput.employeeId,
    employeeEmail: firstInput.employeeEmail,
  });

  const response = await fetch("/api/employee/shift-requests", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId,
      employeeGeneratedRequests: inputs.map((input) => ({
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        positionId: input.positionId,
      })),
    }),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "希望シフトの送信に失敗しました。");
  }
}

export async function withdrawEmployeeShiftRequest(
  requestId: string,
  context: EmployeeRequestAuthContext,
) {
  const token = await getEmployeeRequestToken(context);

  const response = await fetch("/api/employee/shift-requests", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "シフト希望の撤回に失敗しました。");
  }
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

  const requestData = requestSnapshot.data();
  const slotId = String(requestData.slotId ?? "");

  if (!slotId) {
    if (!isShiftStartInFuture({
      date: String(requestData.date ?? ""),
      startTime: String(requestData.startTime ?? ""),
    })) {
      throw new Error("Shift request is not in the future.");
    }

    const slotRef = doc(getShiftSlotsCollection(organizationId));
    const batch = writeBatch(db);

    batch.set(slotRef, {
      date: String(requestData.date ?? ""),
      startTime: String(requestData.startTime ?? ""),
      endTime: String(requestData.endTime ?? ""),
      positionId: String(requestData.positionId ?? ""),
      positionName: String(requestData.positionName ?? ""),
      capacity: 1,
      requestCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(requestRef, {
      slotId: slotRef.id,
      status: "承認済",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return;
  }

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

export async function countApprovedShiftRequestsBySlot(
  slotId: string,
  organizationId = defaultOrganizationId,
) {
  const snapshot = await getDocs(getShiftRequestsCollection(organizationId));

  return snapshot.docs.filter((requestSnapshot) => {
    const data = requestSnapshot.data();

    return (
      data.slotId === slotId &&
      normalizeShiftRequestStatus(data.status) === "承認済"
    );
  }).length;
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
