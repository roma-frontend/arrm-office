"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Mail, Phone, Building2, Calendar, Briefcase, Star, Clock, Target, Award, AlertTriangle, Plus } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { format } from "date-fns";
import { useAuthStore } from "@/store/useAuthStore";
import { SupervisorRatingForm } from "@/components/attendance/SupervisorRatingForm";

interface EmployeeProfileDetailProps {
  employeeId: Id<"users">;
}

export default function EmployeeProfileDetail({ employeeId }: EmployeeProfileDetailProps) {
  const { user: currentUser } = useAuthStore();
  const [showRatingForm, setShowRatingForm] = useState(false);

  const employee = useQuery(api.users.getUserById, { userId: employeeId });
  const profile = useQuery(api.employeeProfiles.getEmployeeProfile, { userId: employeeId });
  const score = useQuery(api.aiEvaluator.calculateEmployeeScore, { userId: employeeId });
  const latestRating = useQuery(api.supervisorRatings.getLatestRating, { employeeId });
  const monthlyStats = useQuery(api.timeTracking.getMonthlyStats, {
    userId: employeeId,
    month: new Date().toISOString().slice(0, 7),
  });
  const ratingHistory = useQuery(api.supervisorRatings.getEmployeeRatings, { employeeId, limit: 3 });

  const isAdminOrSupervisor = currentUser?.role === "admin" || currentUser?.role === "supervisor";

  const renderStars = (rating: number) =>
    [1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
      />
    ));

  if (!employee) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-[var(--text-muted)]">Loading employee profile...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-[#2563eb] to-[#0ea5e9] flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                {(employee as any).avatarUrl ? (
                  <img src={(employee as any).avatarUrl} alt={employee.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  employee.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                )}
              </div>
              <div>
                <CardTitle className="text-2xl">{employee.name}</CardTitle>
                <p className="text-[var(--text-muted)] text-sm mt-1">{employee.position || "Employee"}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant={employee.role === "admin" ? "default" : "secondary"}>
                    {employee.role}
                  </Badge>
                  <Badge variant="outline">{employee.employeeType}</Badge>
                  <Badge variant={employee.isActive ? "success" : "destructive"}>
                    {employee.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {score && (
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">AI Score</p>
                  <p className="text-3xl font-bold text-[var(--primary)]">{score.overallScore}/100</p>
                </div>
              )}
              {isAdminOrSupervisor && (
                <Button
                  size="sm"
                  onClick={() => setShowRatingForm(!showRatingForm)}
                  className="bg-gradient-to-r from-blue-600 to-sky-700 hover:from-blue-700 hover:to-sky-800 text-white"
                >
                  <Star className="w-4 h-4 mr-1" />
                  {showRatingForm ? "Cancel Rating" : "Rate Performance"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-[var(--text-muted)]" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Email</p>
              <p className="text-sm font-medium">{employee.email}</p>
            </div>
          </div>
          {employee.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-[var(--text-muted)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Phone</p>
                <p className="text-sm font-medium">{employee.phone}</p>
              </div>
            </div>
          )}
          {employee.department && (
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-[var(--text-muted)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">Department</p>
                <p className="text-sm font-medium">{employee.department}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[var(--text-muted)]" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Joined</p>
              <p className="text-sm font-medium">{format(new Date(employee.createdAt), "MMM d, yyyy")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supervisor Rating Form (inline) */}
      {isAdminOrSupervisor && showRatingForm && (
        <SupervisorRatingForm
          employeeId={employeeId}
          employeeName={employee.name}
          onClose={() => setShowRatingForm(false)}
          onSuccess={() => setShowRatingForm(false)}
        />
      )}

      {/* This Month's Attendance Stats */}
      {monthlyStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              This Month's Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-blue-500">{monthlyStats.totalDays}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Days Worked</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-green-500">{monthlyStats.totalWorkedHours}h</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Total Hours</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-2xl font-bold text-sky-400">{monthlyStats.punctualityRate}%</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Punctuality</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--background-subtle)]">
                <p className={`text-2xl font-bold ${Number(monthlyStats.lateDays) > 0 ? "text-red-500" : "text-green-500"}`}>
                  {monthlyStats.lateDays}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Late Days</p>
              </div>
            </div>
            {(Number(monthlyStats.lateDays) > 0 || Number(monthlyStats.earlyLeaveDays) > 0) && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <p className="text-sm text-orange-700 dark:text-orange-200">
                  {Number(monthlyStats.lateDays) > 0 && `${monthlyStats.lateDays} late arrival(s)`}
                  {Number(monthlyStats.lateDays) > 0 && Number(monthlyStats.earlyLeaveDays) > 0 && " · "}
                  {Number(monthlyStats.earlyLeaveDays) > 0 && `${monthlyStats.earlyLeaveDays} early leave(s)`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Latest Performance Rating */}
      {latestRating && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                Latest Performance Rating
              </CardTitle>
              <div className="text-right">
                <p className="text-2xl font-bold text-[var(--primary)]">
                  {latestRating.overallRating.toFixed(1)}
                  <span className="text-sm font-normal text-[var(--text-muted)]">/5</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  by {latestRating.supervisor?.name ?? "Supervisor"} · {latestRating.ratingPeriod}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: t('dashboard.qualityOfWork'), value: latestRating.qualityOfWork },
              { label: t('dashboard.efficiency'), value: latestRating.efficiency },
              { label: t('dashboard.teamwork'), value: latestRating.teamwork },
              { label: t('dashboard.initiative'), value: latestRating.initiative },
              { label: t('dashboard.communication'), value: latestRating.communication },
              { label: t('dashboard.reliability'), value: latestRating.reliability },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)] w-36">{label}</span>
                <div className="flex items-center gap-2">
                  <div className="flex">{renderStars(value)}</div>
                  <span className="text-sm font-semibold w-5 text-right" style={{ color: "var(--text-primary)" }}>
                    {value}
                  </span>
                </div>
              </div>
            ))}
            {latestRating.strengths && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">💪 Strengths</p>
                <p className="text-sm text-green-700 dark:text-green-300">{latestRating.strengths}</p>
              </div>
            )}
            {latestRating.areasForImprovement && (
              <div className="mt-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">📈 Areas for Improvement</p>
                <p className="text-sm text-orange-700 dark:text-orange-300">{latestRating.areasForImprovement}</p>
              </div>
            )}
            {latestRating.generalComments && (
              <div className="mt-2 p-3 rounded-lg bg-[var(--background-subtle)]">
                <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">💬 Comments</p>
                <p className="text-sm text-[var(--text-primary)]">{latestRating.generalComments}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rating History */}
      {ratingHistory && ratingHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rating History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ratingHistory.map((rating) => (
                <div
                  key={rating._id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {rating.ratingPeriod}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      by {rating.supervisor?.name ?? "Supervisor"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(rating.overallRating)}</div>
                    <span className="text-sm font-bold text-[var(--primary)]">
                      {rating.overallRating.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No rating yet */}
      {latestRating === null && isAdminOrSupervisor && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Star className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
            <p className="text-sm text-[var(--text-muted)]">No performance rating yet</p>
            <Button
              size="sm"
              className="mt-3 bg-gradient-to-r from-blue-600 to-sky-700 text-white"
              onClick={() => setShowRatingForm(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Rating
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Leave Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leave Balances</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#2563eb]">{employee.paidLeaveBalance}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Paid Leave</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#ef4444]">{employee.sickLeaveBalance}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Sick Leave</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#10b981]">{employee.familyLeaveBalance}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Family Leave</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Performance Breakdown */}
      {score && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-[var(--primary)]" />
              Performance Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Performance</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{score.breakdown.performance}%</p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Attendance</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{score.breakdown.attendance}%</p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Behavior</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{score.breakdown.behavior}%</p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Leave History</p>
              <p className="text-2xl font-bold text-[var(--primary)]">{score.breakdown.leaveHistory}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Biography */}
      {profile?.profile?.biography && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Biography</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.profile.biography.skills && profile.profile.biography.skills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {profile.profile.biography.skills.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.profile.biography.languages && profile.profile.biography.languages.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {profile.profile.biography.languages.map((lang, i) => (
                    <Badge key={i} variant="outline">{lang}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {profile?.documents && profile.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.documents.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between p-3 bg-[var(--card-hover)] rounded-lg">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-sm font-medium">{doc.fileName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{doc.category}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
