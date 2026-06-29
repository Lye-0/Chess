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

export type ShiftRequestSettings = {
  employeeGeneratedRequestsEnabled: boolean;
};

export const defaultShiftRequestSettings: ShiftRequestSettings = {
  employeeGeneratedRequestsEnabled: true,
};

function getShiftRequestSettingsDocument(organizationId = defaultOrganizationId) {
  return doc(db, "organizations", organizationId, "settings", "shiftRequests");
}

export function normalizeShiftRequestSettings(
  data?: DocumentData,
): ShiftRequestSettings {
  return {
    employeeGeneratedRequestsEnabled:
      typeof data?.employeeGeneratedRequestsEnabled === "boolean"
        ? data.employeeGeneratedRequestsEnabled
        : defaultShiftRequestSettings.employeeGeneratedRequestsEnabled,
  };
}

export function subscribeShiftRequestSettings(
  onNext: (settings: ShiftRequestSettings) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getShiftRequestSettingsDocument(organizationId),
    (snapshot) => {
      onNext(normalizeShiftRequestSettings(snapshot.data()));
    },
    onError,
  );
}

export async function updateShiftRequestSettings(
  settings: ShiftRequestSettings,
  organizationId = defaultOrganizationId,
) {
  await setDoc(
    getShiftRequestSettingsDocument(organizationId),
    {
      ...normalizeShiftRequestSettings(settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}