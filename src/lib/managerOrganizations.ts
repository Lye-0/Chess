import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { deleteManagerCalendarSubscriptions } from "./managerCalendarSubscriptions";

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

export type OrganizationPosition = {
  id: string;
  organizationId: string;
  name: string;
};

export type PositionInput = {
  name: string;
};

function getManagerOrganizationsCollection(managerUid: string) {
  return collection(db, "managers", managerUid, "organizations");
}

function getPositionsCollection(organizationId: string) {
  return collection(db, "organizations", organizationId, "positions");
}

function normalizePositionName(name: string) {
  return name.trim().replace(/\s+/g, " ");
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

function toOrganizationPosition(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  organizationId: string,
): OrganizationPosition {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    organizationId,
    name: String(data.name ?? ""),
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

export function subscribePositions(
  organizationId: string,
  onNext: (positions: OrganizationPosition[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    getPositionsCollection(organizationId),
    (snapshot) => {
      const positions = snapshot.docs
        .map((positionSnapshot) =>
          toOrganizationPosition(positionSnapshot, organizationId),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      onNext(positions);
    },
    onError,
  );
}

export async function createPosition(
  organizationId: string,
  input: PositionInput,
): Promise<OrganizationPosition> {
  const trimmedOrganizationId = organizationId.trim();
  const name = normalizePositionName(input.name);

  if (!trimmedOrganizationId) {
    throw new Error("ポジションを追加する組織が見つかりません。");
  }

  if (!name) {
    throw new Error("ポジション名を入力してください。");
  }

  const snapshot = await getDocs(getPositionsCollection(trimmedOrganizationId));
  const exists = snapshot.docs.some((positionSnapshot) => {
    const existingName = normalizePositionName(
      String(positionSnapshot.data().name ?? ""),
    );

    return existingName === name;
  });

  if (exists) {
    throw new Error("同じ名前のポジションが既に登録されています。");
  }

  const positionRef = await addDoc(getPositionsCollection(trimmedOrganizationId), {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: positionRef.id,
    organizationId: trimmedOrganizationId,
    name,
  };
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
  input: ManagerOrganizationInput,
): Promise<ManagerOrganization> {
  const name = input.name.trim();
  const department = input.department.trim();
  const manager = auth.currentUser;

  if (!manager) {
    throw new Error("管理者ログインが必要です。");
  }

  if (!name) {
    throw new Error("組織名を入力してください。");
  }

  const idToken = await manager.getIdToken();
  const response = await fetch("/api/manager/organizations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + idToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, department }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    organization?: ManagerOrganization;
    error?: string;
  };

  if (!response.ok || !result.organization) {
    throw new Error(result.error ?? "組織の登録に失敗しました。");
  }

  return result.organization;
}

export async function deleteManagerOrganization(
  managerUid: string,
  organizationId: string,
) {
  const trimmedOrganizationId = organizationId.trim();

  if (!managerUid) {
    throw new Error("管理者ログインが必要です。");
  }

  if (!trimmedOrganizationId) {
    throw new Error("削除対象の組織が見つかりません。");
  }

  const organizationSnapshot = await getDoc(
    doc(getManagerOrganizationsCollection(managerUid), trimmedOrganizationId),
  );

  if (!organizationSnapshot.exists()) {
    throw new Error("削除対象の組織が見つかりません。");
  }

  await deleteManagerCalendarSubscriptions({
    organizationId: trimmedOrganizationId,
  });

  const deletableCollectionNames = [
    "employees",
    "positions",
    "shiftSlots",
    "shiftRequests",
    "shiftRequestKeys",
    "compatibilities",
  ];
  const snapshots = await Promise.all(
    deletableCollectionNames.map((collectionName) =>
      getDocs(collection(db, "organizations", trimmedOrganizationId, collectionName)),
    ),
  );
  const batch = writeBatch(db);

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
    });
  });

  batch.delete(doc(db, "organizations", trimmedOrganizationId, "settings", "payroll"));
  batch.delete(doc(db, "organizations", trimmedOrganizationId, "settings", "recommendation"));
  batch.delete(doc(db, "organizations", trimmedOrganizationId, "settings", "shiftRequests"));
  batch.delete(doc(db, "organizations", trimmedOrganizationId));

  await batch.commit();

  await deleteDoc(
    doc(getManagerOrganizationsCollection(managerUid), trimmedOrganizationId),
  );
}
