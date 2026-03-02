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
      }, 5000); // Max 5 seconds
      
      return () => clearTimeout(timer);
    } else if (isAuthenticated) {
      console.log("[OAuthSyncLoader] ✅ User authenticated - hiding loader");
      setIsSyncing(false);
    }
  }, [status, isAuthenticated, pathname]);

  // Show loader during sync
  console.log("[OAuthSyncLoader] Render - isSyncing:", isSyncing);
  
  if (!isSyncing) {
    return null;
  }
  
  console.log("[OAuthSyncLoader] 🎉 Showing loader!");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-[#020817] via-[#0a0f2e] to-[#120820]">
      <div className="flex flex-col items-center gap-6">
        {/* Animated logo */}
        <motion.div
          className="relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* Rotating ring */}
          <motion.div
            className="absolute inset-0 w-24 h-24 rounded-full border-4 border-transparent border-t-blue-500 border-r-sky-400"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />

          {/* Logo */}
          <motion.div
            className="w-24 h-24 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)' }}
            animate={{
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 20px rgba(59,130,246,0.5)',
                '0 0 40px rgba(139,92,246,0.8)',
                '0 0 20px rgba(59,130,246,0.5)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Shield size={40} className="text-white" />
          </motion.div>
        </motion.div>

        {/* Loading text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-3"
        >
          <span className="text-white font-bold text-xl">
            HR<span className="text-blue-400">Office</span>
          </span>

          {/* Animated dots */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-blue-400"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
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

        {/* Loading message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-blue-200/50 text-sm"
        >
          Signing you in with Google...
        </motion.p>
      </div>
    </div>
  );
}
