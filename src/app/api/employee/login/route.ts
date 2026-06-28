import { NextResponse } from "next/server";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  createEmployeeSessionToken,
  employeeSessionCookieName,
  getEmployeeSessionCookieOptions,
} from "@/lib/employeeAuthServer";
import type { EmployeeProfile } from "@/lib/people";

export const runtime = "nodejs";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeWorkScore(score: unknown) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) return 0;

  return Math.max(-5, Math.min(5, Math.round(numericScore)));
}

async function loadOrganizationProfile(
  adminDb: Firestore,
  organizationId: string,
) {
  const snapshot = await adminDb.collection("organizations").doc(organizationId).get();
  const data = snapshot.data() ?? {};

  return {
    id: organizationId,
    name: String(data.name ?? organizationId),
    department: String(data.department ?? ""),
  };
}

function toEmployeeProfile(
  snapshot: QueryDocumentSnapshot,
  organizationId: string,
  organization: { name: string; department: string },
): EmployeeProfile {
  const data = snapshot.data() ?? {};
  const employeeId = String(data.employeeId ?? data.id ?? snapshot.id);
  const firstName = String(data.firstName ?? "");
  const lastName = String(data.lastName ?? "");
  const name = String(data.name ?? `${lastName}${firstName}`);

  return {
    id: employeeId,
    organizationId,
    employeeId,
    firstName,
    lastName,
    name,
    email: String(data.email ?? ""),
    employmentType: String(data.employmentType ?? ""),
    organization: String(data.organization ?? organization.name),
    department: String(data.department ?? organization.department),
    workScore: normalizeWorkScore(data.workScore),
  };
}

export async function POST(request: Request) {
  try {
    const adminDb = await getAdminDb();
    const body = (await request.json()) as {
      organizationId?: unknown;
      email?: unknown;
    };
    const organizationId = String(body.organizationId ?? "").trim();
    const email = normalizeEmail(String(body.email ?? ""));

    if (!/^\d{6}$/.test(organizationId) || !email) {
      return NextResponse.json(
        { error: "組織IDとメールアドレスを確認してください。" },
        { status: 400 },
      );
    }

    const employeesSnapshot = await adminDb
      .collection("organizations")
      .doc(organizationId)
      .collection("employees")
      .get();
    const employeeSnapshot = employeesSnapshot.docs.find((employeeDocument) => {
      return normalizeEmail(String(employeeDocument.data().email ?? "")) === email;
    });

    if (!employeeSnapshot) {
      return NextResponse.json(
        { error: "入力された組織IDとメールアドレスに一致する従業員が見つかりません。" },
        { status: 404 },
      );
    }

    const organization = await loadOrganizationProfile(adminDb, organizationId);
    const employee = toEmployeeProfile(employeeSnapshot, organizationId, organization);
    const response = NextResponse.json({ employee });

    response.cookies.set(
      employeeSessionCookieName,
      createEmployeeSessionToken(organizationId, employee.employeeId),
      getEmployeeSessionCookieOptions(),
    );

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "従業員情報の確認に失敗しました。" },
      { status: 500 },
    );
  }
}
