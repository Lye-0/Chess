import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  ManagerAuthError,
  verifyManagerRequest,
} from "@/lib/managerAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const identifierPattern = /^[A-Za-z0-9_-]{1,64}$/;
const deleteBatchSize = 400;

type DeleteCalendarSubscriptionsBody = {
  organizationId?: unknown;
  employeeId?: unknown;
};

function isValidIdentifier(value: string) {
  return identifierPattern.test(value);
}

export async function DELETE(request: Request) {
  try {
    const manager = await verifyManagerRequest(request);
    let body: DeleteCalendarSubscriptionsBody;

    try {
      const rawBody: unknown = await request.json();
      if (!rawBody || typeof rawBody !== "object") {
        return NextResponse.json(
          { error: "削除対象の形式を確認してください。" },
          { status: 400 },
        );
      }
      body = rawBody as DeleteCalendarSubscriptionsBody;
    } catch {
      return NextResponse.json(
        { error: "削除対象の形式を確認してください。" },
        { status: 400 },
      );
    }

    const organizationId =
      typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const employeeId =
      body.employeeId === undefined
        ? undefined
        : typeof body.employeeId === "string"
          ? body.employeeId.trim()
          : "";

    if (
      !isValidIdentifier(organizationId) ||
      (employeeId !== undefined && !isValidIdentifier(employeeId))
    ) {
      return NextResponse.json(
        { error: "組織IDと従業員IDを確認してください。" },
        { status: 400 },
      );
    }

    const adminDb = await getAdminDb();
    const membershipSnapshot = await adminDb
      .collection("managers")
      .doc(manager.uid)
      .collection("organizations")
      .doc(organizationId)
      .get();

    if (!membershipSnapshot.exists) {
      return NextResponse.json(
        { error: "この組織を操作する権限がありません。" },
        { status: 403 },
      );
    }

    const subscriptionSnapshot = await adminDb
      .collection("employeeCalendarSubscriptions")
      .where("organizationId", "==", organizationId)
      .get();
    const targetDocuments = employeeId
      ? subscriptionSnapshot.docs.filter(
          (documentSnapshot) =>
            String(documentSnapshot.data().employeeId ?? "") === employeeId,
        )
      : subscriptionSnapshot.docs;

    for (let index = 0; index < targetDocuments.length; index += deleteBatchSize) {
      const batch = adminDb.batch();
      targetDocuments
        .slice(index, index + deleteBatchSize)
        .forEach((documentSnapshot) => batch.delete(documentSnapshot.ref));
      await batch.commit();
    }

    return NextResponse.json({ deletedCount: targetDocuments.length });
  } catch (error) {
    if (error instanceof ManagerAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: "カレンダー購読情報の削除に失敗しました。" },
      { status: 500 },
    );
  }
}
