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

export type AutoApprovalMode = "manual" | "rollingWindow" | "periodic";

export type AutoApprovalWindow =
  | "oneDay"
  | "threeDays"
  | "oneWeek"
  | "twoWeeks"
  | "oneMonth"
  | "twoMonths"
  | "threeMonths";

export type AutoApprovalPeriodTarget =
  | "nextWeek"
  | "secondNextWeek"
  | "nextMonth"
  | "secondNextMonth";

export type AutoApprovalTiming = AutoApprovalWindow | "fifteenDays";

export type AutoApprovalRequestScope = "managerSlotsOnly" | "includeEmployeeGenerated";

export type RecommendationSettings = {
  fairnessEnabled: boolean;
  weightId: RecommendationWeightId;
  autoApprovalMode: AutoApprovalMode;
  autoApprovalWindow: AutoApprovalWindow;
  autoApprovalPeriodTarget: AutoApprovalPeriodTarget;
  autoApprovalTiming: AutoApprovalTiming;
  autoApprovalRequestScope: AutoApprovalRequestScope;
};

export const defaultRecommendationSettings: RecommendationSettings = {
  fairnessEnabled: true,
  weightId: "balanced",
  autoApprovalMode: "manual",
  autoApprovalWindow: "oneMonth",
  autoApprovalPeriodTarget: "nextMonth",
  autoApprovalTiming: "fifteenDays",
  autoApprovalRequestScope: "managerSlotsOnly",
};

const recommendationWeightIds: RecommendationWeightId[] = [
  "compatibilityOnly",
  "compatibility",
  "balanced",
  "workScore",
  "workScoreOnly",
];

const autoApprovalModes: AutoApprovalMode[] = [
  "manual",
  "rollingWindow",
  "periodic",
];

const autoApprovalWindows: AutoApprovalWindow[] = [
  "oneDay",
  "threeDays",
  "oneWeek",
  "twoWeeks",
  "oneMonth",
  "twoMonths",
  "threeMonths",
];

const autoApprovalPeriodTargets: AutoApprovalPeriodTarget[] = [
  "nextWeek",
  "secondNextWeek",
  "nextMonth",
  "secondNextMonth",
];

const autoApprovalTimings: AutoApprovalTiming[] = [
  "oneDay",
  "threeDays",
  "oneWeek",
  "twoWeeks",
  "fifteenDays",
  "oneMonth",
  "twoMonths",
  "threeMonths",
];

const autoApprovalRequestScopes: AutoApprovalRequestScope[] = [
  "managerSlotsOnly",
  "includeEmployeeGenerated",
];

function getRecommendationSettingsDocument(organizationId = defaultOrganizationId) {
  return doc(db, "organizations", organizationId, "settings", "recommendation");
}

function normalizeRecommendationWeightId(value: unknown): RecommendationWeightId {
  return recommendationWeightIds.includes(value as RecommendationWeightId)
    ? (value as RecommendationWeightId)
    : defaultRecommendationSettings.weightId;
}

function normalizeAutoApprovalMode(value: unknown): AutoApprovalMode {
  return autoApprovalModes.includes(value as AutoApprovalMode)
    ? (value as AutoApprovalMode)
    : defaultRecommendationSettings.autoApprovalMode;
}

function normalizeAutoApprovalWindow(value: unknown): AutoApprovalWindow {
  return autoApprovalWindows.includes(value as AutoApprovalWindow)
    ? (value as AutoApprovalWindow)
    : defaultRecommendationSettings.autoApprovalWindow;
}

function normalizeAutoApprovalPeriodTarget(
  value: unknown,
): AutoApprovalPeriodTarget {
  return autoApprovalPeriodTargets.includes(value as AutoApprovalPeriodTarget)
    ? (value as AutoApprovalPeriodTarget)
    : defaultRecommendationSettings.autoApprovalPeriodTarget;
}

function normalizeAutoApprovalTiming(value: unknown): AutoApprovalTiming {
  return autoApprovalTimings.includes(value as AutoApprovalTiming)
    ? (value as AutoApprovalTiming)
    : defaultRecommendationSettings.autoApprovalTiming;
}

function normalizeAutoApprovalRequestScope(
  value: unknown,
): AutoApprovalRequestScope {
  return autoApprovalRequestScopes.includes(value as AutoApprovalRequestScope)
    ? (value as AutoApprovalRequestScope)
    : defaultRecommendationSettings.autoApprovalRequestScope;
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
    autoApprovalMode: normalizeAutoApprovalMode(data?.autoApprovalMode),
    autoApprovalWindow: normalizeAutoApprovalWindow(data?.autoApprovalWindow),
    autoApprovalPeriodTarget: normalizeAutoApprovalPeriodTarget(
      data?.autoApprovalPeriodTarget,
    ),
    autoApprovalTiming: normalizeAutoApprovalTiming(data?.autoApprovalTiming),
    autoApprovalRequestScope: normalizeAutoApprovalRequestScope(
      data?.autoApprovalRequestScope,
    ),
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
