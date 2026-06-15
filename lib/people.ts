import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const organization = {
  id: "nagoya-engineering",
  name: "名古屋エンジニアリング",
  department: "開発部",
};

export const defaultOrganizationId = organization.id;
const employeeSessionKey = "chess-current-employee";
const employeeSessionEvent = "chess-employee-session-change";

function getEmployeesCollection(organizationId = defaultOrganizationId) {
  return collection(db, "organizations", organizationId, "employees");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export type EmployeeProfile = {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  employmentType: string;
  organization: string;
  department: string;
};

export type EmployeeRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  employmentType: string;
};

export const fallbackEmployee: EmployeeProfile = {
  id: "E000001",
  employeeId: "E000001",
  firstName: "健一",
  lastName: "田中",
  name: "田中健一",
  email: "tanaka@example.com",
  employmentType: "正社員",
  organization: organization.name,
  department: organization.department,
};

export const employees: EmployeeProfile[] = [fallbackEmployee];
export const currentEmployee = fallbackEmployee;

function toEmployeeProfile(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): EmployeeProfile {
  const data = snapshot.data();
  const email = String(data.email ?? "");
  const firstName = String(data.firstName ?? "");
  const lastName = String(data.lastName ?? "");
  const name = String(data.name ?? `${lastName}${firstName}`);

  return {
    id: String(data.employeeId ?? data.id ?? snapshot.id),
    employeeId: String(data.employeeId ?? data.id ?? snapshot.id),
    firstName,
    lastName,
    name,
    email,
    employmentType: String(data.employmentType ?? ""),
    organization: String(data.organization ?? organization.name),
    department: String(data.department ?? organization.department),
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
        .map(toEmployeeProfile)
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
    employeeId,
    firstName,
    lastName,
    name: `${lastName}${firstName}`,
    email,
    employmentType,
    organization: organization.name,
    department: organization.department,
  };

  await setDoc(doc(getEmployeesCollection(organizationId), employeeId), {
    ...employee,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return employee;
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

  return employeeSnapshot ? toEmployeeProfile(employeeSnapshot) : null;
}

export function saveEmployeeSession(employee: EmployeeProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(employeeSessionKey, JSON.stringify(employee));
  window.dispatchEvent(new Event(employeeSessionEvent));
}

function readEmployeeSessionString() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(employeeSessionKey);
}

function parseEmployeeSession(rawEmployee: string | null) {
  if (!rawEmployee) return null;

  try {
    const employee = JSON.parse(rawEmployee) as EmployeeProfile;
    if (!employee.id || !employee.name || !employee.email) return null;
    return employee;
  } catch {
    return null;
  }
}

export function loadEmployeeSession() {
  return parseEmployeeSession(readEmployeeSessionString());
}

export function getEmployeeSessionSnapshot() {
  return readEmployeeSessionString();
}

export function getEmployeeSessionServerSnapshot() {
  return null;
}

export function subscribeEmployeeSession(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(employeeSessionEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(employeeSessionEvent, onStoreChange);
  };
}

export function parseEmployeeSessionSnapshot(snapshot: string | null) {
  return parseEmployeeSession(snapshot);
}

export function clearEmployeeSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(employeeSessionKey);
  window.dispatchEvent(new Event(employeeSessionEvent));
}
