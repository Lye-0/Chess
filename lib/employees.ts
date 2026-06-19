import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const managedOrganizations = [
  { id: "nagoya-engineering", name: "名古屋エンジニアリング", department: "開発部" },
];

export const organization = managedOrganizations[0];
export const defaultOrganizationId = organization.id;
export const minWorkScore = -5;
export const maxWorkScore = 5;
export const defaultWorkScore = 0;

export function getOrganizationProfile(organizationId = defaultOrganizationId) {
  return (
    managedOrganizations.find(
      (managedOrganization) => managedOrganization.id === organizationId,
    ) ?? {
      id: organizationId,
      name: organizationId,
      department: "",
    }
  );
}

async function loadOrganizationProfile(organizationId = defaultOrganizationId) {
  const fallbackOrganization = getOrganizationProfile(organizationId);
  const snapshot = await getDoc(doc(db, "organizations", organizationId));

  if (!snapshot.exists()) return fallbackOrganization;

  const data = snapshot.data() ?? {};
  return {
    id: organizationId,
    name: String(data.name ?? fallbackOrganization.name),
    department: String(data.department ?? fallbackOrganization.department),
  };
}

function getEmployeesCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "employees");
}

function getShiftRequestsCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "shiftRequests");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeWorkScore(score: unknown) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) return defaultWorkScore;

  return Math.max(
    minWorkScore,
    Math.min(maxWorkScore, Math.round(numericScore)),
  );
}

export type EmployeeProfile = {
  id: string;
  organizationId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  employmentType: string;
  organization: string;
  department: string;
  workScore: number;
};

export type EmployeeRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  employmentType: string;
  workScore?: number | string;
};

function toEmployeeProfile(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
  organizationId = defaultOrganizationId,
): EmployeeProfile {
  const data = snapshot.data() ?? {};
  const currentOrganization = getOrganizationProfile(organizationId);
  const email = String(data.email ?? "");
  const firstName = String(data.firstName ?? "");
  const lastName = String(data.lastName ?? "");
  const name = String(data.name ?? `${lastName}${firstName}`);

  return {
    id: String(data.employeeId ?? data.id ?? snapshot.id),
    organizationId,
    employeeId: String(data.employeeId ?? data.id ?? snapshot.id),
    firstName,
    lastName,
    name,
    email,
    employmentType: String(data.employmentType ?? ""),
    organization: String(data.organization ?? currentOrganization.name),
    department: String(data.department ?? currentOrganization.department),
    workScore: normalizeWorkScore(data.workScore),
  };
}

export function subscribeEmployees(
  onNext: (employees: EmployeeProfile[]) => void,
  onError?: (error: FirestoreError) => void,
  organizationId = defaultOrganizationId,
): Unsubscribe {
  return onSnapshot(
    getEmployeesCollection(organizationId),
    (snapshot) => {
      const nextEmployees = snapshot.docs
        .map((employeeSnapshot) =>
          toEmployeeProfile(employeeSnapshot, organizationId),
        )
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      onNext(nextEmployees);
    },
    onError,
  );
}

async function createUniqueEmployeeId(organizationId = defaultOrganizationId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const randomPart = Math.floor(100000 + Math.random() * 900000);
    const employeeId = `E${randomPart}`;
    const snapshot = await getDoc(
      doc(getEmployeesCollection(organizationId), employeeId),
    );

    if (!snapshot.exists()) return employeeId;
  }

  throw new Error("従業員IDを生成できませんでした。もう一度登録してください。");
}

export async function createEmployee(
  input: EmployeeRegistrationInput,
  organizationId = defaultOrganizationId,
): Promise<EmployeeProfile> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeEmail(input.email);
  const employmentType = input.employmentType.trim();
  const workScore = normalizeWorkScore(input.workScore);
  const currentOrganization = await loadOrganizationProfile(organizationId);

  if (!firstName || !lastName || !email || !employmentType) {
    throw new Error("必須項目をすべて入力してください。");
  }

  const existingEmployee = await findEmployeeByEmail(organizationId, email);
  if (existingEmployee) {
    throw new Error("このメールアドレスは既に登録されています。");
  }

  const employeeId = await createUniqueEmployeeId(organizationId);
  const employee: EmployeeProfile = {
    id: employeeId,
    organizationId,
    employeeId,
    firstName,
    lastName,
    name: `${lastName}${firstName}`,
    email,
    employmentType,
    organization: currentOrganization.name,
    department: currentOrganization.department,
    workScore,
  };

  await setDoc(doc(getEmployeesCollection(organizationId), employeeId), {
    ...employee,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return employee;
}

export async function updateEmployee(
  employeeId: string,
  input: EmployeeRegistrationInput,
  organizationId = defaultOrganizationId,
): Promise<EmployeeProfile> {
  const trimmedEmployeeId = employeeId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeEmail(input.email);
  const employmentType = input.employmentType.trim();
  const workScore = normalizeWorkScore(input.workScore);
  const currentOrganization = await loadOrganizationProfile(organizationId);

  if (!trimmedEmployeeId || !firstName || !lastName || !email || !employmentType) {
    throw new Error("必須項目をすべて入力してください。");
  }

  const employeeRef = doc(getEmployeesCollection(organizationId), trimmedEmployeeId);
  const employeeSnapshot = await getDoc(employeeRef);

  if (!employeeSnapshot.exists()) {
    throw new Error("更新対象の従業員が見つかりません。");
  }

  const existingEmployee = await findEmployeeByEmail(organizationId, email);
  if (existingEmployee && existingEmployee.employeeId !== trimmedEmployeeId) {
    throw new Error("このメールアドレスは既に登録されています。");
  }

  const employee: EmployeeProfile = {
    id: trimmedEmployeeId,
    organizationId,
    employeeId: trimmedEmployeeId,
    firstName,
    lastName,
    name: `${lastName}${firstName}`,
    email,
    employmentType,
    organization: currentOrganization.name,
    department: currentOrganization.department,
    workScore,
  };
  const requestSnapshot = await getDocs(getShiftRequestsCollection(organizationId));
  const batch = writeBatch(db);

  batch.set(
    employeeRef,
    {
      ...employee,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  requestSnapshot.docs.forEach((requestDocument) => {
    if (requestDocument.data().employeeId !== trimmedEmployeeId) return;

    batch.update(doc(getShiftRequestsCollection(organizationId), requestDocument.id), {
      employeeName: employee.name,
      employeeEmail: employee.email,
      employmentType: employee.employmentType,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();

  return employee;
}

export async function deleteEmployee(
  employeeId: string,
  organizationId = defaultOrganizationId,
) {
  const trimmedEmployeeId = employeeId.trim();

  if (!trimmedEmployeeId) {
    throw new Error("削除対象の従業員が見つかりません。");
  }

  const requestSnapshot = await getDocs(getShiftRequestsCollection(organizationId));
  const batch = writeBatch(db);

  batch.delete(doc(getEmployeesCollection(organizationId), trimmedEmployeeId));

  requestSnapshot.docs.forEach((requestDocument) => {
    if (requestDocument.data().employeeId !== trimmedEmployeeId) return;

    batch.delete(doc(getShiftRequestsCollection(organizationId), requestDocument.id));
  });

  await batch.commit();
}

export async function findEmployeeByEmail(
  organizationId: string,
  email: string,
): Promise<EmployeeProfile | null> {
  const trimmedOrganizationId = organizationId.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedOrganizationId || !normalizedEmail) return null;

  const snapshot = await getDocs(getEmployeesCollection(trimmedOrganizationId));
  const employeeSnapshot = snapshot.docs.find((employeeDoc) => {
    return normalizeEmail(String(employeeDoc.data().email ?? "")) === normalizedEmail;
  });

  return employeeSnapshot
    ? toEmployeeProfile(employeeSnapshot, trimmedOrganizationId)
    : null;
}

export async function findEmployeeById(
  organizationId: string,
  employeeId: string,
): Promise<EmployeeProfile | null> {
  const trimmedOrganizationId = organizationId.trim();
  const trimmedEmployeeId = employeeId.trim();

  if (!trimmedOrganizationId || !trimmedEmployeeId) return null;

  const snapshot = await getDoc(
    doc(getEmployeesCollection(trimmedOrganizationId), trimmedEmployeeId),
  );

  return snapshot.exists()
    ? toEmployeeProfile(snapshot, trimmedOrganizationId)
    : null;
}

export function getEmployeePageQuery(
  employee: Pick<EmployeeProfile, "organizationId" | "employeeId">,
) {
  const params = new URLSearchParams({
    organizationId: employee.organizationId,
    employeeId: employee.employeeId,
  });

  return `?${params.toString()}`;
}
