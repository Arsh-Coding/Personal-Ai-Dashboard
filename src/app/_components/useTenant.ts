"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TENANT, isTenantId, type TenantId } from "@/lib/tenants";

const STORAGE_KEY = "corsair.activeTenant";

/**
 * Which connected account the dashboard is currently showing.
 *
 * Initial state is always `DEFAULT_TENANT` so the server render and the first
 * client render agree; the persisted choice is applied in an effect after mount,
 * which avoids a hydration mismatch (localStorage does not exist on the server).
 */
export function useTenant() {
  const [tenant, setTenant] = useState<TenantId>(DEFAULT_TENANT);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isTenantId(saved)) setTenant(saved);
  }, []);

  const selectTenant = (next: TenantId) => {
    setTenant(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return { tenant, selectTenant };
}
