import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyEmployeeRequest } from "@/lib/employeeAuthServer";

export const runtime = "nodejs";

type ShiftSlotData = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function isShiftStartInFuture(shift: ShiftSlotData, now = new Date()) {
  const startAt = new Date(`${shift.date}T${shift.startTime}:00`);

  return !Number.isNaN(startAt.getTime()) && startAt.getTime() > now.getTime();
}

function normalizeSlotIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((slotId) => String(slotId).trim()).filter(Boolean))];
}

export async function POST(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const body = (await request.json()) as { slotIds?: unknown };
    const slotIds = normalizeSlotIds(body.slotIds);

    if (slotIds.length === 0) {
      return NextResponse.json(
        { error: "希望するシフト枠を選択してください。" },
        { status: 400 },
      );
    }

    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const employeeRef = organizationRef
      .collection("employees")
      .doc(employeeAuth.employeeId);
    const employeeSnapshot = await employeeRef.get();

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
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

    const employee = employeeSnapshot.data() ?? {};
    const submittedDate = getTodayString();
    const batch = adminDb.batch();

    slots.forEach((slot) => {
      const requestRef = organizationRef.collection("shiftRequests").doc();

      batch.set(requestRef, {
        employeeId: employeeAuth.employeeId,
        employeeName: String(employee.name ?? ""),
        employeeEmail: String(employee.email ?? ""),
        employmentType: String(employee.employmentType ?? ""),
        slotId: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: "希望済",
        submittedDate,
        submittedAt: Timestamp.now(),
      });
      batch.update(organizationRef.collection("shiftSlots").doc(slot.id), {
        requestCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "希望シフトの送信に失敗しました。" },
      { status: 500 },
    );
  }
}
