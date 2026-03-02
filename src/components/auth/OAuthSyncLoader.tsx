"use client";

import { useSession } from "next-auth/react";
import { useAuthStore } from "@/store/useAuthStore";
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export function OAuthSyncLoader() {
  const { status } = useSession();
  const { isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    console.log("[OAuthSyncLoader] status:", status, "isAuthenticated:", isAuthenticated, "pathname:", pathname, "isSyncing:", isSyncing);
    
    // Start showing loader when OAuth authenticated but not yet in useAuthStore
    if (status === "authenticated" && !isAuthenticated && pathname === "/login") {
      console.log("[OAuthSyncLoader] ✅ Starting sync loader!");
      setIsSyncing(true);
      
      // Hide loader after successful sync or timeout
      const timer = setTimeout(() => {
        console.log("[OAuthSyncLoader] ⏰ Timeout - hiding loader");
        setIsSyncing(false);
      }, 8000); // Max 8 seconds to allow smooth transition
      
      return () => clearTimeout(timer);
    } else if (isAuthenticated && pathname === "/login") {
      // Keep showing for a bit longer after auth to prevent flash
      console.log("[OAuthSyncLoader] ✅ User authenticated - keeping loader briefly...");
      setTimeout(() => {
        setIsSyncing(false);
      }, 300);
    }
  }, [status, isAuthenticated, pathname]);

  // Show loader during sync
  console.log("[OAuthSyncLoader] Render - isSyncing:", isSyncing);
  
  if (!isSyncing) {
    return null;
  }
  
  console.log("[OAuthSyncLoader] 🎉 Showing loader!");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center min-h-screen" style={{ background: "var(--background)" }}>
      <motion.div 
        className="flex flex-col items-center gap-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Shield with HR text */}
        <div className="relative flex items-center justify-center">
          <Shield size={120} className="text-blue-500" strokeWidth={1.5} />
          <span className="absolute text-blue-600 font-bold text-3xl">HR</span>
        </div>
        
        {/* Loading dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-blue-500"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
