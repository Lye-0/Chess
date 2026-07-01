import { NextResponse } from "next/server";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";
import { normalizePayrollSettings } from "@/lib/payroll";
import { normalizeShiftRequestSettings } from "@/lib/shiftRequestSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeMonth(value: string | null) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function normalizeYear(value: string | null) {
  return value && /^\d{4}$/.test(value) ? value : null;
}

function normalizeActualPay(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

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
    actualStartTime: String(data.actualStartTime ?? ""),
    actualEndTime: String(data.actualEndTime ?? ""),
    actualPay: normalizeActualPay(data.actualPay),
    actualMemo: String(data.actualMemo ?? ""),
    actualUpdatedAt: String(data.actualUpdatedAt ?? ""),
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
    const searchParams = new URL(request.url).searchParams;
    const requestedMonth = normalizeMonth(searchParams.get("month"));
    const requestedYear = normalizeYear(searchParams.get("year"));
    const requestedRangeStart = requestedMonth
      ? `${requestedMonth}-01`
      : requestedYear
        ? `${requestedYear}-01-01`
        : null;
    const requestedRangeEnd = requestedMonth
      ? `${requestedMonth}-31`
      : requestedYear
        ? `${requestedYear}-12-31`
        : null;
    const adminDb = await getAdminDb();
    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const requestsQuery: Query = organizationRef
      .collection("shiftRequests")
      .where("employeeId", "==", employeeAuth.employeeId);
    const slotsQuery: Query = requestedRangeStart && requestedRangeEnd
      ? organizationRef
          .collection("shiftSlots")
          .where("date", ">=", requestedRangeStart)
          .where("date", "<=", requestedRangeEnd)
      : organizationRef.collection("shiftSlots");

    const [
      employeeSnapshot,
      requestsSnapshot,
      slotsSnapshot,
      positionsSnapshot,
      payrollSnapshot,
      shiftRequestSettingsSnapshot,
    ] = await Promise.all([
      organizationRef.collection("employees").doc(employeeAuth.employeeId).get(),
      requestsQuery.get(),
      slotsQuery.get(),
      organizationRef.collection("positions").get(),
      organizationRef.collection("settings").doc("payroll").get(),
      organizationRef.collection("settings").doc("shiftRequests").get(),
    ]);

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      requests: requestsSnapshot.docs
        .map(toShiftRequest)
        .filter((shiftRequest) => shiftRequest.employeeId === employeeAuth.employeeId)
        .filter(
          (shiftRequest) =>
            !requestedRangeStart ||
            !requestedRangeEnd ||
            (shiftRequest.date >= requestedRangeStart &&
              shiftRequest.date <= requestedRangeEnd),
        ),
      slots: slotsSnapshot.docs.map(toShiftSlot),
      positions: positionsSnapshot.docs
        .map((positionSnapshot) =>
          toPosition(positionSnapshot, employeeAuth.organizationId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
      payrollSettings: normalizePayrollSettings(payrollSnapshot.data()),
      shiftRequestSettings: normalizeShiftRequestSettings(
        shiftRequestSettingsSnapshot.data(),
      ),
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
