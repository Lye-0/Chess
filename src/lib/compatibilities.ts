import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { defaultOrganizationId } from "./people";

export type CompatibilityScores = Record<string, number>;
export type CompatibilityScoreMap = Record<string, CompatibilityScores>;

function getCompatibilitiesCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "compatibilities");
}

function getCompatibilityDocument(
  employeeId: string,
  organizationId = defaultOrganizationId,
) {
  return doc(db, "organizations", organizationId, "compatibilities", employeeId);
}

function normalizeScore(score: unknown) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) return 0;

  return Math.max(-5, Math.min(5, Math.round(numericScore)));
}

function toCompatibilityScores(data: DocumentData | undefined): CompatibilityScores {
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

export function subscribeCompatibilityScores(
  employeeId: string,
  onNext: (scores: CompatibilityScores) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getCompatibilityDocument(employeeId, organizationId),
    (snapshot) => {
      onNext(toCompatibilityScores(snapshot.data()));
    },
    onError,
  );
}

export function subscribeOrganizationCompatibilityScores(
  onNext: (scores: CompatibilityScoreMap) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  const cache = new Map<string, CompatibilityScores>();

  return onSnapshot(
    getCompatibilitiesCollection(organizationId),
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          cache.delete(change.doc.id);
        } else {
          cache.set(change.doc.id, toCompatibilityScores(change.doc.data()));
        }
      }

      const nextScores: CompatibilityScoreMap = {};
      for (const scoreDocument of snapshot.docs) {
        nextScores[scoreDocument.id] = cache.get(scoreDocument.id)!;
      }
      onNext(nextScores);
    },
    onError,
  );
}

export async function saveCompatibilityScores({
  employeeId,
  organizationId = defaultOrganizationId,
  scores,
}: {
  employeeId: string;
  organizationId?: string;
  scores: CompatibilityScores;
}) {
  const trimmedEmployeeId = employeeId.trim();
  const trimmedOrganizationId = organizationId.trim();

  if (!trimmedEmployeeId || !trimmedOrganizationId) {
    throw new Error("従業員情報を確認できませんでした。");
  }

  const normalizedScores = Object.entries(scores).reduce<CompatibilityScores>(
    (nextScores, [targetEmployeeId, score]) => {
      const trimmedTargetEmployeeId = targetEmployeeId.trim();
      if (!trimmedTargetEmployeeId || trimmedTargetEmployeeId === trimmedEmployeeId) {
        return nextScores;
      }

      nextScores[trimmedTargetEmployeeId] = normalizeScore(score);
      return nextScores;
    },
    {},
  );

  await setDoc(
    getCompatibilityDocument(trimmedEmployeeId, trimmedOrganizationId),
    {
      employeeId: trimmedEmployeeId,
      organizationId: trimmedOrganizationId,
      scores: normalizedScores,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
