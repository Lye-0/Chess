"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth } from "./firebase";
import {
  getManagerOrganization,
  type ManagerOrganization,
} from "./managerOrganizations";

export function useManagerOrganizationAccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId")?.trim() ?? "";
  const organizationQuery = useMemo(() => {
    return organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : "";
  }, [organizationId]);
  const [organization, setOrganization] = useState<ManagerOrganization | null>(null);
  const [isCheckingOrganization, setIsCheckingOrganization] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      router.replace("/manager/select-organization");
      return;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setOrganization(null);
      setIsCheckingOrganization(true);

      if (!user) {
        router.replace("/login/manager");
        return;
      }

      try {
        const nextOrganization = await getManagerOrganization(
          user.uid,
          organizationId,
        );

        if (!active) return;

        if (!nextOrganization) {
          router.replace("/manager/select-organization");
          return;
        }

        setOrganization(nextOrganization);
      } catch (error) {
        console.error(error);
        router.replace("/manager/select-organization");
      } finally {
        if (active) setIsCheckingOrganization(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [organizationId, router]);

  return {
    organizationId,
    organizationQuery,
    organization,
    isCheckingOrganization,
  };
}
