import { getAdminAuth } from "./firebaseAdmin";

export type EmployeeAuthClaims = {
  uid: string;
  organizationId: string;
  employeeId: string;
};

export function getEmployeeUid(organizationId: string, employeeId: string) {
  return `employee:${organizationId}:${employeeId}`;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");

  return type.toLowerCase() === "bearer" ? token : "";
}

export async function verifyEmployeeRequest(
  request: Request,
): Promise<EmployeeAuthClaims> {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("従業員ログインが必要です。");
  }

  const adminAuth = await getAdminAuth();
  const decodedToken = await adminAuth.verifyIdToken(token);
  const organizationId = String(decodedToken.organizationId ?? "");
  const employeeId = String(decodedToken.employeeId ?? "");
  const role = String(decodedToken.role ?? "");

  if (
    role !== "employee" ||
    !organizationId ||
    !employeeId ||
    decodedToken.uid !== getEmployeeUid(organizationId, employeeId)
  ) {
    throw new Error("従業員ログインを確認できませんでした。");
  }

  return {
    uid: decodedToken.uid,
    organizationId,
    employeeId,
  };
}
