import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  ManagerAuthError,
  verifyManagerRequest,
} from "@/lib/managerAuthServer";

export const runtime = "nodejs";

class OrganizationConflictError extends Error {}

type CreateOrganizationBody = {
  name?: unknown;
  department?: unknown;
};

export async function POST(request: Request) {
  try {
    const manager = await verifyManagerRequest(request);
    let body: CreateOrganizationBody = {};

    try {
      const rawBody: unknown = await request.json();
      if (rawBody && typeof rawBody === "object") {
        body = rawBody as CreateOrganizationBody;
      }
    } catch {
      return NextResponse.json(
        { error: "組織情報の形式を確認してください。" },
        { status: 400 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const department =
      typeof body.department === "string" ? body.department.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "組織名を入力してください。" },
        { status: 400 },
      );
    }

    const adminDb = await getAdminDb();
    const organizationRef = adminDb.collection("organizations").doc();
    const organizationId = organizationRef.id;
    const managerRef = adminDb.collection("managers").doc(manager.uid);
    const membershipRef = managerRef.collection("organizations").doc(organizationId);

    await adminDb.runTransaction(async (transaction) => {
      const organizationSnapshot = await transaction.get(organizationRef);
      const membershipSnapshot = await transaction.get(membershipRef);

      if (organizationSnapshot.exists || membershipSnapshot.exists) {
        throw new OrganizationConflictError("組織IDが重複しました。もう一度お試しください。");
      }

      transaction.set(
        managerRef,
        {
          email: manager.email ?? "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.create(organizationRef, {
        id: organizationId,
        name,
        department,
        createdBy: manager.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(membershipRef, {
        organizationId,
        name,
        department,
        role: "owner",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json(
      {
        organization: {
          id: organizationId,
          name,
          department,
          role: "owner",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ManagerAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (error instanceof OrganizationConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: "組織の登録に失敗しました。" },
      { status: 500 },
    );
  }
}
