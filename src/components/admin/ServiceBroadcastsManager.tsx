"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit2, Trash2, MessageCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { Id } from "../../../convex/_generated/dataModel";

interface ServiceBroadcastsManagerProps {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
}

export function ServiceBroadcastsManager({
  organizationId,
  userId,
}: ServiceBroadcastsManagerProps) {
  const broadcasts = useQuery(api.chat.getServiceBroadcasts, {
    organizationId,
  });

  const deleteMessage = useMutation(api.chat.deleteMessage);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<
    Id<"chatMessages"> | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (broadcastId: Id<"chatMessages">) => {
    setSelectedBroadcastId(broadcastId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedBroadcastId) return;

    try {
      setIsDeleting(true);
      console.log(`[ServiceBroadcastsManager] Deleting broadcast ${selectedBroadcastId} by user ${userId}`);
      await deleteMessage({
        messageId: selectedBroadcastId,
        userId,
        deleteForEveryone: true,
      });
      console.log(`[ServiceBroadcastsManager] ✓ Broadcast deleted successfully`);
      setDeleteDialogOpen(false);
      setSelectedBroadcastId(null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[ServiceBroadcastsManager] ✗ Failed to delete broadcast:", errorMsg);
      alert(`Не удалось удалить объявление: ${errorMsg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!broadcasts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            История объявлений
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Загрузка...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            История объявлений
          </CardTitle>
          <CardDescription>
            Нет отправленных объявлений в этой организации
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Создавайте новые объявления, используя кнопку выше →
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            История объявлений ({broadcasts.length})
          </CardTitle>
          <CardDescription>
            Просмотр, редактирование и удаление отправленных сообщений
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {broadcasts.map((broadcast) => (
              <div
                key={broadcast._id}
                className="flex items-start justify-between gap-4 p-4 rounded-lg transition-colors"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--card-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
              >
                {/* Left: Icon & Content */}
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-2xl flex-shrink-0 pt-1">
                    {broadcast.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-semibold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {broadcast.title}
                    </div>
                    <p
                      className="text-sm line-clamp-2 mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {broadcast.content}
                    </p>
                    <div
                      className="flex items-center gap-4 mt-2 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(broadcast.createdAt), "d MMM yyyy, HH:mm", {
                          locale: ru,
                        })}
                      </div>
                      <div>
                        от{" "}
                        <span
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {broadcast.senderName}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled
                    title="Редактирование объявлений вскоре"
                    style={{
                      backgroundColor: "var(--background-subtle)",
                      borderColor: "var(--border)",
                      color: "var(--text-muted)",
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "var(--card-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--background-subtle)";
                    }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDeleteClick(broadcast._id)}
                    style={{
                      backgroundColor: "var(--destructive)",
                      color: "var(--destructive-foreground)",
                      borderColor: "var(--destructive)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = "0.9";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = "1";
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Удалить</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          style={{
            backgroundColor: "var(--popover)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-primary)" }}>
              Удалить объявление?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-muted)" }}>
              Это объявление будет удалено для всех пользователей организации. Это действие не может быть отменено.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel
            type="button"
            disabled={isDeleting}
            onClick={() => setDeleteDialogOpen(false)}
            style={{
              backgroundColor: "var(--background-subtle)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "var(--card-hover)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "var(--background-subtle)";
            }}
          >
            Отменить
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            style={{
              backgroundColor: "var(--destructive)",
              color: "var(--destructive-foreground)",
              borderColor: "var(--destructive)",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                (e.currentTarget as HTMLElement).style.opacity = "0.9";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
          >
            {isDeleting ? "Удаление..." : "Удалить навсегда"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
