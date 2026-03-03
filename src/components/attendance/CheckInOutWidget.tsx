"use client";

import { useTranslation } from "react-i18next";
import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import { format } from "date-fns";

export function CheckInOutWidget() {
  
  const { t } = useTranslation();
const { user } = useAuthStore();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const todayStatus = useQuery(api.timeTracking.getTodayStatus, 
    user?.id ? { userId: user.id as any } : "skip"
  );

  const checkIn = useMutation(api.timeTracking.checkIn);
  const checkOut = useMutation(api.timeTracking.checkOut);

  // Update current time every second — only on client to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = async () => {
    if (!user?.id) return;
    try {
      await checkIn({ userId: user.id as any });
      toast.success("Checked in successfully! 🎉");
    } catch (error: any) {
      toast.error(error.message || "Failed to check in");
    }
  };

  const handleCheckOut = async () => {
    if (!user?.id) return;
    try {
      await checkOut({ userId: user.id as any });
      toast.success("Checked out successfully! Have a great day! 👋");
    } catch (error: any) {
      toast.error(error.message || "Failed to check out");
    }
  };

  const isCheckedIn = todayStatus?.status === "checked_in";
  const isCheckedOut = todayStatus?.status === "checked_out";

  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), "HH:mm:ss");
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-sky-400 text-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5" />
            {t('attendance.timeTracker')}
          </CardTitle>
          <div className="text-2xl font-mono">
            {currentTime ? format(currentTime, "HH:mm:ss") : "--:--:--"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--background-subtle)]">
          <div>
            <p className="text-sm text-[var(--text-muted)]">Status</p>
            <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {!todayStatus && t('attendance.notCheckedIn')}
              {isCheckedIn && "At Work"}
              {isCheckedOut && "Finished for Today"}
            </p>
          </div>
          <Badge
            variant={isCheckedIn ? "default" : isCheckedOut ? "secondary" : "outline"}
            className={
              isCheckedIn
                ? "bg-green-500 text-white"
                : isCheckedOut
                ? "bg-blue-500 text-white"
                : ""
            }
          >
            {!todayStatus && "Offline"}
            {isCheckedIn && "Online"}
            {isCheckedOut && "Offline"}
          </Badge>
        </div>

        {/* Check In/Out Times */}
        {todayStatus && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="w-4 h-4 text-green-500" />
                <span className="text-xs text-[var(--text-muted)]">Check In</span>
              </div>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatTime(todayStatus.checkInTime)}
              </p>
              {todayStatus.isLate && todayStatus.lateMinutes && (
                <p className="text-xs text-red-500 mt-1">
                  Late by {todayStatus.lateMinutes} min
                </p>
              )}
            </div>

            <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <LogOut className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-[var(--text-muted)]">Check Out</span>
              </div>
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {todayStatus.checkOutTime ? formatTime(todayStatus.checkOutTime) : "—"}
              </p>
              {todayStatus.isEarlyLeave && todayStatus.earlyLeaveMinutes && (
                <p className="text-xs text-orange-500 mt-1">
                  Left {todayStatus.earlyLeaveMinutes} min early
                </p>
              )}
            </div>
          </div>
        )}

        {/* Work Duration */}
        {todayStatus && todayStatus.totalWorkedMinutes && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  Total Worked
                </span>
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatDuration(todayStatus.totalWorkedMinutes)}
              </span>
            </div>
            {todayStatus.overtimeMinutes && todayStatus.overtimeMinutes > 0 && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                +{formatDuration(todayStatus.overtimeMinutes)} overtime 🌟
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {!todayStatus && (
            <Button
              onClick={handleCheckIn}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              size="lg"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Check In
            </Button>
          )}

          {isCheckedIn && (
            <Button
              onClick={handleCheckOut}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              size="lg"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Check Out
            </Button>
          )}

          {isCheckedOut && (
            <div className="flex-1 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 text-center">
              <p className="text-blue-600 dark:text-blue-400 font-medium">
                See you tomorrow! 👋
              </p>
            </div>
          )}
        </div>

        {/* Info Message */}
        {!todayStatus && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {t('ui.notCheckedInWarning')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CheckInOutWidget;
