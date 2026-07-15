import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EmployeeAuthError, verifyEmployeeRequest } from "@/lib/employeeAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompatibilityScores = Record<string, number>;
type CompatibilityDirectoryEntry = {
  employeeId: string;
  name: string;
  displayName: string;
};

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

function getEmployeeName(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() ?? {};
  const firstName = String(data.firstName ?? "");
  const lastName = String(data.lastName ?? "");
  const configuredName = String(data.name ?? "").trim();
  const composedName = (lastName + firstName).trim();

  return configuredName || composedName || "名前未設定";
}

function buildCompatibilityDirectory(
  snapshots: QueryDocumentSnapshot[],
): CompatibilityDirectoryEntry[] {
  const entries = snapshots
    .map((snapshot) => {
      const data = snapshot.data() ?? {};
      return {
        employeeId: String(data.employeeId ?? data.id ?? snapshot.id),
        name: getEmployeeName(snapshot),
      };
    })
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();

  for (const entry of entries) {
    totals.set(entry.name, (totals.get(entry.name) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const occurrence = (occurrences.get(entry.name) ?? 0) + 1;
    occurrences.set(entry.name, occurrence);

    return {
      ...entry,
      displayName:
        (totals.get(entry.name) ?? 0) > 1
          ? entry.name + " (" + occurrence + ")"
          : entry.name,
    };
  });
}

function toDisplayCompatibilityScores(
  scores: CompatibilityScores,
  directory: CompatibilityDirectoryEntry[],
  currentEmployeeId: string,
) {
  const displayNameByEmployeeId = new Map(
    directory.map((entry) => [entry.employeeId, entry.displayName]),
  );

  return Object.entries(scores).reduce<CompatibilityScores>(
    (displayScores, [employeeId, score]) => {
      const displayName = displayNameByEmployeeId.get(employeeId);

      if (!displayName || employeeId === currentEmployeeId) {
        return displayScores;
      }

      displayScores[displayName] = score;
      return displayScores;
    },
    {},
  );
}

export async function GET(request: Request) {
  try {
    const employeeAuth = await verifyEmployeeRequest(request);
    const adminDb = await getAdminDb();
    const organizationRef = adminDb
      .collection("organizations")
      .doc(employeeAuth.organizationId);
    const [employeeSnapshot, employeesSnapshot, scoresSnapshot] = await Promise.all([
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

    const directory = buildCompatibilityDirectory(employeesSnapshot.docs);
    const normalizedScores = toCompatibilityScores(scoresSnapshot.data());

    return NextResponse.json({
      employees: directory
        .filter((entry) => entry.employeeId !== employeeAuth.employeeId)
        .map(({ displayName }) => ({ name: displayName })),
      scores: toDisplayCompatibilityScores(
        normalizedScores,
        directory,
        employeeAuth.employeeId,
      ),
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

    const directory = buildCompatibilityDirectory(employeesSnapshot.docs);
    const employeeByDisplayName = new Map(
      directory.map((entry) => [entry.displayName, entry]),
    );
    const rawScores =
      body.scores && typeof body.scores === "object" && !Array.isArray(body.scores)
        ? (body.scores as Record<string, unknown>)
        : {};
    const normalizedScores = Object.entries(rawScores).reduce<CompatibilityScores>(
      (scores, [targetEmployeeName, score]) => {
        const targetEmployee = employeeByDisplayName.get(targetEmployeeName.trim());

        if (
          !targetEmployee ||
          targetEmployee.employeeId === employeeAuth.employeeId
        ) {
          return scores;
        }

        scores[targetEmployee.employeeId] = normalizeScore(score);
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

    return NextResponse.json({
      scores: toDisplayCompatibilityScores(
        normalizedScores,
        directory,
        employeeAuth.employeeId,
      ),
    });
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
