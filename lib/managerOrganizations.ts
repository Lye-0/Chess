import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type ManagerOrganization = {
  id: string;
  name: string;
  department: string;
  role: "owner" | "admin";
};

export type ManagerOrganizationInput = {
  name: string;
  department: string;
};

function getManagerOrganizationsCollection(managerUid: string) {
  return collection(db, "managers", managerUid, "organizations");
}

function createOrganizationId() {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `org-${timePart}-${randomPart}`;
}

function toManagerOrganization(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ManagerOrganization {
  const data = snapshot.data();

  return {
    id: String(data.organizationId ?? snapshot.id),
    name: String(data.name ?? snapshot.id),
    department: String(data.department ?? ""),
    role: data.role === "admin" ? "admin" : "owner",
  };
}

export function subscribeManagerOrganizations(
  managerUid: string,
  onNext: (organizations: ManagerOrganization[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    getManagerOrganizationsCollection(managerUid),
    (snapshot) => {
      const organizations = snapshot.docs
        .map(toManagerOrganization)
        .sort((a, b) => a.name.localeCompare(b.name));
      onNext(organizations);
    },
    onError,
  );
}

export async function getManagerOrganization(
  managerUid: string,
  organizationId: string,
): Promise<ManagerOrganization | null> {
  const trimmedOrganizationId = organizationId.trim();
  if (!managerUid || !trimmedOrganizationId) return null;

  const snapshot = await getDoc(
    doc(getManagerOrganizationsCollection(managerUid), trimmedOrganizationId),
  );

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: String(data.organizationId ?? snapshot.id),
    name: String(data.name ?? snapshot.id),
    department: String(data.department ?? ""),
    role: data.role === "admin" ? "admin" : "owner",
  };
}

export async function createManagerOrganization(
  managerUid: string,
  managerEmail: string | null,
  input: ManagerOrganizationInput,
): Promise<ManagerOrganization> {
  const name = input.name.trim();
  const department = input.department.trim();

  if (!managerUid) {
    throw new Error("管理者ログインが必要です。");
  }

  if (!name) {
    throw new Error("組織名を入力してください。");
  }

  const organizationId = createOrganizationId();
  const organization: ManagerOrganization = {
    id: organizationId,
    name,
    department,
    role: "owner",
  };

  await setDoc(
    doc(db, "managers", managerUid),
    {
      email: managerEmail ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(doc(db, "organizations", organizationId), {
    id: organizationId,
    name,
    department,
    createdBy: managerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(getManagerOrganizationsCollection(managerUid), organizationId), {
    organizationId,
    name,
    department,
    role: "owner",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return organization;
}
