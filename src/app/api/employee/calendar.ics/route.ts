import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildShiftRequestsIcsContent } from "@/lib/shiftExports";
import type { ShiftRequest } from "@/lib/shiftRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeActualPay(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function toShiftRequest(snapshot: QueryDocumentSnapshot): ShiftRequest {
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

function getCalendarName(employeeName: string) {
  return employeeName ? `Chess シフト（${employeeName}）` : "Chess シフト";
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  if (token.length < 32) {
    return NextResponse.json(
      { error: "カレンダー購読URLを確認できませんでした。" },
      { status: 401 },
    );
  }

  try {
    const adminDb = await getAdminDb();
    const employeesSnapshot = await adminDb
      .collectionGroup("employees")
      .where("calendarSubscriptionToken", "==", token)
      .limit(1)
      .get();
    const employeeSnapshot = employeesSnapshot.docs[0];
    const organizationRef = employeeSnapshot?.ref.parent.parent;

    if (!employeeSnapshot || !organizationRef) {
      return NextResponse.json(
        { error: "カレンダー購読URLを確認できませんでした。" },
        { status: 404 },
      );
    }

    const employeeData = employeeSnapshot.data() ?? {};
    const employeeId = String(
      employeeData.employeeId ?? employeeData.id ?? employeeSnapshot.id,
    );
    const employeeName = String(employeeData.name ?? "");
    const requestsSnapshot = await organizationRef
      .collection("shiftRequests")
      .where("employeeId", "==", employeeId)
      .where("status", "==", "承認済")
      .get();
    const requests = requestsSnapshot.docs
      .map(toShiftRequest)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.endTime.localeCompare(b.endTime);
      });
    const content = buildShiftRequestsIcsContent(
      requests,
      getCalendarName(employeeName),
    );

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="chess-shift.ics"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "カレンダーの読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
