import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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

  return value.map((request) => {
    const candidate = request as Record<string, unknown>;

    return {
      date: String(candidate.date ?? "").trim(),
      startTime: String(candidate.startTime ?? "").trim(),
      endTime: String(candidate.endTime ?? "").trim(),
      positionId: String(candidate.positionId ?? "").trim(),
    };
  });
}

function normalizeRequestId(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeShiftRequestStatus(status: unknown) {
  return status === "承認済" ? "承認済" : "希望済";
}

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
    const requestedSlotIds = new Set(
      existingRequestsSnapshot.docs.map((requestSnapshot) =>
        String(requestSnapshot.data().slotId ?? ""),
      ),
    );
    const requestedGeneratedKeys = new Set(
      existingRequestsSnapshot.docs.map((requestSnapshot) => {
        const data = requestSnapshot.data();
        return [
          String(data.date ?? ""),
          String(data.startTime ?? ""),
          String(data.endTime ?? ""),
          String(data.positionId ?? ""),
        ].join("|");
      }),
    );
    const slotSnapshots = await Promise.all(
      slotIds.map((slotId) => organizationRef.collection("shiftSlots").doc(slotId).get()),
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

    if (slots.some((slot) => requestedSlotIds.has(slot.id))) {
      return NextResponse.json(
        { error: "既に希望済みのシフトが含まれています。" },
        { status: 409 },
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
        organizationRef.collection("positions").doc(generatedRequest.positionId).get(),
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

    if (
      generatedRequestsWithPositions.some((generatedRequest) =>
        requestedGeneratedKeys.has(generatedRequest.duplicateKey),
      )
    ) {
      return NextResponse.json(
        { error: "既に希望済みのシフトが含まれています。" },
        { status: 409 },
      );
    }
    const employee = employeeSnapshot.data() ?? {};
    const employmentType = String(employee.employmentType ?? "");
    const payrollSnapshot = createPayrollSnapshot(
      employmentType,
      payrollSettings,
    );
    const submittedDate = getTodayString();
    const batch = adminDb.batch();

    slots.forEach((slot) => {
      const requestRef = organizationRef.collection("shiftRequests").doc();

      batch.set(requestRef, {
        employeeId: employeeAuth.employeeId,
        employeeName: String(employee.name ?? ""),
        employeeEmail: String(employee.email ?? ""),
        employmentType,
        payrollSnapshot,
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        positionId: slot.positionId,
        positionName: slot.positionName,
        status: "希望済",
        submittedDate,
        submittedAt: Timestamp.now(),
      });
      batch.update(organizationRef.collection("shiftSlots").doc(slot.id), {
        requestCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    });

    generatedRequestsWithPositions.forEach((generatedRequest) => {
      const requestRef = organizationRef.collection("shiftRequests").doc();

      batch.set(requestRef, {
        employeeId: employeeAuth.employeeId,
        employeeName: String(employee.name ?? ""),
        employeeEmail: String(employee.email ?? ""),
        employmentType,
        payrollSnapshot,
        slotId: "",
        employeeGenerated: true,
        date: generatedRequest.date,
        startTime: generatedRequest.startTime,
        endTime: generatedRequest.endTime,
        positionId: generatedRequest.positionId,
        positionName: generatedRequest.positionName,
        status: "希望済",
        submittedDate,
        submittedAt: Timestamp.now(),
      });
    });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
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
    const body = (await request.json().catch(() => ({}))) as { requestId?: unknown };
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

    const requestSnapshot = await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        { error: "シフト希望が見つかりません。" },
        { status: 404 },
      );
    }

    const requestData = requestSnapshot.data() ?? {};
    const requestEmployeeId = String(requestData.employeeId ?? "");

    if (requestEmployeeId !== employeeAuth.employeeId) {
      return NextResponse.json(
        { error: "このシフト希望は撤回できません。" },
        { status: 403 },
      );
    }

    if (normalizeShiftRequestStatus(requestData.status) === "承認済") {
      return NextResponse.json(
        { error: "承認済みのシフトは撤回できません。" },
        { status: 409 },
      );
    }

    const slotId = String(requestData.slotId ?? "");
    const slotRef = slotId
      ? organizationRef.collection("shiftSlots").doc(slotId)
      : null;
    const slotSnapshot = slotRef ? await slotRef.get() : null;
    const batch = adminDb.batch();

    batch.delete(requestRef);

    if (slotRef && slotSnapshot?.exists) {
      batch.update(slotRef, {
        requestCount: FieldValue.increment(-1),
        updatedAt: Timestamp.now(),
      });
    }

    await batch.commit();


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
