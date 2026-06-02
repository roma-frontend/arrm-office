/**
 * Corporate Trip Request Fields Component
 * Priority, Category, Cost Center, Business Justification
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Briefcase, DollarSign, FileText } from 'lucide-react';

interface CorporateTripFieldsProps {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  tripCategory:
    | 'client_meeting'
    | 'airport'
    | 'office_transfer'
    | 'emergency'
    | 'team_event'
    | 'personal';
  costCenter: string;
  businessJustification: string;
  requiresApproval: boolean;
  onPriorityChange: (value: 'P0' | 'P1' | 'P2' | 'P3') => void;
  onCategoryChange: (
    value:
      | 'client_meeting'
      | 'airport'
      | 'office_transfer'
      | 'emergency'
      | 'team_event'
      | 'personal',
  ) => void;
  onCostCenterChange: (value: string) => void;
  onBusinessJustificationChange: (value: string) => void;
  onRequiresApprovalChange: (value: boolean) => void;
}

export function CorporateTripFields({
  priority,
  tripCategory,
  costCenter,
  businessJustification,
  requiresApproval,
  onPriorityChange,
  onCategoryChange,
  onCostCenterChange,
  onBusinessJustificationChange,
  onRequiresApprovalChange,
}: CorporateTripFieldsProps) {
  const { t } = useTranslation();

  const priorityLabels = {
    P0: {
      label: t('driver.executive'),
      desc: t('driver.immediateResponse'),
      color: 'text-red-600',
    },
    P1: { label: t('driver.client'), desc: t('driver.clientFacing'), color: 'text-orange-600' },
    P2: { label: t('driver.standard'), desc: t('driver.internalMeetings'), color: 'text-blue-600' },
    P3: { label: t('driver.personal'), desc: t('driver.nonUrgent'), color: 'text-gray-600' },
  };

  const categoryLabels = {
    client_meeting: t('driver.clientMeeting'),
    airport: t('driver.airportTransfer'),
    office_transfer: t('driver.officeTransfer'),
    emergency: t('driver.emergency'),
    team_event: t('driver.teamEvent'),
    personal: t('driver.personalTrip'),
  };

  const needsApproval = priority === 'P0' || priority === 'P1' || tripCategory === 'emergency';

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-6">
        <Briefcase className="w-4 h-4" />
        {t('driver.corporateTripDetails')}
      </div>

      {/* Priority */}
      <div className="flex flex-col gap-2">
        <Label>{t('driver.tripPriority')}</Label>
        <Select
          value={priority}
          onValueChange={(v) => onPriorityChange(v as 'P0' | 'P1' | 'P2' | 'P3')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(priorityLabels).map(([key, { label, desc, color }]) => (
              <SelectItem key={key} value={key}>
                <div className="flex flex-col">
                  <span className={color}>{label}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <Label>{t('driver.tripCategory')}</Label>
        <Select
          value={tripCategory}
          onValueChange={(v) =>
            onCategoryChange(
              v as
                | 'client_meeting'
                | 'airport'
                | 'office_transfer'
                | 'emergency'
                | 'team_event'
                | 'personal',
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cost Center */}
      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          {t('driver.costCenter')}{' '}
          <span className="text-muted-foreground">{t('driver.costCenterOptional')}</span>
        </Label>
        <Input
          value={costCenter}
          onChange={(e) => onCostCenterChange(e.target.value)}
          placeholder="e.g., MKTG-001, ENG-002"
        />
      </div>

      {/* Business Justification */}
      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {t('driver.businessJustification')}
        </Label>
        <Textarea
          value={businessJustification}
          onChange={(e) => onBusinessJustificationChange(e.target.value)}
          placeholder="Brief description..."
          rows={3}
        />
      </div>

      {/* Approval Notice */}
      {needsApproval && (
        <Alert variant="info" className="bg-blue-50 border-blue-200">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-900">
            {t('driver.requiresApprovalDesc', {
              reason:
                priority === 'P0' || priority === 'P1'
                  ? t('driver.highPriority')
                  : t('driver.emergencyCategory'),
            })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
