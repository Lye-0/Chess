import { auth } from "./firebase";

type DeleteManagerCalendarSubscriptionsInput = {
  organizationId: string;
  employeeId?: string;
};

type DeleteManagerCalendarSubscriptionsResponse = {
  deletedCount?: unknown;
  error?: unknown;
};

export async function deleteManagerCalendarSubscriptions({
  organizationId,
  employeeId,
}: DeleteManagerCalendarSubscriptionsInput) {
  const trimmedOrganizationId = organizationId.trim();
  const trimmedEmployeeId = employeeId?.trim();

  if (!trimmedOrganizationId) {
    throw new Error("組織IDを確認できませんでした。");
  }

  const manager = auth.currentUser;

  if (!manager) {
    throw new Error("管理者ログインが必要です。");
  }

  const idToken = await manager.getIdToken();
  const response = await fetch("/api/manager/calendar-subscriptions", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + idToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId: trimmedOrganizationId,
      ...(trimmedEmployeeId ? { employeeId: trimmedEmployeeId } : {}),
    }),
  });
  const result = (await response.json().catch(() => ({}))) as
    | DeleteManagerCalendarSubscriptionsResponse
    | undefined;

  if (!response.ok) {
    const errorMessage =
      typeof result?.error === "string"
        ? result.error
        : "カレンダー購読情報の削除に失敗しました。";
    throw new Error(errorMessage);
  }

  return typeof result?.deletedCount === "number" ? result.deletedCount : 0;
}
