import { createHmac, timingSafeEqual } from "crypto";

export const employeeSessionCookieName = "chess-employee-session";
const employeeSessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type EmployeeAuthClaims = {
  uid: string;
  organizationId: string;
  employeeId: string;
};

export class EmployeeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeAuthError";
  }
}

type EmployeeSessionPayload = {
  role: "employee";
  organizationId: string;
  employeeId: string;
  exp: number;
};

export function getEmployeeUid(organizationId: string, employeeId: string) {
  return `employee:${organizationId}:${employeeId}`;
}

export function getEmployeeSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: employeeSessionMaxAgeSeconds,
  };
}

function getEmployeeSessionSecret() {
  const secret =
    process.env.EMPLOYEE_SESSION_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!secret) {
    throw new Error("従業員セッションの署名キーが設定されていません。");
  }

  return secret;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getEmployeeSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function isSameSignature(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function createEmployeeSessionToken(
  organizationId: string,
  employeeId: string,
) {
  const payload: EmployeeSessionPayload = {
    role: "employee",
    organizationId,
    employeeId,
    exp: Math.floor(Date.now() / 1000) + employeeSessionMaxAgeSeconds,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function getEmployeeSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${employeeSessionCookieName}=`),
  );

  return sessionCookie
    ? decodeURIComponent(sessionCookie.slice(employeeSessionCookieName.length + 1))
    : "";
}

function parseEmployeeSessionToken(token: string): EmployeeSessionPayload {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    throw new EmployeeAuthError("従業員ログインが必要です。");
  }

  const expectedSignature = signPayload(encodedPayload);

  if (!isSameSignature(signature, expectedSignature)) {
    throw new EmployeeAuthError("従業員ログインを確認できませんでした。");
  }

  let payload: Partial<EmployeeSessionPayload>;

  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<EmployeeSessionPayload>;
  } catch {
    throw new EmployeeAuthError("従業員ログインを確認できませんでした。");
  }

  if (
    payload.role !== "employee" ||
    !payload.organizationId ||
    !payload.employeeId ||
    !payload.exp ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new EmployeeAuthError("従業員ログインを確認できませんでした。");
  }

  return {
    role: "employee",
    organizationId: String(payload.organizationId),
    employeeId: String(payload.employeeId),
    exp: Number(payload.exp),
  };
}

export async function verifyEmployeeRequest(
  request: Request,
): Promise<EmployeeAuthClaims> {
  const payload = parseEmployeeSessionToken(getEmployeeSessionToken(request));

  return {
    uid: getEmployeeUid(payload.organizationId, payload.employeeId),
    organizationId: payload.organizationId,
    employeeId: payload.employeeId,
  };
}
