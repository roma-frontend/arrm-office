"use client";

import { useMaintenanceAutoLogout } from "@/hooks/useMaintenanceAutoLogout";

/**
 * Component that handles auto-logout when maintenance mode is detected
 * This runs on all protected pages and logs out users when maintenance starts
 */
export function MaintenanceAutoLogout() {
  useMaintenanceAutoLogout();
  return null;
}
