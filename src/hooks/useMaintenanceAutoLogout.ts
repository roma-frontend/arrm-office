import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Hook to auto-logout users when maintenance mode is active
 * Smooth logout without multiple refreshes, shows maintenance banner on login page
 */
export function useMaintenanceAutoLogout() {
  const { user, logout } = useAuthStore();
  const organizationId = user?.organizationId;
  const logoutAttemptedRef = useRef(false);
  const logoutTimeoutRef = useRef<NodeJS.Timeout>();

  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId ? { organizationId: organizationId as any } : "skip"
  );

  // Debug logging
  useEffect(() => {
    console.log("[Maintenance] Hook state:", {
      userExists: !!user,
      userRole: user?.role,
      organizationId: organizationId,
      maintenanceActive: maintenance?.isActive,
      maintenanceStartTime: maintenance?.startTime,
      logoutAttempted: logoutAttemptedRef.current,
    });
  }, [user, organizationId, maintenance?.isActive]);

  useEffect(() => {
    // Prevent any further execution after logout has been attempted
    if (logoutAttemptedRef.current) {
      console.log("[Maintenance] Logout already attempted, skipping");
      return;
    }

    // Clear previous timeout on each run
    if (logoutTimeoutRef.current) {
      clearTimeout(logoutTimeoutRef.current);
    }

    // Only proceed if maintenance is active and user is not superadmin
    if (!maintenance?.isActive || !user || user.role === "superadmin") {
      console.log("[Maintenance] Skipping - not active or superadmin", {
        isActive: maintenance?.isActive,
        hasUser: !!user,
        isSuperadmin: user?.role === "superadmin",
      });
      return;
    }

    const now = Date.now();
    const startTime = maintenance.startTime;
    const timeUntilMaintenance = startTime - now;

    console.log("[Maintenance] Checking schedule", {
      now: new Date(now).toISOString(),
      startTime: new Date(startTime).toISOString(),
      timeUntilMaintenance: timeUntilMaintenance,
      willTrigger: timeUntilMaintenance > 0,
    });

    // If maintenance has already started
    if (timeUntilMaintenance <= 0) {
      console.log("[Maintenance] Triggering immediate logout");
      logoutAttemptedRef.current = true;
      
      // Smooth fade-out transition
      document.documentElement.style.transition = "opacity 0.5s ease-out";
      document.documentElement.style.opacity = "0";

      // Give time for fade-out animation
      setTimeout(async () => {
        try {
          console.log("[Maintenance] Executing logout and redirect");
          
          // Construct maintenance URL first
          const maintenanceUrl = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
          
          // 1. Call logout API route to clear server-side session
          console.log("[Maintenance] Calling logout API endpoint...");
          try {
            const response = await fetch(`/api/auth/logout?redirect=${encodeURIComponent(maintenanceUrl)}`, {
              method: 'POST',
              credentials: 'include', // Include cookies in the request
            });
            console.log("[Maintenance] Logout API response status:", response.status);
          } catch (err) {
            console.error("[Maintenance] Logout API failed (will continue):", err);
          }
          
          // 2. Clear Zustand store and localStorage
          logout();
          localStorage.removeItem('hr-auth-storage');
          
          // 3. Manually clear all auth cookies from browser
          const cookies = document.cookie.split(";");
          for (let cookie of cookies) {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
            if (name.includes("auth") || name.includes("session")) {
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;`;
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=${document.location.hostname};`;
            }
          }
          
          console.log("[Maintenance] All auth data cleared");
          
          // 4. Wait a bit to ensure everything is cleared
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // 5. Hard redirect to maintenance page
          console.log("[Maintenance] Hard redirect to:", maintenanceUrl);
          window.location.href = maintenanceUrl;
        } catch (error) {
          console.error("[Maintenance] Logout error:", error);
          // Force redirect even if logout fails
          logout();
          localStorage.removeItem('hr-auth-storage');
          window.location.href = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
        }
      }, 500);
    } else {
      // Schedule logout at the exact maintenance start time
      console.log(
        `[Maintenance] Scheduling logout in ${timeUntilMaintenance}ms (${new Date(startTime).toISOString()})`
      );

      logoutTimeoutRef.current = setTimeout(() => {
        console.log("[Maintenance] Timeout fired - executing logout");
        logoutAttemptedRef.current = true;

        // Smooth fade-out transition
        document.documentElement.style.transition = "opacity 0.5s ease-out";
        document.documentElement.style.opacity = "0";

        // Give time for fade-out animation
        setTimeout(async () => {
          try {
            console.log("[Maintenance] Timeout: Executing logout and redirect");
            
            const maintenanceUrl = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
            
            // 1. Call logout API route to clear server-side session
            console.log("[Maintenance] Timeout: Calling logout API endpoint...");
            try {
              const response = await fetch(`/api/auth/logout?redirect=${encodeURIComponent(maintenanceUrl)}`, {
                method: 'POST',
                credentials: 'include', // Include cookies in the request
              });
              console.log("[Maintenance] Timeout: Logout API response status:", response.status);
            } catch (err) {
              console.error("[Maintenance] Timeout: Logout API failed (will continue):", err);
            }
            
            // 2. Clear Zustand and localStorage
            logout();
            localStorage.removeItem('hr-auth-storage');
            
            // 3. Clear auth cookies
            const cookies = document.cookie.split(";");
            for (let cookie of cookies) {
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
              if (name.includes("auth") || name.includes("session")) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;`;
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=${document.location.hostname};`;
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            console.log("[Maintenance] Timeout: Hard redirect to maintenance page");
            window.location.href = maintenanceUrl;
          } catch (error) {
            console.error("[Maintenance] Timeout logout error:", error);
            logout();
            localStorage.removeItem('hr-auth-storage');
            window.location.href = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
          }
        }, 500);
      }, timeUntilMaintenance);
    }

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (logoutTimeoutRef.current) {
        clearTimeout(logoutTimeoutRef.current);
      }
    };
  }, [maintenance?.isActive, maintenance?.startTime, user?.id, user?.role, organizationId]);

  // Secondary: Poll every second to catch maintenance time in case of race conditions
  useEffect(() => {
    if (!maintenance?.isActive || !user || user.role === "superadmin" || logoutAttemptedRef.current) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const startTime = maintenance.startTime;

      // Check if we've reached or passed the maintenance time
      if (now >= startTime) {
        console.log("[Maintenance] Poll detected maintenance time reached");
        logoutAttemptedRef.current = true;

        // Smooth fade-out transition
        document.documentElement.style.transition = "opacity 0.5s ease-out";
        document.documentElement.style.opacity = "0";

        // Give time for fade-out animation
        setTimeout(async () => {
          try {
            console.log("[Maintenance] Poll: Executing logout and redirect");
            
            const maintenanceUrl = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
            
            // 1. Call logout API route to clear server-side session
            console.log("[Maintenance] Poll: Calling logout API endpoint...");
            try {
              const response = await fetch(`/api/auth/logout?redirect=${encodeURIComponent(maintenanceUrl)}`, {
                method: 'POST',
                credentials: 'include', // Include cookies in the request
              });
              console.log("[Maintenance] Poll: Logout API response status:", response.status);
            } catch (err) {
              console.error("[Maintenance] Poll: Logout API failed (will continue):", err);
            }
            
            // 2. Clear Zustand and localStorage
            logout();
            localStorage.removeItem('hr-auth-storage');
            
            // 3. Clear auth cookies
            const cookies = document.cookie.split(";");
            for (let cookie of cookies) {
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
              if (name.includes("auth") || name.includes("session")) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;`;
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=${document.location.hostname};`;
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            console.log("[Maintenance] Poll: Hard redirect to maintenance page");
            window.location.href = maintenanceUrl;
          } catch (error) {
            console.error("[Maintenance] Poll logout error:", error);
            logout();
            localStorage.removeItem('hr-auth-storage');
            window.location.href = `/login?maintenance=true${organizationId ? `&org=${organizationId}` : ""}`;
          }
        }, 500);

        clearInterval(interval);
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [maintenance?.isActive, maintenance?.startTime, user?.id, user?.role, organizationId]);
}

