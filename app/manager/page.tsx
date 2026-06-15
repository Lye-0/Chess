import { redirect } from "next/navigation";

type ManagerPageProps = {
  searchParams: Promise<{
    organizationId?: string;
  }>;
};

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const { organizationId } = await searchParams;
  const params = organizationId
    ? `?organizationId=${encodeURIComponent(organizationId)}`
    : "";

  redirect(`/admin${params}`);
}
