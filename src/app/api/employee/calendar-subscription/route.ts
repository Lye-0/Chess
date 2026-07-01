import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createCalendarSubscriptionToken() {
  return randomBytes(32).toString("base64url");
}

function toWebcalUrl(url: string) {
  return url.replace(/^https?:\/\//, "webcal://");
}

export async function POST(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const employeeRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId)
      .collection("employees")
      .doc(employeeAuth.employeeId);
    const employeeSnapshot = await employeeRef.get();

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    const existingToken = String(
      employeeSnapshot.data()?.calendarSubscriptionToken ?? "",
    );
    const token = existingToken || createCalendarSubscriptionToken();

    const subscriptionRef = adminDb
      .collection("employeeCalendarSubscriptions")
      .doc(token);
    const now = FieldValue.serverTimestamp();

    await adminDb.runTransaction(async (transaction) => {
      if (!existingToken) {
        transaction.update(employeeRef, {
          calendarSubscriptionToken: token,
          calendarSubscriptionTokenCreatedAt: now,
          updatedAt: now,
        });
      }

      transaction.set(
        subscriptionRef,
        {
          organizationId: employeeAuth.organizationId,
          employeeId: employeeAuth.employeeId,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );
    });

    const calendarUrl = new URL("/api/employee/calendar.ics", request.url);
    calendarUrl.searchParams.set("token", token);

    return NextResponse.json({
      calendarUrl: calendarUrl.toString(),
      webcalUrl: toWebcalUrl(calendarUrl.toString()),
    });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { error: "カレンダー購読URLの作成に失敗しました。" },
      { status: 500 },
    );
  }
}
