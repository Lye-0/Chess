export function SlotRequestStatus({ requestCount }: { requestCount: number }) {
  return (
    <p
      className={[
        "mt-1 text-sm",
        requestCount > 0 ? "text-[#1763ff]" : "text-[#ff3b00]",
      ].join(" ")}
    >
      {requestCount > 0 ? `希望者: ${requestCount}人` : "希望者なし"}
    </p>
  );
}
