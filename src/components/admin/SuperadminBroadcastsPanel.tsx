"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ServiceBroadcastDialog } from "./ServiceBroadcastDialog";
import { ServiceBroadcastsManager } from "./ServiceBroadcastsManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, MessageSquare } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface SuperadminBroadcastsPanelProps {
  organizationId?: Id<"organizations">;
  userId?: Id<"users">;
}

/**
 * SuperAdmin Service Broadcasts Panel
 * Allows superadmin to send official company-wide announcements and manage them
 */
export function SuperadminBroadcastsPanel({ organizationId, userId }: SuperadminBroadcastsPanelProps) {
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  
  const currentUser = useQuery(api.users.getCurrentUser, {});

  const finalOrgId = organizationId || currentUser?.organizationId;
  const finalUserId = userId || currentUser?._id;

  // Don't render if we don't have the required data
  if (!finalOrgId || !finalUserId) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Broadcast creation card */}
      <Card
        style={{
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.08)",
        }}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" style={{ color: "#f97316" }} />
              <div>
                <CardTitle>Сервисные Объявления</CardTitle>
                <CardDescription>
                  Отправляйте официальные сообщения всем пользователям
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => setBroadcastDialogOpen(true)}
              className="gap-2"
              size="sm"
            >
              <MessageSquare className="w-4 h-4" />
              Новое объявление
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="prose dark:prose-invert text-sm max-w-none">
            <p className="text-muted-foreground">
              Все активные пользователи организации получат ваше сообщение в специальном канале 
              <strong style={{ color: "var(--text-primary)" }}> &quot;System Announcements&quot; </strong>
              с серьезным видом, иконкой и заголовком.
            </p>
            
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold" style={{ color: "var(--text-primary)" }}>Типичные сценарии:</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>🔧 Объявления об обслуживании и обновлениях</li>
                <li>⚠️ Предупреждения о сбоях или проблемах</li>
                <li>🔒 Сообщения о безопасности</li>
                <li>🎉 Важные объявления и благодарности</li>
                <li>🚨 Критические и срочные уведомления</li>
              </ul>
            </div>
          </div>
        </CardContent>

        {/* Dialog для создания нового объявления */}
        <ServiceBroadcastDialog
          open={broadcastDialogOpen}
          onOpenChange={setBroadcastDialogOpen}
          organizationId={finalOrgId}
          userId={finalUserId}
        />
      </Card>

      {/* Broadcasts management card */}
      <ServiceBroadcastsManager
        organizationId={finalOrgId}
        userId={finalUserId}
      />
    </div>
  );
}
