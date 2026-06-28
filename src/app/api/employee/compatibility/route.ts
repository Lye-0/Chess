import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";
import { normalizeWorkScore } from "@/lib/people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompatibilityScores = Record<string, number>;

function normalizeScore(score: unknown) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) return 0;

  return Math.max(-5, Math.min(5, Math.round(numericScore)));
}

function toCompatibilityScores(data: Record<string, unknown> | undefined) {
  const rawScores = data?.scores;
  if (!rawScores || typeof rawScores !== "object" || Array.isArray(rawScores)) {
    return {};
  }

  return Object.entries(rawScores).reduce<CompatibilityScores>(
    (scores, [employeeId, score]) => {
      scores[employeeId] = normalizeScore(score);
      return scores;
    },
    {},
  );
}

function toEmployeeProfile(
  snapshot: QueryDocumentSnapshot,
  organizationId: string,
  organization: { name: string; department: string },
) {
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

async function loadOrganizationProfile(
  organizationRef: FirebaseFirestore.DocumentReference,
  organizationId: string,
) {
  const snapshot = await organizationRef.get();
  const data = snapshot.data() ?? {};

  return {
    id: organizationId,
    name: String(data.name ?? organizationId),
    department: String(data.department ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const [organization, employeeSnapshot, employeesSnapshot, scoresSnapshot] =
      await Promise.all([
        loadOrganizationProfile(organizationRef, employeeAuth.organizationId),
        organizationRef.collection("employees").doc(employeeAuth.employeeId).get(),
        organizationRef.collection("employees").get(),
        organizationRef.collection("compatibilities").doc(employeeAuth.employeeId).get(),
      ]);

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      employees: employeesSnapshot.docs
        .map((employeeSnapshot) =>
          toEmployeeProfile(employeeSnapshot, employeeAuth.organizationId, organization),
        )
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId)),
      scores: toCompatibilityScores(scoresSnapshot.data()),
    });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { error: "働きやすさ設定の読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const body = (await request.json().catch(() => ({}))) as { scores?: unknown };
    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const [employeeSnapshot, employeesSnapshot] = await Promise.all([
      organizationRef.collection("employees").doc(employeeAuth.employeeId).get(),
      organizationRef.collection("employees").get(),
    ]);

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        { error: "従業員情報を確認できませんでした。" },
        { status: 403 },
      );
    }

    const validEmployeeIds = new Set(
      employeesSnapshot.docs.map((employeeSnapshot) => employeeSnapshot.id),
    );
    const rawScores =
      body.scores && typeof body.scores === "object" && !Array.isArray(body.scores)
        ? (body.scores as Record<string, unknown>)
        : {};
    const normalizedScores = Object.entries(rawScores).reduce<CompatibilityScores>(
      (scores, [targetEmployeeId, score]) => {
        const trimmedTargetEmployeeId = targetEmployeeId.trim();
        if (
          !trimmedTargetEmployeeId ||
          trimmedTargetEmployeeId === employeeAuth.employeeId ||
          !validEmployeeIds.has(trimmedTargetEmployeeId)
        ) {
          return scores;
        }

        scores[trimmedTargetEmployeeId] = normalizeScore(score);
        return scores;
      },
      {},
    );

    await organizationRef.collection("compatibilities").doc(employeeAuth.employeeId).set(
      {
        employeeId: employeeAuth.employeeId,
        organizationId: employeeAuth.organizationId,
        scores: normalizedScores,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return NextResponse.json({ scores: normalizedScores });
  } catch (error) {
    if (error instanceof EmployeeAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { error: "働きやすさ設定の保存に失敗しました。" },
      { status: 500 },
    );
  }
}
