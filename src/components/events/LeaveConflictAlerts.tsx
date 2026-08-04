/**
 * Leave Conflict Alerts Dashboard
 * Manager interface for reviewing leave conflicts with company events
 */

'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, Users, FileText, ChevronRight } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { logger } from '@/lib/logger';

interface LeaveConflictAlertsProps {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}

interface ConflictAlert {
  _id: Id<'leaveConflictAlerts'>;
  employeeName?: string;
  employeeEmail?: string;
  department?: string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  leaveType?: string;
  eventName?: string;
  eventStartDate?: string | number;
  eventEndDate?: string | number;
  conflictType?: string;
  severity?: string;
  [key: string]: unknown;
}

export function LeaveConflictAlerts({ organizationId, userId }: LeaveConflictAlertsProps) {
  const { t } = useTranslation();
  const [selectedAlert, setSelectedAlert] = useState<ConflictAlert | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const alerts = useQuery(api.events.getLeaveConflictAlerts, {
    organizationId,
    isReviewed: false,
  });

  const reviewedAlerts = useQuery(api.events.getLeaveConflictAlerts, {
    organizationId,
    isReviewed: true,
  });

  const reviewAlert = useMutation(api.events.reviewConflictAlert);

  const handleReview = async (isApproved: boolean) => {
    if (!selectedAlert) return;

    setIsReviewing(true);
    try {
      await reviewAlert({
        alertId: selectedAlert._id,
        adminId: userId,
        isApproved,
        reviewNotes: reviewNotes || undefined,
      });

      setSelectedAlert(null);
      setReviewNotes('');
    } catch (error) {
      logger.error('Failed to review alert:', error);
      toast.error(t('events.reviewFailed', 'Failed to review alert'));
    } finally {
      setIsReviewing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConflictTypeIcon = (type: string) => {
    switch (type) {
      case 'required_employee':
        return <Users className="w-4 h-4 text-red-600" />;
      case 'required_department':
        return <BriefcaseIcon className="w-4 h-4 text-orange-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  if (!alerts || !reviewedAlerts) {
    return (
      <div className="flex items-center justify-center p-8">
        <ShieldLoader size="sm" variant="inline" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            {t('events.pendingConflictReviews', 'Pending Conflict Reviews')} ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{t('events.noPendingConflicts', 'No pending conflict alerts')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert._id}
                  className="p-4 border rounded-lg transition-colors cursor-pointer"
                  onClick={() => setSelectedAlert(alert)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getConflictTypeIcon(alert.conflictType)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{alert.employeeName}</h4>
                          <Badge className={getSeverityColor(alert.severity)}>
                            {(() => {
                              const severity = alert.severity || 'medium';
                              const severityText = t(`events.priority.${severity}`);
                              return typeof severityText === 'string' ? severityText : severity;
                            })()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('events.requestingLeave', 'Requesting leave')}: {alert.leaveStartDate}{' '}
                          → {alert.leaveEndDate}
                        </p>
                        <p className="text-sm text-red-600 font-medium mt-2">
                          {t('events.conflictsWith', 'Conflicts with')}: {alert.eventName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.eventStartDate} → {alert.eventEndDate}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently Reviewed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" />
            {t('events.recentlyReviewed', 'Recently Reviewed')} ({reviewedAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewedAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('events.noReviewedAlerts', 'No reviewed alerts yet')}
            </p>
          ) : (
            <div className="space-y-2">
              {reviewedAlerts.slice(0, 5).map((alert) => (
                <div key={alert._id} className="flex items-center gap-3 text-sm p-2 rounded">
                  {alert.reviewNotes?.includes('Approved') ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="flex-1">
                    {alert.employeeName} - {alert.eventName}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {alert.reviewNotes?.includes('Approved')
                      ? t('common.approved', 'Approved')
                      : t('events.noted', 'Noted')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              {t('events.reviewLeaveConflict', 'Review Leave Conflict')}
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              {/* Employee Info */}
              <div className="p-4 rounded-lg bg-muted/50 border">
                <h4 className="font-semibold text-foreground">
                  {t('events.leaveRequest', 'Leave Request')}
                </h4>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('events.employee', 'Employee')}</p>
                    <p className="font-medium text-foreground">{selectedAlert.employeeName}</p>
                    <p className="text-muted-foreground text-xs">{selectedAlert.employeeEmail}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('events.department', 'Department')}</p>
                    <p className="font-medium text-foreground">{selectedAlert.department}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('events.leaveDates', 'Leave Dates')}</p>
                    <p className="font-medium text-foreground">{selectedAlert.leaveStartDate}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('common.to', 'to')} {selectedAlert.leaveEndDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('events.leaveType', 'Leave Type')}</p>
                    <p className="font-medium text-foreground capitalize">
                      {selectedAlert.leaveType}
                    </p>
                  </div>
                </div>
              </div>

              {/* Event Info */}
              <div className="p-4 rounded-lg bg-muted/50 border">
                <h4 className="font-semibold text-foreground">
                  {t('events.conflictingEvent', 'Conflicting Event')}
                </h4>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('events.event', 'Event')}</p>
                    <p className="font-medium text-foreground">{selectedAlert.eventName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('events.dates', 'Dates')}</p>
                    <p className="font-medium text-foreground">{selectedAlert.eventStartDate}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('common.to', 'to')} {selectedAlert.eventEndDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {t('events.conflictType', 'Conflict Type')}
                    </p>
                    <p className="font-medium text-foreground capitalize">
                      {(() => {
                        const conflictType =
                          (selectedAlert.conflictType as string) || 'required_department';
                        const typeText = t(`events.conflictType.${conflictType}`);
                        return typeof typeText === 'string'
                          ? typeText
                          : conflictType.replace('_', ' ');
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('events.severity', 'Severity')}</p>
                    <Badge className={getSeverityColor(selectedAlert.severity ?? 'medium')}>
                      {(() => {
                        const severity = (selectedAlert.severity as string) || 'medium';
                        const severityText = t(`events.priority.${severity}`);
                        return typeof severityText === 'string' ? severityText : severity;
                      })()}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Review Notes */}
              <div>
                <Label>{t('events.reviewNotes', 'Review Notes')}</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={t(
                    'events.reviewNotesPlaceholder',
                    'Add notes about your decision...',
                  )}
                  rows={3}
                  className="mt-2"
                />
              </div>

              {/* Action Buttons */}
              <DialogFooter className="gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleReview(false)}
                  disabled={isReviewing}
                  className="gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {t('events.flagForDiscussion', 'Flag for Discussion')}
                </Button>
                <Button
                  onClick={() => handleReview(true)}
                  disabled={isReviewing}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('events.approveDespiteConflict', 'Approve Despite Conflict')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper icon component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BriefcaseIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
