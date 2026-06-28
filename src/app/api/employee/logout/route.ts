import { NextResponse } from "next/server";
import {
  employeeSessionCookieName,
  getEmployeeSessionCookieOptions,
} from "@/lib/employeeAuthServer";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(employeeSessionCookieName, "", {
    ...getEmployeeSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
