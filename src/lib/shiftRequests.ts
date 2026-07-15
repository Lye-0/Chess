import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultOrganizationId } from "./people";
import {
  normalizePayrollSnapshot,
  type EmployeePayrollSummary,
  type PayrollSnapshot,
} from "./payroll";

function getShiftRequestsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftRequests");
}

function getShiftSlotsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftSlots");
}

function getShiftSlotDocument(slotId: string, organizationId = defaultOrganizationId) {
  return doc(getShiftSlotsCollection(organizationId), slotId);
}

function getShiftRequestKeyDocument(
  keyId: string,
  organizationId = defaultOrganizationId,
) {
  return doc(
    collection(db, "organizations", organizationId, "shiftRequestKeys"),
    keyId,
  );
}

function getStoredCounter(
  data: DocumentData,
  field: string,
  fallback: number,
) {
  const value = Number(data[field]);

  return Number.isFinite(value) && value >= 0 ? value : fallback;
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
  employeeGenerated: boolean;
  status: ShiftRequestStatus;
  submittedDate: string;
  actualStartTime: string;
  actualEndTime: string;
  actualPay: number | null;
  actualMemo: string;
  actualUpdatedAt: string;
  payrollSnapshot?: PayrollSnapshot;
  employeePayroll?: EmployeePayrollSummary;
};

export type ShiftRequestInput = Omit<
  ShiftRequest,
  | "id"
  | "status"
  | "submittedDate"
  | "employeeGenerated"
  | "actualStartTime"
  | "actualEndTime"
  | "actualPay"
  | "actualMemo"
  | "actualUpdatedAt"
  | "payrollSnapshot"
  | "employeePayroll"
>;

export type EmployeeGeneratedShiftRequestInput = Omit<
  ShiftRequestInput,
  "slotId"
>;

type ShiftDateTime = {
  date: string;
  startTime: string;
};

type ShiftTimeRange = ShiftDateTime & {
  endTime: string;
};

type EmployeeRequestAuthContext = {
  organizationId: string;
  employeeId: string;
  employeeEmail: string;
};

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
function normalizeShiftRequestStatus(status: unknown): ShiftRequestStatus {
  return status === "承認済" ? "承認済" : "希望済";
}

function normalizeActualPay(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeShiftSlotCapacity(capacity: unknown) {
  const normalizedCapacity = Number(capacity ?? 0);

  if (!Number.isFinite(normalizedCapacity) || normalizedCapacity < 1) {
    throw new Error("Shift slot capacity is invalid.");
  }

  return normalizedCapacity;
}

function parseTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
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

function getShiftEndAt(shift: ShiftTimeRange) {
  const endAt = new Date(`${shift.date}T${shift.endTime}:00`);

  if (parseTimeToMinutes(shift.endTime) <= parseTimeToMinutes(shift.startTime)) {
    endAt.setDate(endAt.getDate() + 1);
  }

  return endAt;
}

function isShiftEnded(shift: ShiftTimeRange, now = new Date()) {
  const endAt = getShiftEndAt(shift);

  return !Number.isNaN(endAt.getTime()) && endAt <= now;
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
    employeeGenerated: data.employeeGenerated === true,
    status: normalizeShiftRequestStatus(data.status),
    submittedDate: String(data.submittedDate ?? ""),
    actualStartTime: String(data.actualStartTime ?? ""),
    actualEndTime: String(data.actualEndTime ?? ""),
    actualPay: normalizeActualPay(data.actualPay),
    actualMemo: String(data.actualMemo ?? ""),
    actualUpdatedAt: String(data.actualUpdatedAt ?? ""),
    payrollSnapshot: normalizePayrollSnapshot(data.payrollSnapshot) ?? undefined,
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

export function subscribeShiftRequestsByMonth(
  month: string,
  onNext: (requests: ShiftRequest[]) => void,
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
      getShiftRequestsCollection(organizationId),
      where("date", ">=", range.startDate),
      where("date", "<", range.endDate),
    ),
    (snapshot) => {
      onNext(snapshot.docs.map(toShiftRequest));
    },
    onError,
  );
}

export function subscribeShiftRequestsByEmployeeAndMonth(
  employeeId: string,
  month: string,
  onNext: (requests: ShiftRequest[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  const range = getMonthDateRange(month);
  if (!employeeId || !range) {
    onNext([]);
    return () => {};
  }

  return onSnapshot(
    query(
      getShiftRequestsCollection(organizationId),
      where("employeeId", "==", employeeId),
      where("date", ">=", range.startDate),
      where("date", "<", range.endDate),
    ),
    (snapshot) => {
      onNext(snapshot.docs.map(toShiftRequest));
    },
    onError,
  );
}
export async function createShiftRequests(
  inputs: ShiftRequestInput[],
  organizationId = defaultOrganizationId,
) {
  if (inputs.length === 0) return;


  const response = await fetch("/api/employee/shift-requests", {
    method: "POST",
    headers: {
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


  const response = await fetch("/api/employee/shift-requests", {
    method: "POST",
    headers: {
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
  _context: EmployeeRequestAuthContext,
) {
  void _context;

  const response = await fetch("/api/employee/shift-requests", {
    method: "DELETE",
    headers: {
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
  const preflightSnapshot = await getDoc(requestRef);

  if (!preflightSnapshot.exists()) return;

  const preflightData = preflightSnapshot.data();
  const preflightSlotId = String(preflightData.slotId ?? "");
  const legacyApprovedCount =
    preflightSlotId &&
    normalizeShiftRequestStatus(preflightData.status) === "承認済"
      ? await countApprovedShiftRequestsBySlot(
          preflightSlotId,
          organizationId,
        )
      : 0;

  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) return;

    const requestData = requestSnapshot.data();
    const slotId = String(requestData.slotId ?? "");
    const isApproved =
      normalizeShiftRequestStatus(requestData.status) === "承認済";
    const dedupeKeyId = String(requestData.dedupeKeyId ?? "");
    const slotRef = slotId
      ? getShiftSlotDocument(slotId, organizationId)
      : null;
    const keyRef = dedupeKeyId
      ? getShiftRequestKeyDocument(dedupeKeyId, organizationId)
      : null;
    const slotSnapshot = slotRef
      ? await transaction.get(slotRef)
      : null;
    const keySnapshot = keyRef
      ? await transaction.get(keyRef)
      : null;

    transaction.delete(requestRef);

    if (
      keyRef &&
      keySnapshot?.exists() &&
      String(keySnapshot.data()?.requestId ?? "") === requestId
    ) {
      transaction.delete(keyRef);
    }

    if (slotRef && slotSnapshot?.exists()) {
      const slotData = slotSnapshot.data() ?? {};
      const requestCount = Math.max(
        0,
        Number(slotData.requestCount ?? 0) - 1,
      );
      const approvedCount = getStoredCounter(
        slotData,
        "approvedCount",
        legacyApprovedCount,
      );
      const update: DocumentData = {
        requestCount,
        updatedAt: serverTimestamp(),
      };

      if (isApproved) {
        update.approvedCount = Math.max(0, approvedCount - 1);
      }

      transaction.update(slotRef, update);
    }
  });
}

export async function approveShiftRequest(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const preflightSnapshot = await getDoc(requestRef);

  if (!preflightSnapshot.exists()) return;

  const preflightData = preflightSnapshot.data();
  const preflightSlotId = String(preflightData.slotId ?? "");
  const legacyApprovedCount = preflightSlotId
    ? await countApprovedShiftRequestsBySlot(preflightSlotId, organizationId)
    : 0;

  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) return;

    const requestData = requestSnapshot.data();
    if (normalizeShiftRequestStatus(requestData.status) === "承認済") return;

    const slotId = String(requestData.slotId ?? "");

    if (!slotId) {
      const requestShift = {
        date: String(requestData.date ?? ""),
        startTime: String(requestData.startTime ?? ""),
        endTime: String(requestData.endTime ?? ""),
      };

      if (isShiftEnded(requestShift)) {
        throw new Error("Shift request has already ended.");
      }

      const slotRef = doc(getShiftSlotsCollection(organizationId));

      transaction.set(slotRef, {
        date: requestShift.date,
        startTime: requestShift.startTime,
        endTime: requestShift.endTime,
        positionId: String(requestData.positionId ?? ""),
        positionName: String(requestData.positionName ?? ""),
        employeeGenerated: true,
        capacity: 1,
        requestCount: 1,
        approvedCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(requestRef, {
        slotId: slotRef.id,
        employeeGenerated: true,
        status: "承認済",
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const slotRef = getShiftSlotDocument(slotId, organizationId);
    const slotSnapshot = await transaction.get(slotRef);
    if (!slotSnapshot.exists()) {
      throw new Error("Shift slot is not available.");
    }

    const capacity = normalizeShiftSlotCapacity(slotSnapshot.data()?.capacity);
    const approvedCount = getStoredCounter(
      slotSnapshot.data() ?? {},
      "approvedCount",
      legacyApprovedCount,
    );

    if (approvedCount >= capacity) {
      throw new Error("Shift slot approval capacity reached.");
    }

    transaction.update(requestRef, {
      status: "承認済",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(slotRef, {
      approvedCount: approvedCount + 1,
      updatedAt: serverTimestamp(),
    });
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
  const legacyApprovedCounts = Object.fromEntries(
    await Promise.all(
      Object.keys(approvableIdsBySlot).map(async (slotId) => [
        slotId,
        await countApprovedShiftRequestsBySlot(slotId, organizationId),
      ]),
    ),
  ) as Record<string, number>;

  await runTransaction(db, async (transaction) => {
    const slotSnapshots = new Map<string, DocumentSnapshot<DocumentData>>();
    for (const slotId of Object.keys(approvableIdsBySlot)) {
      const slotSnapshot = await transaction.get(
        getShiftSlotDocument(slotId, organizationId),
      );
      if (!slotSnapshot.exists()) {
        throw new Error("Shift slot is not available.");
      }
      slotSnapshots.set(slotId, slotSnapshot);
    }

    const currentRequestSnapshots = new Map<
      string,
      DocumentSnapshot<DocumentData>
    >();
    for (const requestId of uniqueRequestIds) {
      currentRequestSnapshots.set(
        requestId,
        await transaction.get(
          doc(getShiftRequestsCollection(organizationId), requestId),
        ),
      );
    }

    const approvingIdsBySlot: Record<string, string[]> = {};

    for (const [slotId, slotRequestIds] of Object.entries(approvableIdsBySlot)) {
      const pendingIds = slotRequestIds.filter((requestId) => {
        const requestSnapshot = currentRequestSnapshots.get(requestId);
        return (
          requestSnapshot?.exists() &&
          normalizeShiftRequestStatus(requestSnapshot.data().status) !== "承認済" &&
          String(requestSnapshot.data().slotId ?? "") === slotId
        );
      });

      if (pendingIds.length === 0) continue;

      const slotSnapshot = slotSnapshots.get(slotId)!;
      const approvedCount = getStoredCounter(
        slotSnapshot.data() ?? {},
        "approvedCount",
        legacyApprovedCounts[slotId] ?? 0,
      );
      const capacity = normalizeShiftSlotCapacity(slotSnapshot.data()?.capacity);

      if (approvedCount + pendingIds.length > capacity) {
        throw new Error("Shift slot approval capacity reached.");
      }

      approvingIdsBySlot[slotId] = pendingIds;
    }

    for (const requestIdsForSlot of Object.values(approvingIdsBySlot)) {
      requestIdsForSlot.forEach((requestId) => {
        transaction.update(
          doc(getShiftRequestsCollection(organizationId), requestId),
          {
            status: "承認済",
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        );
      });
    }

    for (const [slotId, requestIdsForSlot] of Object.entries(approvingIdsBySlot)) {
      const slotSnapshot = slotSnapshots.get(slotId)!;
      const approvedCount = getStoredCounter(
        slotSnapshot.data() ?? {},
        "approvedCount",
        legacyApprovedCounts[slotId] ?? 0,
      );

      transaction.update(getShiftSlotDocument(slotId, organizationId), {
        approvedCount: approvedCount + requestIdsForSlot.length,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export async function resetShiftRequestApproval(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const preflightSnapshot = await getDoc(requestRef);

  if (!preflightSnapshot.exists()) return;

  const preflightData = preflightSnapshot.data();
  const preflightSlotId = String(preflightData.slotId ?? "");
  const legacyApprovedCount = preflightSlotId
    ? await countApprovedShiftRequestsBySlot(preflightSlotId, organizationId)
    : 0;

  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) return;
    if (normalizeShiftRequestStatus(requestSnapshot.data().status) !== "承認済") {
      return;
    }

    const slotId = String(requestSnapshot.data().slotId ?? "");
    const slotRef = slotId
      ? getShiftSlotDocument(slotId, organizationId)
      : null;
    const slotSnapshot = slotRef
      ? await transaction.get(slotRef)
      : null;

    transaction.update(requestRef, {
      status: "希望済",
      approvedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });

    if (slotRef && slotSnapshot?.exists()) {
      const approvedCount = getStoredCounter(
        slotSnapshot.data() ?? {},
        "approvedCount",
        legacyApprovedCount,
      );
      transaction.update(slotRef, {
        approvedCount: Math.max(0, approvedCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export type ShiftRequestActualInput = {
  actualStartTime: string;
  actualEndTime: string;
  actualPay: number | null;
  actualMemo: string;
};

function normalizeActualTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : "";
}

export async function updateShiftRequestActuals(
  requestId: string,
  actuals: ShiftRequestActualInput,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) {
    throw new Error("Shift request not found.");
  }

  if (normalizeShiftRequestStatus(requestSnapshot.data().status) !== "承認済") {
    throw new Error("Only approved shift requests can be adjusted.");
  }

  const actualStartTime = normalizeActualTime(actuals.actualStartTime);
  const actualEndTime = normalizeActualTime(actuals.actualEndTime);

  if (!actualStartTime || !actualEndTime) {
    throw new Error("Actual shift time is invalid.");
  }

  const requestData = requestSnapshot.data();
  const isSameAsScheduledTime =
    actualStartTime === String(requestData.startTime ?? "") &&
    actualEndTime === String(requestData.endTime ?? "");

  await updateDoc(requestRef, {
    actualStartTime: isSameAsScheduledTime ? "" : actualStartTime,
    actualEndTime: isSameAsScheduledTime ? "" : actualEndTime,
    actualPay: normalizeActualPay(actuals.actualPay),
    actualMemo: actuals.actualMemo.trim(),
    actualUpdatedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

export async function clearShiftRequestActuals(
  requestId: string,
  organizationId = defaultOrganizationId,
) {
  const requestRef = doc(getShiftRequestsCollection(organizationId), requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) {
    throw new Error("Shift request not found.");
  }

  if (normalizeShiftRequestStatus(requestSnapshot.data().status) !== "承認済") {
    throw new Error("Only approved shift requests can be adjusted.");
  }

  await updateDoc(requestRef, {
    actualStartTime: "",
    actualEndTime: "",
    actualPay: null,
    actualMemo: "",
    actualUpdatedAt: "",
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
  const requestCollection = getShiftRequestsCollection(organizationId);
  const preflightSnapshot = await getDocs(requestCollection);
  const matchingRequests = preflightSnapshot.docs.filter(
    (requestSnapshot) => String(requestSnapshot.data().slotId ?? "") === slotId,
  );

  if (matchingRequests.length === 0) return;

  const legacyApprovedCount = matchingRequests.filter(
    (requestSnapshot) =>
      normalizeShiftRequestStatus(requestSnapshot.data().status) === "承認済",
  ).length;

  await runTransaction(db, async (transaction) => {
    const slotRef = getShiftSlotDocument(slotId, organizationId);
    const slotSnapshot = await transaction.get(slotRef);
    const requestsToDelete: Array<{
      requestRef: ReturnType<typeof doc>;
      keyRef: ReturnType<typeof doc> | null;
      keySnapshot: DocumentSnapshot<DocumentData> | null;
      isApproved: boolean;
    }> = [];

    for (const preflightRequest of matchingRequests) {
      const requestRef = doc(requestCollection, preflightRequest.id);
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists()) continue;

      const requestData = requestSnapshot.data();
      if (String(requestData.slotId ?? "") !== slotId) continue;

      const dedupeKeyId = String(requestData.dedupeKeyId ?? "");
      const keyRef = dedupeKeyId
        ? getShiftRequestKeyDocument(dedupeKeyId, organizationId)
        : null;
      const keySnapshot = keyRef
        ? await transaction.get(keyRef)
        : null;

      requestsToDelete.push({
        requestRef,
        keyRef,
        keySnapshot,
        isApproved:
          normalizeShiftRequestStatus(requestData.status) === "承認済",
      });
    }

    if (requestsToDelete.length === 0) return;

    requestsToDelete.forEach(({ requestRef, keyRef, keySnapshot }) => {
      transaction.delete(requestRef);

      if (
        keyRef &&
        keySnapshot?.exists() &&
        String(keySnapshot.data()?.requestId ?? "") === requestRef.id
      ) {
        transaction.delete(keyRef);
      }
    });

    if (slotSnapshot.exists()) {
      const slotData = slotSnapshot.data();
      const requestCount = Math.max(
        0,
        Number(slotData.requestCount ?? 0) - requestsToDelete.length,
      );
      const approvedCount = getStoredCounter(
        slotData,
        "approvedCount",
        legacyApprovedCount,
      );
      const approvedDeleteCount = requestsToDelete.filter(
        (request) => request.isApproved,
      ).length;

      transaction.update(slotRef, {
        requestCount,
        approvedCount: Math.max(0, approvedCount - approvedDeleteCount),
        updatedAt: serverTimestamp(),
      });
    }
  });
}
