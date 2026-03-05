"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Wrench, Clock, Eye } from "lucide-react";

export function MaintenanceScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuthStore();
  const [countdownTime, setCountdownTime] = useState<string>("");
  
  // Get organizationId from user store, URL params, or localStorage
  const userOrgId = user?.organizationId;
  const urlOrgId = searchParams?.get("org");
  const storedOrgId = typeof window !== "undefined" ? localStorage.getItem("lastOrganizationId") : null;
  const organizationId = userOrgId || urlOrgId || storedOrgId;

  // Store organization ID on mount for use after logout
  useEffect(() => {
    if (userOrgId && typeof window !== "undefined") {
      localStorage.setItem("lastOrganizationId", userOrgId);
    }
  }, [userOrgId]);

  // Fetch maintenance mode status
  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId ? { organizationId: organizationId as any } : "skip"
  );

  // Update countdown timer
  useEffect(() => {
    if (!maintenance?.isActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const startTime = maintenance.startTime;
      const endTime = maintenance.endTime || startTime + (maintenance.estimatedDuration ? calculateDuration(maintenance.estimatedDuration) : 3600000);
      
      if (now >= endTime) {
        setCountdownTime("Обслуживание завершено...");
        clearInterval(interval);
      } else {
        const remaining = endTime - now;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        if (hours > 0) {
          setCountdownTime(`${hours}ч ${minutes}м`);
        } else if (minutes > 0) {
          setCountdownTime(`${minutes}м ${seconds}с`);
        } else {
          setCountdownTime(`${seconds}с`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [maintenance?.isActive, maintenance?.startTime, maintenance?.endTime, maintenance?.estimatedDuration]);

  // Check if maintenance banner should be shown:
  // 1. If maintenance=true in URL (after automatic logout)
  // 2. If maintenance has started and user is logged in (not superadmin)
  const isForcedMaintenancePage = searchParams?.get("maintenance") === "true";
  const now = Date.now();
  const maintenanceStarted = maintenance?.isActive && maintenance?.startTime && now >= maintenance.startTime;
  const shouldShow = isForcedMaintenancePage || (maintenanceStarted && user && user.role !== "superadmin");
  
  if (!shouldShow || !maintenance?.isActive) {
    return null;
  }

  const maintenanceIcon = maintenance.icon || "🔧";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "var(--background)",
      }}
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/5 dark:bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/5 dark:bg-red-600/10 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-lg mx-auto px-6 text-center">
        {/* Icon with animation */}
        <div className="mb-6 flex justify-center">
          <div 
            className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 dark:from-orange-500 dark:to-red-600 flex items-center justify-center text-4xl animate-bounce"
            style={{ animationDuration: "2s" }}
          >
            {maintenanceIcon}
          </div>
        </div>

        {/* Title */}
        <h1
          className="text-4xl md:text-5xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          🔴 Техническое обслуживание
        </h1>

        {/* Maintenance message */}
        <div
          className="mb-6 p-6 rounded-xl border-l-4"
          style={{
            backgroundColor: "var(--background-subtle)",
            borderColor: "#f97316",
            borderLeftColor: "#f97316",
            color: "var(--text-primary)",
          }}
        >
          <p className="text-lg leading-relaxed mb-4">
            {maintenance.title}
          </p>
          <p style={{ color: "var(--text-muted)" }} className="text-sm">
            {maintenance.message}
          </p>
        </div>

        {/* Maintenance details */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* Start time */}
          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: "var(--background-subtle)",
            }}
          >
            <div className="flex items-center gap-2 mb-2" style={{ color: "var(--text-muted)" }}>
              <Clock className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide font-semibold">Начало</span>
            </div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {new Date(maintenance.startTime).toLocaleString("ru-RU", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Estimated duration */}
          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: "var(--background-subtle)",
            }}
          >
            <div className="flex items-center gap-2 mb-2" style={{ color: "var(--text-muted)" }}>
              <Wrench className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide font-semibold">Длительность</span>
            </div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {maintenance.estimatedDuration || "Не указана"}
            </p>
          </div>
        </div>

        {/* Countdown timer if available */}
        {countdownTime && (
          <div
            className="mb-8 p-6 rounded-xl border"
            style={{
              backgroundColor: "rgba(249, 115, 22, 0.1)",
              borderColor: "#f97316",
            }}
          >
            <div
              className="flex items-center justify-center gap-2 mb-2"
              style={{ color: "#f97316" }}
            >
              <Clock className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Оставшееся время</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: "#f97316" }}>
              {countdownTime}
            </p>
          </div>
        )}

        {/* Info message */}
        <div
          className="mb-8 p-4 rounded-lg border"
          style={{
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            borderColor: "var(--primary)",
            color: "var(--primary)",
          }}
        >
          <div className="flex items-center gap-2 justify-center">
            <Eye className="w-4 h-4" />
            <p className="text-sm">
              Техническое обслуживание в процессе. Вы будете перенаправлены автоматически...
            </p>
          </div>
        </div>

        {/* Contact info */}
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          <p>Спасибо за терпение 🙏</p>
          <p className="mt-2 text-xs">Если у вас есть вопросы, обратитесь к администратору</p>
        </div>

        {/* Sign Out button */}
        <div className="mt-8">
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 active:scale-95"
            style={{
              backgroundColor: "#f97316",
              color: "white",
              backgroundImage: "linear-gradient(to right, #f97316, #ea580c)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
          >
            Выход
          </button>
        </div>
      </div>
    </div>
  );
}

function calculateDuration(duration: string | undefined): number {
  if (!duration) return 3600000; // 1 hour default

  const match = duration.match(/(\d+)/);
  const amount = match ? parseInt(match[1]) : 1;

  if (duration.includes("hour")) return amount * 3600000;
  if (duration.includes("minute")) return amount * 60000;
  if (duration.includes("2 hour")) return 2 * 3600000;
  if (duration.includes("3 hour")) return 3 * 3600000;
  if (duration.includes("4 hour")) return 4 * 3600000;

  return 3600000;
}
