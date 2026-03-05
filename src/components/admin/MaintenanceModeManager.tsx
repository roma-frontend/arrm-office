"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Power, PowerOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MaintenanceModeManagerProps {
  organizationId?: Id<"organizations"> | string;
  userId?: Id<"users"> | string;
}

export function MaintenanceModeManager({
  organizationId,
  userId,
}: MaintenanceModeManagerProps) {
  const [disabling, setDisabling] = useState(false);
  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId && userId ? { organizationId: organizationId as Id<"organizations"> } : "skip"
  );
  const disableMaintenanceMode = useMutation(api.admin.disableMaintenanceMode);

  if (maintenance === undefined) {
    return null; // Loading
  }

  if (!maintenance?.isActive) {
    return null; // No active maintenance
  }

  const handleDisable = async () => {
    if (!organizationId || !userId) return;
    setDisabling(true);
    try {
      await disableMaintenanceMode({
        organizationId: organizationId as Id<"organizations">,
        userId: userId as Id<"users">,
      });
    } finally {
      setDisabling(false);
    }
  };

  const startTime = new Date(maintenance.startTime);
  const endTime = maintenance.endTime ? new Date(maintenance.endTime) : null;

  return (
    <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <CardTitle className="text-red-700 dark:text-red-300">🔴 Сайт На Обслуживании</CardTitle>
              <CardDescription>
                {maintenance.title}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Message */}
        <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200">
            {maintenance.message}
          </p>
        </div>

        {/* Timeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Начало обслуживания</p>
            <p className="text-sm font-semibold">
              {startTime.toLocaleString("ru-RU")}
            </p>
          </div>

          {maintenance.estimatedDuration && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Примерная длительность</p>
              <p className="text-sm font-semibold">
                {maintenance.estimatedDuration}
              </p>
            </div>
          )}

          {endTime && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Ожидаемое окончание</p>
              <p className="text-sm font-semibold">
                {endTime.toLocaleString("ru-RU")}
              </p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            ⚠️ <strong>Внимание:</strong> Сайт в настоящее время недоступен для всех пользователей, кроме SuperAdmin.
          </p>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleDisable}
          disabled={disabling}
          className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white gap-2"
        >
          {disabling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Включение сайта...
            </>
          ) : (
            <>
              <PowerOff className="w-4 h-4" />
              ✅ Включить сайт
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Сайт снова станет доступен для всех пользователей
        </p>
      </CardContent>
    </Card>
  );
}
