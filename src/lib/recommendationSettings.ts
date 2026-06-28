import {
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

export type RecommendationWeightId =
  | "compatibilityOnly"
  | "compatibility"
  | "balanced"
  | "workScore"
  | "workScoreOnly";

export type RecommendationSettings = {
  fairnessEnabled: boolean;
  weightId: RecommendationWeightId;
};

export const defaultRecommendationSettings: RecommendationSettings = {
  fairnessEnabled: true,
  weightId: "balanced",
};

const recommendationWeightIds: RecommendationWeightId[] = [
  "compatibilityOnly",
  "compatibility",
  "balanced",
  "workScore",
  "workScoreOnly",
];

function getRecommendationSettingsDocument(organizationId = defaultOrganizationId) {
  return doc(db, "organizations", organizationId, "settings", "recommendation");
}

function normalizeRecommendationWeightId(value: unknown): RecommendationWeightId {
  return recommendationWeightIds.includes(value as RecommendationWeightId)
    ? (value as RecommendationWeightId)
    : defaultRecommendationSettings.weightId;
}

export function normalizeRecommendationSettings(
  data?: DocumentData,
): RecommendationSettings {
  return {
    fairnessEnabled:
      typeof data?.fairnessEnabled === "boolean"
        ? data.fairnessEnabled
        : defaultRecommendationSettings.fairnessEnabled,
    weightId: normalizeRecommendationWeightId(data?.weightId),
  };
}

export function subscribeRecommendationSettings(
  onNext: (settings: RecommendationSettings) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getRecommendationSettingsDocument(organizationId),
    (snapshot) => {
      onNext(normalizeRecommendationSettings(snapshot.data()));
    },
    onError,
  );
}

export async function updateRecommendationSettings(
  settings: RecommendationSettings,
  organizationId = defaultOrganizationId,
) {
  await setDoc(
    getRecommendationSettingsDocument(organizationId),
    {
      ...normalizeRecommendationSettings(settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
