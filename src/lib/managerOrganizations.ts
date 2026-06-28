import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
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

function createOrganizationIdCandidate() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createUniqueOrganizationId() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const organizationId = createOrganizationIdCandidate();
    const snapshot = await getDoc(doc(db, "organizations", organizationId));

    if (!snapshot.exists()) return organizationId;
  }

  throw new Error("組織IDを生成できませんでした。もう一度登録してください。");
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

  const organizationId = await createUniqueOrganizationId();
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

  const deletableCollectionNames = [
    "employees",
    "positions",
    "shiftSlots",
    "shiftRequests",
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
  batch.delete(doc(getManagerOrganizationsCollection(managerUid), trimmedOrganizationId));

  await batch.commit();
}
