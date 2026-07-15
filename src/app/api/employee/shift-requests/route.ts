import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";
import {
  createPayrollSnapshot,
  normalizePayrollSettings,
} from "@/lib/payroll";
import { normalizeShiftRequestSettings } from "@/lib/shiftRequestSettings";

export const runtime = "nodejs";

type ShiftSlotData = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
  positionName: string;
};

type EmployeeGeneratedRequestData = {
  date: string;
  startTime: string;
  endTime: string;
  positionId: string;
};

type ShiftRequestCandidate = {
  kind: "slot" | "generated";
  dedupeKey: string;
  requestKeyId: string;
  slot?: ShiftSlotData;
  generated?: EmployeeGeneratedRequestData & { positionName: string };
};

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function isShiftStartInFuture(shift: Pick<ShiftSlotData, "date" | "startTime">, now = new Date()) {
  const startAt = new Date(`${shift.date}T${shift.startTime}:00`);

  return !Number.isNaN(startAt.getTime()) && startAt.getTime() > now.getTime();
}

function normalizeSlotIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((slotId) => String(slotId).trim()).filter(Boolean))];
}

function isValidShiftDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const parsedDate = new Date(`${date}T00:00:00`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() + 1 === month &&
    parsedDate.getDate() === day
  );
}

function isValidShiftTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidShiftTimeRange(startTime: string, endTime: string) {
  return isValidShiftTime(startTime) && isValidShiftTime(endTime) && startTime !== endTime;
}

function normalizeEmployeeGeneratedRequests(value: unknown): EmployeeGeneratedRequestData[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: EmployeeGeneratedRequestData[] = [];

  value.forEach((request) => {
    const candidate = request as Record<string, unknown>;
    const normalizedRequest = {
      date: String(candidate.date ?? "").trim(),
      startTime: String(candidate.startTime ?? "").trim(),
      endTime: String(candidate.endTime ?? "").trim(),
      positionId: String(candidate.positionId ?? "").trim(),
    };
    const duplicateKey = [
      normalizedRequest.date,
      normalizedRequest.startTime,
      normalizedRequest.endTime,
      normalizedRequest.positionId,
    ].join("|");

    if (seen.has(duplicateKey)) return;
    seen.add(duplicateKey);
    normalized.push(normalizedRequest);
  });

  return normalized;
}

function normalizeRequestId(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeShiftRequestStatus(status: unknown) {
  return status === "承認済" ? "承認済" : "希望済";
}

function getRequestDedupeKey(data: Record<string, unknown>) {
  const storedKey = String(data.dedupeKey ?? "").trim();
  if (storedKey) return storedKey;

  const slotId = String(data.slotId ?? "").trim();
  if (slotId) return "slot:" + slotId;

  if (data.employeeGenerated === true) {
    return [
      "generated:",
      String(data.date ?? ""),
      String(data.startTime ?? ""),
      String(data.endTime ?? ""),
      String(data.positionId ?? ""),
    ].join("|");
  }

  return "";
}

function createRequestKeyId(
  organizationId: string,
  employeeId: string,
  dedupeKey: string,
) {
  return createHash("sha256")
    .update([organizationId, employeeId, dedupeKey].join("\u0000"))
    .digest("hex");
}

class ShiftSlotUnavailableError extends Error {}

export async function POST(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const body = (await request.json()) as {
      slotIds?: unknown;
      employeeGeneratedRequests?: unknown;
    };
    const slotIds = normalizeSlotIds(body.slotIds);
    const employeeGeneratedRequests = normalizeEmployeeGeneratedRequests(
      body.employeeGeneratedRequests,
    );

    if (slotIds.length === 0 && employeeGeneratedRequests.length === 0) {
      return NextResponse.json(
        { error: "希望するシフトを選択してください。" },
        { status: 400 },
      );
    }

    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const employeeRef = organizationRef
      .collection("employees")
      .doc(employeeAuth.employeeId);
    const [
      employeeSnapshot,
      payrollSettingsSnapshot,
      shiftRequestSettingsSnapshot,
    ] = await Promise.all([
      employeeRef.get(),
      organizationRef.collection("settings").doc("payroll").get(),
      organizationRef.collection("settings").doc("shiftRequests").get(),
    ]);
    const payrollSettings = normalizePayrollSettings(
      payrollSettingsSnapshot.data(),
    );
    const shiftRequestSettings = normalizeShiftRequestSettings(
      shiftRequestSettingsSnapshot.data(),
    );

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    if (
      employeeGeneratedRequests.length > 0 &&
      !shiftRequestSettings.employeeGeneratedRequestsEnabled
    ) {
      return NextResponse.json(
        { error: "募集枠なしのシフト希望は現在送信できません。" },
        { status: 403 },
      );
    }

    const existingRequestsSnapshot = await organizationRef
      .collection("shiftRequests")
      .where("employeeId", "==", employeeAuth.employeeId)
      .get();
    const existingRequestByDedupeKey = new Map();

    existingRequestsSnapshot.docs.forEach((requestSnapshot) => {
      const dedupeKey = getRequestDedupeKey(
        requestSnapshot.data() as Record<string, unknown>,
      );

      if (dedupeKey && !existingRequestByDedupeKey.has(dedupeKey)) {
        existingRequestByDedupeKey.set(dedupeKey, requestSnapshot);
      }
    });

    const slotSnapshots = await Promise.all(
      slotIds.map((slotId) =>
        organizationRef.collection("shiftSlots").doc(slotId).get(),
      ),
    );
    const now = new Date();
    const slots = slotSnapshots.map<ShiftSlotData>((slotSnapshot) => {
      const data = slotSnapshot.data() ?? {};

      return {
        id: slotSnapshot.id,
        date: String(data.date ?? ""),
        startTime: String(data.startTime ?? ""),
        endTime: String(data.endTime ?? ""),
        positionId: String(data.positionId ?? ""),
        positionName: String(data.positionName ?? ""),
      };
    });

    if (slotSnapshots.some((slotSnapshot) => !slotSnapshot.exists)) {
      return NextResponse.json(
        { error: "選択されたシフト枠が見つかりません。" },
        { status: 404 },
      );
    }

    if (slots.some((slot) => !isShiftStartInFuture(slot, now))) {
      return NextResponse.json(
        { error: "過去または開始済みのシフトには希望を提出できません。" },
        { status: 400 },
      );
    }

    if (
      employeeGeneratedRequests.some(
        (generatedRequest) =>
          !isValidShiftDate(generatedRequest.date) ||
          !isValidShiftTimeRange(
            generatedRequest.startTime,
            generatedRequest.endTime,
          ) ||
          !generatedRequest.positionId,
      )
    ) {
      return NextResponse.json(
        { error: "希望する日付・時間・ポジションを正しく入力してください。" },
        { status: 400 },
      );
    }

    if (
      employeeGeneratedRequests.some(
        (generatedRequest) => !isShiftStartInFuture(generatedRequest, now),
      )
    ) {
      return NextResponse.json(
        { error: "過去または開始済みのシフトには希望を提出できません。" },
        { status: 400 },
      );
    }

    const positionSnapshots = await Promise.all(
      employeeGeneratedRequests.map((generatedRequest) =>
        organizationRef
          .collection("positions")
          .doc(generatedRequest.positionId)
          .get(),
      ),
    );
    const generatedRequestsWithPositions = employeeGeneratedRequests.map(
      (generatedRequest, index) => {
        const positionSnapshot = positionSnapshots[index];
        const positionName = String(positionSnapshot.data()?.name ?? "");

        return {
          ...generatedRequest,
          positionName,
          duplicateKey: [
            generatedRequest.date,
            generatedRequest.startTime,
            generatedRequest.endTime,
            generatedRequest.positionId,
          ].join("|"),
        };
      },
    );

    if (positionSnapshots.some((positionSnapshot) => !positionSnapshot.exists)) {
      return NextResponse.json(
        { error: "選択されたポジションが見つかりません。" },
        { status: 404 },
      );
    }

    const employee = employeeSnapshot.data() ?? {};
    const employmentType = String(employee.employmentType ?? "");
    const payrollSnapshot = createPayrollSnapshot(
      employmentType,
      payrollSettings,
    );
    const submittedDate = getTodayString();
    const submittedAt = Timestamp.now();

    const candidates: ShiftRequestCandidate[] = [
      ...slots.map((slot) => ({
        kind: "slot" as const,
        dedupeKey: "slot:" + slot.id,
        requestKeyId: createRequestKeyId(
          employeeAuth.organizationId,
          employeeAuth.employeeId,
          "slot:" + slot.id,
        ),
        slot,
      })),
      ...generatedRequestsWithPositions.map((generatedRequest) => ({
        kind: "generated" as const,
        dedupeKey: [
          "generated:",
          generatedRequest.date,
          generatedRequest.startTime,
          generatedRequest.endTime,
          generatedRequest.positionId,
        ].join("|"),
        requestKeyId: createRequestKeyId(
          employeeAuth.organizationId,
          employeeAuth.employeeId,
          [
            "generated:",
            generatedRequest.date,
            generatedRequest.startTime,
            generatedRequest.endTime,
            generatedRequest.positionId,
          ].join("|"),
        ),
        generated: generatedRequest,
      })),
    ];

    const result = await adminDb.runTransaction(async (transaction) => {
      const keyStates = new Map();
      const slotStates = new Map();

      // Read every uniqueness key and every affected slot before any write.
      for (const candidate of candidates) {
        const keyRef = organizationRef
          .collection("shiftRequestKeys")
          .doc(candidate.requestKeyId);
        const keySnapshot = await transaction.get(keyRef);
        let requestId = "";
        let requestSnapshot = null;

        if (keySnapshot.exists) {
          requestId = String(keySnapshot.data()?.requestId ?? "");
          if (requestId) {
            requestSnapshot = await transaction.get(
              organizationRef.collection("shiftRequests").doc(requestId),
            );
          }
        } else {
          const legacyRequestSnapshot = existingRequestByDedupeKey.get(
            candidate.dedupeKey,
          );
          if (legacyRequestSnapshot) {
            requestId = legacyRequestSnapshot.id;
            requestSnapshot = await transaction.get(legacyRequestSnapshot.ref);
          }
        }

        keyStates.set(candidate.dedupeKey, {
          keyRef,
          keySnapshot,
          requestId,
          requestSnapshot,
        });
      }

      for (const candidate of candidates) {
        if (candidate.kind !== "slot") continue;
        if (slotStates.has(candidate.slot!.id)) continue;

        const slotRef = organizationRef
          .collection("shiftSlots")
          .doc(candidate.slot!.id);
        const slotSnapshot = await transaction.get(slotRef);

        if (!slotSnapshot.exists) {
          throw new ShiftSlotUnavailableError();
        }

        slotStates.set(candidate.slot!.id, { slotRef, slotSnapshot });
      }

      const requestCountBySlot = new Map<string, number>();
      let createdCount = 0;
      let skippedCount = 0;

      for (const candidate of candidates) {
        const state = keyStates.get(candidate.dedupeKey);

        if (state.keySnapshot.exists && state.requestSnapshot?.exists) {
          skippedCount += 1;
          continue;
        }

        const markerData = {
          employeeId: employeeAuth.employeeId,
          requestId: state.requestId,
          dedupeKey: candidate.dedupeKey,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        };

        if (!state.keySnapshot.exists && state.requestSnapshot?.exists) {
          // Backfill the marker for a request created before this protection.
          transaction.create(state.keyRef, markerData);
          skippedCount += 1;
          continue;
        }

        const requestRef = organizationRef.collection("shiftRequests").doc();
        const commonData = {
          employeeId: employeeAuth.employeeId,
          employeeName: String(employee.name ?? ""),
          employeeEmail: String(employee.email ?? ""),
          employmentType,
          payrollSnapshot,
          status: "希望済",
          submittedDate,
          submittedAt,
          dedupeKey: candidate.dedupeKey,
          dedupeKeyId: candidate.requestKeyId,
        };
        const requestData =
          candidate.kind === "slot"
            ? {
                ...commonData,
                slotId: candidate.slot!.id,
                date: candidate.slot!.date,
                startTime: candidate.slot!.startTime,
                endTime: candidate.slot!.endTime,
                positionId: candidate.slot!.positionId,
                positionName: candidate.slot!.positionName,
              }
            : {
                ...commonData,
                slotId: "",
                employeeGenerated: true,
                date: candidate.generated!.date,
                startTime: candidate.generated!.startTime,
                endTime: candidate.generated!.endTime,
                positionId: candidate.generated!.positionId,
                positionName: candidate.generated!.positionName,
              };

        transaction.create(requestRef, requestData);
        const newMarkerData = {
          ...markerData,
          requestId: requestRef.id,
        };

        if (state.keySnapshot.exists) {
          // Repair a stale marker whose request was already removed.
          transaction.set(state.keyRef, newMarkerData);
        } else {
          transaction.create(state.keyRef, newMarkerData);
        }

        if (candidate.kind === "slot") {
          const slotId = candidate.slot!.id;
          requestCountBySlot.set(
            slotId,
            (requestCountBySlot.get(slotId) ?? 0) + 1,
          );
        }
        createdCount += 1;
      }

      for (const [slotId, createdForSlot] of requestCountBySlot) {
        const slotState = slotStates.get(slotId);
        const storedRequestCount = Number(
          slotState.slotSnapshot.data()?.requestCount ?? 0,
        );
        const requestCount =
          Number.isFinite(storedRequestCount) && storedRequestCount >= 0
            ? storedRequestCount
            : 0;

        transaction.update(slotState.slotRef, {
          requestCount: requestCount + createdForSlot,
          updatedAt: submittedAt,
        });
      }

      return { createdCount, skippedCount };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ShiftSlotUnavailableError) {
      return NextResponse.json(
        { error: "選択されたシフト枠が見つかりません。" },
        { status: 404 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: "希望シフトの送信に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const body = (await request.json().catch(() => ({}))) as {
      requestId?: unknown;
    };
    const requestId = normalizeRequestId(body.requestId);

    if (!requestId) {
      return NextResponse.json(
        { error: "撤回するシフト希望を選択してください。" },
        { status: 400 },
      );
    }

    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const requestRef = organizationRef.collection("shiftRequests").doc(requestId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);

      if (!requestSnapshot.exists) {
        return { found: false, forbidden: false, approved: false };
      }

      const requestData = requestSnapshot.data() ?? {};
      const requestEmployeeId = String(requestData.employeeId ?? "");

      if (requestEmployeeId !== employeeAuth.employeeId) {
        return { found: true, forbidden: true, approved: false };
      }

      if (normalizeShiftRequestStatus(requestData.status) === "承認済") {
        return { found: true, forbidden: false, approved: true };
      }

      const slotId = String(requestData.slotId ?? "");
      const dedupeKeyId = String(requestData.dedupeKeyId ?? "");
      const slotRef = slotId
        ? organizationRef.collection("shiftSlots").doc(slotId)
        : null;
      const keyRef = dedupeKeyId
        ? organizationRef.collection("shiftRequestKeys").doc(dedupeKeyId)
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
        keySnapshot?.exists &&
        String(keySnapshot.data()?.requestId ?? "") === requestId
      ) {
        transaction.delete(keyRef);
      }

      if (slotRef && slotSnapshot?.exists) {
        const storedRequestCount = Number(
          slotSnapshot.data()?.requestCount ?? 0,
        );
        const requestCount =
          Number.isFinite(storedRequestCount) && storedRequestCount > 0
            ? storedRequestCount - 1
            : 0;

        transaction.update(slotRef, {
          requestCount,
          updatedAt: Timestamp.now(),
        });
      }

      return { found: true, forbidden: false, approved: false };
    });

    if (!result.found) {
      return NextResponse.json(
        { error: "シフト希望が見つかりません。" },
        { status: 404 },
      );
    }

    if (result.forbidden) {
      return NextResponse.json(
        { error: "このシフト希望は撤回できません。" },
        { status: 403 },
      );
    }

    if (result.approved) {
      return NextResponse.json(
        { error: "承認済みのシフトは撤回できません。" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { error: "シフト希望の撤回に失敗しました。" },
      { status: 500 },
    );
  }
}
