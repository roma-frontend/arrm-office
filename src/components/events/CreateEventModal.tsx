/**
 * Create/Edit Company Event Modal
 * Admin interface for managing company events
 */

'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Calendar, Clock, Users, AlertCircle, Briefcase } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  onSuccess?: () => void;
}

const DEPARTMENTS = [
  'IT',
  'Finance',
  'HR',
  'Marketing',
  'Sales',
  'Operations',
  'Legal',
  'Support',
  'Management',
  'Other',
];

const EVENT_TYPES = [
  { value: 'meeting', label: '🏢 Meeting', icon: '🏢' },
  { value: 'conference', label: '🎤 Conference', icon: '🎤' },
  { value: 'training', label: '📚 Training', icon: '📚' },
  { value: 'team_building', label: '🎯 Team Building', icon: '🎯' },
  { value: 'holiday', label: '🎉 Holiday', icon: '🎉' },
  { value: 'deadline', label: '⏰ Deadline', icon: '⏰' },
  { value: 'other', label: '📌 Other', icon: '📌' },
];

const PRIORITY_LEVELS = [
  {
    value: 'high',
    label: 'High',
    description: 'Critical attendance required',
    color: 'bg-red-100 text-red-800',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Recommended attendance',
    color: 'bg-yellow-100 text-yellow-800',
  },
  {
    value: 'low',
    label: 'Low',
    description: 'Optional attendance',
    color: 'bg-blue-100 text-blue-800',
  },
];

export function CreateEventModal({
  open,
  onOpenChange,
  organizationId,
  userId,
  onSuccess,
}: CreateEventModalProps) {
  const { t } = useTranslation();
  const createEvent = useMutation(api.events.createCompanyEvent);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [eventType, setEventType] = useState<
    'meeting' | 'conference' | 'training' | 'team_building' | 'holiday' | 'deadline' | 'other'
  >('meeting');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [requiredDepartments, setRequiredDepartments] = useState<string[]>([]);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !startDate || !endDate || requiredDepartments.length === 0) {
      toast.error(t('events.fillRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await createEvent({
        organizationId,
        userId,
        name,
        description,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        isAllDay,
        eventType,
        priority,
        requiredDepartments,
        notifyDaysBefore,
      });

      // Reset form
      setName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setIsAllDay(false);
      setEventType('meeting');
      setPriority('medium');
      setRequiredDepartments([]);
      setNotifyDaysBefore(3);

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to create event:', error);
      alert(error.message || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDepartment = (dept: string) => {
    setRequiredDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Create Company Event
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>
                Event Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Annual IT Conference 2025"
                required
              />
            </div>

            <div>
              <Label>{t('events.description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('events.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>
                Start Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>
                End Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Event Type */}
          <div>
            <Label>{t('events.eventType')}</Label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div>
            <Label>{t('events.priorityLevel')}</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {PRIORITY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setPriority(level.value as any)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    priority === level.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`text-sm font-semibold ${level.color.split(' ')[1]}`}>
                    {level.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{level.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Required Departments */}
          <div>
            <Label>
              Required Departments <span className="text-red-500">*</span>
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              Employees from these departments should attend
            </p>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((dept) => (
                <Badge
                  key={dept}
                  variant={requiredDepartments.includes(dept) ? 'default' : 'outline'}
                  className="cursor-pointer transition-all hover:scale-105"
                  onClick={() => toggleDepartment(dept)}
                >
                  {dept}
                  {requiredDepartments.includes(dept) && <X className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
            {requiredDepartments.length === 0 && (
              <p className="text-sm text-red-500 mt-1">⚠️ At least one department is required</p>
            )}
          </div>

          {/* Notifications */}
          <div>
            <Label>{t('events.notifyDaysBefore')}</Label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                min={1}
                max={30}
                value={notifyDaysBefore}
                onChange={(e) => setNotifyDaysBefore(parseInt(e.target.value) || 3)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{t('events.daysBeforeEvent')}</span>
            </div>
          </div>

          {/* Summary */}
          {name && requiredDepartments.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900">{t('events.eventSummary')}</p>
                  <p className="text-blue-700 mt-1">
                    <strong>{name}</strong> will require attendance from:{' '}
                    <span className="font-medium">{requiredDepartments.join(', ')}</span>
                  </p>
                  <p className="text-blue-600 text-xs mt-1">{t('events.conflictAlertDesc')}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || requiredDepartments.length === 0}>
              {isSubmitting ? t('events.creating') : t('events.createEvent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
