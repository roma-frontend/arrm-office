"use client";

import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, CheckCircle, Clock, Power } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceBroadcastDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId?: Id<"organizations"> | string;
    userId?: Id<"users"> | string;
}

const BROADCAST_ICONS = [
    { icon: "ℹ️", label: "Information" },
    { icon: "⚠️", label: "Warning" },
    { icon: "🔧", label: "Maintenance" },
    { icon: "🚨", label: "Urgent" },
    { icon: "🎉", label: "Announcement" },
    { icon: "🔒", label: "Security" },
    { icon: "📢", label: "Broadcast" },
    { icon: "🔄", label: "Update" },
];

const DURATION_OPTIONS = [
    { label: "30 минут", value: "30 minutes" },
    { label: "1 час", value: "1 hour" },
    { label: "2 часа", value: "2 hours" },
    { label: "3 часа", value: "3 hours" },
    { label: "4 часа", value: "4 hours" },
    { label: "Неизвестно", value: undefined },
];

export function ServiceBroadcastDialog({
    open,
    onOpenChange,
    organizationId,
    userId,
}: ServiceBroadcastDialogProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("⚠️");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");

    // Schedule & Maintenance
    const [scheduleDateTime, setScheduleDateTime] = useState("");
    const [estimatedDuration, setEstimatedDuration] = useState<string | undefined>();
    const [scheduleMaintenance, setScheduleMaintenance] = useState(false);
    
    // Organization selection
    const [broadcastScope, setBroadcastScope] = useState<"all" | "specific">("specific");
    const [selectedOrgId, setSelectedOrgId] = useState<string>(organizationId as string);
    
    const organizations = useQuery(api.organizations.getAllOrganizations, 
      userId ? { superadminUserId: userId as Id<"users"> } : "skip"
    );

    const sendBroadcast = useMutation(api.admin.sendServiceBroadcast);
    const enableMaintenanceMode = useMutation(api.admin.enableMaintenanceMode);

    const handleSend = async () => {
        if (!title.trim() || !content.trim()) {
            setStatus("error");
            setErrorMessage("Заполните заголовок и сообщение");
            return;
        }

        if (scheduleMaintenance && !scheduleDateTime) {
            setStatus("error");
            setErrorMessage("Укажите время начала обслуживания");
            return;
        }

        if (!organizationId || !userId) {
            setStatus("error");
            setErrorMessage("Организация не загружена");
            return;
        }

        setLoading(true);
        setStatus("idle");

        try {
            // Determine which organizations to broadcast to
            const targetOrgs = broadcastScope === "all" 
                ? organizations?.map(o => o._id) ?? []
                : [selectedOrgId as Id<"organizations">];
            
            console.log(`[ServiceBroadcast] Broadcasting to ${targetOrgs.length} organizations`);
            console.log(`[ServiceBroadcast] Scope: ${broadcastScope}`);
            if (organizations) {
                console.log(`[ServiceBroadcast] Available organizations: ${organizations.length}`);
                organizations.forEach(org => console.log(`  - ${org.name || org._id}`));
            }
            
            // Calculate delay if scheduled maintenance
            const now = Date.now();
            const scheduledTime = scheduleDateTime ? new Date(scheduleDateTime).getTime() : now;
            
            // Build message content with maintenance timing if enabled
            let broadcastContent = content.trim();
            if (scheduleMaintenance && scheduleDateTime) {
                const scheduledDate = new Date(scheduledTime);
                const timeStr = scheduledDate.toLocaleString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                broadcastContent = `${content.trim()}\n\n⏰ Техническое обслуживание начнётся в: ${timeStr}`;
                if (estimatedDuration) {
                    broadcastContent += `\n⏱️ Примерная длительность: ${estimatedDuration}`;
                }
            }
            
            // Send broadcast immediately to all organizations
            for (const orgId of targetOrgs) {
                console.log(`[ServiceBroadcast] Sending broadcast to organization: ${orgId}`);
                await sendBroadcast({
                    organizationId: orgId,
                    userId: userId as Id<"users">,
                    title: title.trim(),
                    content: broadcastContent,
                    icon: selectedIcon,
                });
            }
            
            // Schedule maintenance mode to be enabled at the specified time if needed
            if (scheduleMaintenance && scheduleDateTime) {
                const delay = Math.max(0, scheduledTime - now);
                setTimeout(async () => {
                    try {
                        for (const orgId of targetOrgs) {
                            await enableMaintenanceMode({
                                organizationId: orgId,
                                userId: userId as Id<"users">,
                                title: title.trim(),
                                message: broadcastContent,
                                startTime: scheduledTime,
                                estimatedDuration: estimatedDuration,
                                icon: selectedIcon,
                            });
                        }
                    } catch (err) {
                        console.error("Error enabling maintenance mode:", err);
                    }
                }, delay);
            }

            setStatus("success");
            setTitle("");
            setContent("");
            setSelectedIcon("⚠️");
            setScheduleDateTime("");
            setEstimatedDuration(undefined);
            setScheduleMaintenance(false);

            // Close dialog after 2 seconds
            setTimeout(() => {
                onOpenChange(false);
                setStatus("idle");
            }, 2000);
        } catch (error) {
            setStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Ошибка при отправке");
        } finally {
            setLoading(false);
        }
    };

    // Get minimum datetime (now)
    const now = new Date();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Отправить сервисное сообщение</DialogTitle>
                    <DialogDescription>
                        Отправьте официальное объявление всем пользователям организации
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Organization Selection */}
                    <div>
                        <label className="text-sm font-medium block mb-3">Целевая аудитория</label>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <input
                                    type="radio"
                                    id="broadcast-all"
                                    name="broadcast-scope"
                                    checked={broadcastScope === "all"}
                                    onChange={() => setBroadcastScope("all")}
                                    disabled={loading}
                                    className="w-4 h-4"
                                />
                                <label htmlFor="broadcast-all" className="text-sm cursor-pointer font-medium">
                                    📢 Все организации ({organizations?.length ?? 0})
                                </label>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="radio"
                                    id="broadcast-specific"
                                    name="broadcast-scope"
                                    checked={broadcastScope === "specific"}
                                    onChange={() => setBroadcastScope("specific")}
                                    disabled={loading}
                                    className="w-4 h-4"
                                />
                                <label htmlFor="broadcast-specific" className="text-sm cursor-pointer font-medium">
                                    🏢 Конкретная организация
                                </label>
                            </div>
                            
                            {broadcastScope === "specific" && organizations && (
                                <div className="ml-7 mt-2">
                                    <select
                                        value={selectedOrgId as string}
                                        onChange={(e) => setSelectedOrgId(e.target.value)}
                                        disabled={loading}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={{
                                            borderColor: "var(--border)",
                                            background: "var(--background-subtle)",
                                            color: "var(--text-primary)"
                                        }}
                                    >
                                        {organizations.map((org) => (
                                            <option key={org._id} value={org._id}>
                                                {org.name} ({org.activeEmployees ?? org.memberCount ?? 0} сотрудников)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t" style={{ borderColor: "var(--border)" }} />

                    {/* Icon Selection */}
                    <div>
                        <label className="text-sm font-medium block mb-3">Иконка</label>
                        <div className="grid grid-cols-4 gap-2">
                            {BROADCAST_ICONS.map(({ icon, label }) => (
                                <button
                                    key={icon}
                                    onClick={() => setSelectedIcon(icon)}
                                    className={cn(
                                        "p-3 rounded-lg border-2 transition-all text-2xl hover:scale-105"
                                    )}
                                    style={{
                                        borderColor: selectedIcon === icon ? "var(--primary)" : "transparent",
                                        backgroundColor: selectedIcon === icon ? "var(--primary)" : "var(--background)",
                                        opacity: selectedIcon === icon ? 0.15 : 1,
                                    }}
                                    title={label}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-sm font-medium block mb-2">Заголовок</label>
                        <Input
                            placeholder="Например: Плановое обслуживание системы"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={loading}
                            className="text-base"
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="text-sm font-medium block mb-2">Сообщение</label>
                        <Textarea
                            placeholder="Введите текст сообщения, которое получат все пользователи..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            disabled={loading}
                            rows={5}
                            className="resize-none text-sm"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                            Все активные пользователи получат это сообщение в канале "System Announcements"
                        </div>
                    </div>

                    {/* Divider */}
                    <div style={{ borderColor: "var(--border)" }} className="border-t pt-4" />

                    {/* Maintenance Mode Schedule */}
                    <div
                      style={{
                        backgroundColor: "rgba(249, 115, 22, 0.08)",
                        borderColor: "#f97316",
                      }}
                      className="p-4 rounded-lg border"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex items-center gap-3 flex-1">
                                <Power className="w-5 h-5" style={{ color: "#f97316" }} />
                                <div className="flex-1">
                                    <label className="text-sm font-semibold block cursor-pointer" style={{ color: "#f97316" }}>
                                        <input
                                            type="checkbox"
                                            checked={scheduleMaintenance}
                                            onChange={(e) => setScheduleMaintenance(e.target.checked)}
                                            disabled={loading}
                                            className="mr-2"
                                            style={{ accentColor: "#f97316" }}
                                        />
                                        📴 Запланировать техническое обслуживание
                                    </label>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Отправить сообщение сейчас, а режим обслуживания включить в определённое время
                                    </p>
                                </div>
                            </div>
                        </div>

                        {scheduleMaintenance && (
                            <div className="mt-4 space-y-3 ml-8">
                                {/* Schedule Time */}
                                <div>
                                    <label className="text-sm font-medium flex items-center gap-2 mb-2">
                                        <Clock className="w-4 h-4" />
                                        Время начала обслуживания
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={scheduleDateTime}
                                        onChange={(e) => setScheduleDateTime(e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                        disabled={loading}
                                        className="text-base"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {scheduleDateTime
                                            ? `Обслуживание начнется: ${new Date(scheduleDateTime).toLocaleString('ru-RU')}`
                                            : "Выберите время начала обслуживания"
                                        }
                                    </p>
                                </div>

                                {/* Estimated Duration */}
                                <div>
                                    <label className="text-sm font-medium block mb-2">Примерная длительность</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {DURATION_OPTIONS.map((option) => (
                                            <button
                                                key={option.value || "unknown"}
                                                onClick={() => setEstimatedDuration(option.value)}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg border-2 text-sm transition-all",
                                                    estimatedDuration === option.value
                                                        ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"
                                                        : "border-transparent bg-background hover:border-border text-foreground"
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status Messages */}
                    {status === "error" && (
                        <div
                          className="flex items-center gap-2 p-3 rounded-lg"
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "var(--destructive)",
                          }}
                        >
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span className="text-sm">{errorMessage}</span>
                        </div>
                    )}

                    {status === "success" && (
                        <div
                          className="flex items-center gap-2 p-3 rounded-lg"
                          style={{
                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                            color: "var(--success)",
                          }}
                        >
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            <span className="text-sm">
                                {scheduleMaintenance
                                    ? "Сообщение отправлено! Техническое обслуживание автоматически включится в указанное время."
                                    : "Сообщение успешно отправлено всем пользователям!"
                                }
                            </span>
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderTopColor: "var(--border)" }}>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Отмена
                        </Button>
                        <Button
                            onClick={handleSend}
                            disabled={loading || !title.trim() || !content.trim() || (scheduleMaintenance && !scheduleDateTime)}
                            className="gap-2"
                            style={{
                              backgroundColor: scheduleMaintenance ? "#f97316" : "var(--primary)",
                              color: "white",
                            }}
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {loading
                                ? "Отправка..."
                                : scheduleMaintenance
                                    ? "Отправить и запланировать обслуживание"
                                    : "Отправить всем"
                            }
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
