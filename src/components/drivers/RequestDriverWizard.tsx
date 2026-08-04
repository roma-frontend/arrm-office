/**
 * Request Driver Wizard - Пошаговая форма заказа водителя
 * Использует универсальный Wizard компонент
 */

'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wizard, WizardStep } from '@/components/ui/wizard';
import {
  TextInputStep,
  TextareaStep,
  CardSelectionStep,
} from '@/components/ui/wizard-step-components';
import { Car, MapPin, Clock, Calendar, Users } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useOptimisticDriverRequest } from '@/hooks/useOptimisticActions';
import { logger } from '@/lib/logger';

interface RequestDriverWizardProps {
  userId: Id<'users'>;
  onComplete?: () => void;
  onCancel?: () => void;
  preselectedDriverId?: string;
}

export function RequestDriverWizard({ userId, onComplete, onCancel }: RequestDriverWizardProps) {
  const { t } = useTranslation();
  const { requestOptimistic } = useOptimisticDriverRequest();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;
  const drivers = useQuery(
    api.drivers.queries.getAvailableDrivers,
    organizationId ? { organizationId } : 'skip',
  );

  const [wizardData, setWizardData] = useState<Record<string, string | number | boolean | null>>(
    {},
  );

  const updateStepData = (key: string, value: string | number | boolean | null) => {
    setWizardData((prev) => ({ ...prev, [key]: value }));
  };

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('driverWizard.steps.type.title'),
      description: t('driverWizard.steps.type.description'),
      icon: <Car className="w-5 h-5" />,
      content: (
        <CardSelectionStep
          stepData={wizardData}
          updateStepData={updateStepData}
          field="tripCategory"
          label={t('driverWizard.steps.type.typeLabel')}
          options={[
            {
              value: 'airport',
              title: t('driverWizard.types.airport'),
              description: t('driverWizard.types.airportDesc'),
              icon: <Calendar className="w-6 h-6" />,
              color: 'bg-blue-500/10 text-blue-600',
            },
            {
              value: 'office_transfer',
              title: t('driverWizard.types.officeTransfer'),
              description: t('driverWizard.types.officeTransferDesc'),
              icon: <MapPin className="w-6 h-6" />,
              color: 'bg-green-500/10 text-green-600',
            },
            {
              value: 'client_meeting',
              title: t('driverWizard.types.clientMeeting'),
              description: t('driverWizard.types.clientMeetingDesc'),
              icon: <Users className="w-6 h-6" />,
              color: 'bg-purple-500/10 text-purple-600',
            },
          ]}
          columns={3}
          required
        />
      ),
    },
    {
      id: 'route',
      title: t('driverWizard.steps.route.title'),
      description: t('driverWizard.steps.route.description'),
      icon: <MapPin className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <TextInputStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="from"
            label={t('driverWizard.steps.route.fromLabel')}
            placeholder={t('driverWizard.steps.route.fromPlaceholder')}
            required
          />
          <TextInputStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="to"
            label={t('driverWizard.steps.route.toLabel')}
            placeholder={t('driverWizard.steps.route.toPlaceholder')}
            required
          />
          <TextInputStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="purpose"
            label={t('driverWizard.steps.route.purposeLabel')}
            placeholder={t('driverWizard.steps.route.purposePlaceholder')}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="passengerCount">
              {t('driverWizard.steps.route.passengerCountLabel')}
            </Label>
            <Input
              id="passengerCount"
              type="number"
              min="1"
              max="10"
              value={String(wizardData.passengerCount || '1')}
              onChange={(e) => updateStepData('passengerCount', parseInt(e.target.value) || 1)}
              className="bg-(--background) border-(--border) text-(--text-primary)"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'driver',
      title: t('driverWizard.steps.driver.title'),
      description: t('driverWizard.steps.driver.description'),
      icon: <Car className="w-5 h-5" />,
      content:
        drivers && drivers.length > 0 ? (
          <CardSelectionStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="driverId"
            label={t('driverWizard.steps.driver.selectLabel')}
            options={drivers
              .filter((driver) => driver !== null)
              .map((driver) => ({
                value: driver._id,
                title: driver.userName,
                description: driver.userPosition || '',
                icon: <Car className="w-6 h-6" />,
                color: 'bg-blue-500/10 text-blue-600',
              }))}
            columns={2}
            required
          />
        ) : (
          <div className="text-center py-8 text-(--text-muted)">
            {t('driverWizard.steps.driver.noDrivers')}
          </div>
        ),
    },
    {
      id: 'datetime',
      title: t('driverWizard.steps.datetime.title'),
      description: t('driverWizard.steps.datetime.description'),
      icon: <Clock className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInputStep
              stepData={wizardData}
              updateStepData={updateStepData}
              field="date"
              label={t('driverWizard.steps.datetime.dateLabel')}
              type="text"
              placeholder="YYYY-MM-DD"
              required
            />
            <TextInputStep
              stepData={wizardData}
              updateStepData={updateStepData}
              field="time"
              label={t('driverWizard.steps.datetime.timeLabel')}
              type="text"
              placeholder="HH:MM"
              required
            />
          </div>
          <TextareaStep
            stepData={wizardData}
            updateStepData={updateStepData}
            field="notes"
            label={t('driverWizard.steps.datetime.notesLabel')}
            placeholder={t('driverWizard.steps.datetime.notesPlaceholder')}
            rows={3}
          />
        </div>
      ),
    },
  ];

  const handleSubmit = async (
    data: Record<string, string | number | boolean | string[] | null>,
  ) => {
    try {
      const mergedData = { ...wizardData, ...data };

      if (!organizationId) {
        toast.error(t('driverWizard.toast.noOrg'));
        return;
      }

      const dateStr = String(mergedData.date || '').trim();
      const timeStr = String(mergedData.time || '').trim();

      if (!dateStr || !timeStr) {
        toast.error(
          t('driverWizard.toast.fillDateAndTime', 'Please fill in both date and time fields.'),
        );
        return;
      }

      const parsedDate = new Date(`${dateStr}T${timeStr}:00`);
      const startTime = parsedDate.getTime();

      if (isNaN(startTime)) {
        toast.error(
          t(
            'driverWizard.toast.invalidDateTime',
            'Invalid date or time. Please use YYYY-MM-DD and HH:MM formats.',
          ),
        );
        return;
      }

      const endTime = startTime + 3600000;

      const result = await requestOptimistic(
        organizationId,
        userId,
        mergedData.driverId as Id<'drivers'>,
        startTime,
        endTime,
        {
          from: String(mergedData.from),
          to: String(mergedData.to),
          purpose: String(mergedData.purpose),
          passengerCount: Number(mergedData.passengerCount) || 1,
          notes: mergedData.notes ? String(mergedData.notes) : undefined,
        },
        mergedData.tripCategory as
          | 'client_meeting'
          | 'airport'
          | 'office_transfer'
          | 'emergency'
          | 'team_event'
          | 'personal',
      );

      if (result?.error) {
        toast.error(result.error.message);
        return;
      }

      toast.success(t('driverWizard.toast.success'));
      onComplete?.();
    } catch (error) {
      toast.error(t('driverWizard.toast.error'));
      logger.error(error);
    }
  };

  if (drivers === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <Wizard
      steps={steps}
      onComplete={handleSubmit}
      onCancel={onCancel}
      submitLabel={t('driverWizard.submit')}
      cancelLabel={t('actions.cancel')}
      draftKey="request-driver"
    />
  );
}
