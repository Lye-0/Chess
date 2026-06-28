import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";
import { normalizePayrollSettings } from "@/lib/payroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toShiftRequest(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() ?? {};

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
    status: data.status === "承認済" ? "承認済" : "希望済",
    submittedDate: String(data.submittedDate ?? ""),
  };
}

function toShiftSlot(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() ?? {};
  const requestCount = Number(data.requestCount ?? 0);

  return {
    id: snapshot.id,
    date: String(data.date ?? ""),
    startTime: String(data.startTime ?? ""),
    endTime: String(data.endTime ?? ""),
    positionId: String(data.positionId ?? ""),
    positionName: String(data.positionName ?? ""),
    employeeGenerated: data.employeeGenerated === true,
    capacity: Number(data.capacity ?? 0),
    requestCount:
      Number.isFinite(requestCount) && requestCount > 0 ? requestCount : 0,
  };
}

function toPosition(snapshot: QueryDocumentSnapshot, organizationId: string) {
  const data = snapshot.data() ?? {};

  return {
    id: snapshot.id,
    organizationId,
    name: String(data.name ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);

    const [employeeSnapshot, requestsSnapshot, slotsSnapshot, positionsSnapshot, payrollSnapshot] =
      await Promise.all([
        organizationRef.collection("employees").doc(employeeAuth.employeeId).get(),
        organizationRef
          .collection("shiftRequests")
          .where("employeeId", "==", employeeAuth.employeeId)
          .get(),
        organizationRef.collection("shiftSlots").get(),
        organizationRef.collection("positions").get(),
        organizationRef.collection("settings").doc("payroll").get(),
      ]);

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      requests: requestsSnapshot.docs.map(toShiftRequest),
      slots: slotsSnapshot.docs.map(toShiftSlot),
      positions: positionsSnapshot.docs
        .map((positionSnapshot) =>
          toPosition(positionSnapshot, employeeAuth.organizationId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
      payrollSettings: normalizePayrollSettings(payrollSnapshot.data()),
    });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { error: "従業員データの読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
