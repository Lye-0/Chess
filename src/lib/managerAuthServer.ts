import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export class ManagerAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "ManagerAuthError";
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? "";
}

export async function verifyManagerRequest(
  request: Request,
): Promise<DecodedIdToken> {
  const token = getBearerToken(request);

  if (!token) {
    throw new ManagerAuthError("管理者ログインが必要です。", 401);
  }

  try {
    const decodedToken = await (await getAdminAuth()).verifyIdToken(token);

    if (decodedToken.email_verified !== true) {
      throw new ManagerAuthError(
        "メールアドレスの確認が完了した管理者アカウントが必要です。",
        403,
      );
    }

    return decodedToken;
  } catch (error) {
    if (error instanceof ManagerAuthError) throw error;

    throw new ManagerAuthError("管理者ログインを確認できませんでした。", 401);
  }
}
