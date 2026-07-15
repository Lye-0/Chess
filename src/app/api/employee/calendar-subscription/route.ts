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
    const subscriptions = adminDb.collection("employeeCalendarSubscriptions");
    const existingSubscriptionRef = existingToken
      ? subscriptions.doc(existingToken)
      : null;
    const existingSubscriptionSnapshot = existingSubscriptionRef
      ? await existingSubscriptionRef.get()
      : null;
    const existingSubscriptionData = existingSubscriptionSnapshot?.data() ?? {};
    const canReuseExistingToken =
      Boolean(existingToken) &&
      existingSubscriptionSnapshot?.exists === true &&
      String(existingSubscriptionData.organizationId ?? "") ===
        employeeAuth.organizationId &&
      String(existingSubscriptionData.employeeId ?? "") ===
        employeeAuth.employeeId &&
      String(existingSubscriptionData.authVersion ?? "") ===
        employeeAuth.authVersion;
    const token = canReuseExistingToken
      ? existingToken
      : createCalendarSubscriptionToken();
    const subscriptionRef = subscriptions.doc(token);
    const now = FieldValue.serverTimestamp();

    await adminDb.runTransaction(async (transaction) => {
      const currentEmployeeSnapshot = await transaction.get(employeeRef);
      const currentAuthVersion = String(
        currentEmployeeSnapshot.data()?.authVersion ?? "",
      );

      if (
        !currentEmployeeSnapshot.exists ||
        currentAuthVersion !== employeeAuth.authVersion
      ) {
        throw new EmployeeAuthError("従業員ログインの有効性を確認できませんでした。");
      }

      if (existingSubscriptionRef && existingToken && existingToken !== token) {
        transaction.delete(existingSubscriptionRef);
      }

      transaction.set(
        employeeRef,
        {
          calendarSubscriptionToken: token,
          calendarSubscriptionTokenCreatedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      transaction.set(
        subscriptionRef,
        {
          organizationId: employeeAuth.organizationId,
          employeeId: employeeAuth.employeeId,
          authVersion: employeeAuth.authVersion,
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
