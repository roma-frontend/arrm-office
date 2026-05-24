'use client';

import React, { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Calendar,
  Clock,
  MapPin,
  AlignLeft,
  Tag,
  Bell,
  Video,
  Paperclip,
  X,
  FileText,
  Users,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { uploadTaskAttachment } from '@/actions/cloudinary';
import { getInitials } from '@/lib/stringUtils';
import { playNotificationSound, sendBrowserNotification } from '@/lib/notificationSound';

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date | null;
  leaves?: Array<{ userId: string; startDate: string; endDate: string; status: string }>;
  onSave?: (event: CalendarEvent) => void;
  editEvent?: CalendarEvent | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  description: string;
  category: string;
  reminder: string;
  attendees: string[];
  attachmentUrl?: string;
}

interface OrgUser {
  _id: Id<'users'>;
  name: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
}

const STEPS = ['details', 'people', 'extras'] as const;
type Step = (typeof STEPS)[number];

export function CreateEventModal({
  open,
  onOpenChange,
  selectedDate,
  leaves = [],
  onSave,
  editEvent,
}: CreateEventModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const createEventMutation = useMutation(api.calendarEvents.create);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('details');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('meeting');
  const [reminder, setReminder] = useState('15min');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attendees, setAttendees] = useState<OrgUser[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showPeoplePicker, setShowPeoplePicker] = useState(false);

  const organizationId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;
  const requesterId = user?.id as Id<'users'> | undefined;

  const orgUsers = useQuery(
    api.users.getUsersByOrganizationId,
    organizationId && requesterId ? { organizationId, requesterId } : 'skip',
  ) as OrgUser[] | undefined;

  const filteredUsers = useMemo(() => {
    if (!orgUsers) return [];
    const q = attendeeSearch.toLowerCase().trim();
    const list = q
      ? orgUsers.filter(
          (u) => u.name.toLowerCase().includes(q) || (u.position ?? '').toLowerCase().includes(q),
        )
      : orgUsers;
    return list.filter((u) => !attendees.find((a) => a._id === u._id)).slice(0, 8);
  }, [orgUsers, attendeeSearch, attendees]);

  const getConflict = (userId: string): boolean => {
    if (!date) return false;
    return leaves.some(
      (l) =>
        l.userId === userId && l.status === 'approved' && l.startDate <= date && l.endDate >= date,
    );
  };

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  React.useEffect(() => {
    if (open && editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setStartTime(editEvent.startTime);
      setEndTime(editEvent.endTime);
      setAllDay(editEvent.allDay);
      setLocation(editEvent.location);
      setDescription(editEvent.description);
      setCategory(editEvent.category);
      setReminder(editEvent.reminder);
    } else if (open && selectedDate) {
      setDate(format(selectedDate, 'yyyy-MM-dd'));
    }
  }, [open, selectedDate, editEvent]);

  const resetForm = () => {
    setStep('details');
    setTitle('');
    setDate('');
    setStartTime('09:00');
    setEndTime('10:00');
    setAllDay(false);
    setLocation('');
    setDescription('');
    setCategory('meeting');
    setReminder('15min');
    setAttachment(null);
    setAttendees([]);
    setAttendeeSearch('');
    setShowPeoplePicker(false);
    setUploading(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error(t('createMeeting.fileTooBig'));
      return;
    }
    setAttachment(file);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('createMeeting.required'));
      setStep('details');
      return;
    }
    setUploading(true);
    try {
      let attachmentUrl: string | undefined;
      if (attachment) {
        const base64 = await fileToBase64(attachment);
        attachmentUrl = await uploadTaskAttachment(base64, attachment.name);
      }
      toast.success(t('createMeeting.title'));
      // Schedule reminder notification
      if (date && reminder !== 'none') {
        scheduleReminder(title, date, allDay ? '09:00' : startTime, reminder, t);
      }
      // Save event to database
      if (organizationId && requesterId) {
        await createEventMutation({
          organizationId,
          userId: requesterId,
          title,
          date,
          startTime: allDay ? '00:00' : startTime,
          endTime: allDay ? '23:59' : endTime,
          allDay,
          location: location || undefined,
          description: description || undefined,
          category,
          reminder,
          attendees: attendees.map((a) => a.name),
          attachmentUrl,
        });
      }
      // Save event
      const event: CalendarEvent = {
        id: `evt_${Date.now()}`,
        title,
        date,
        startTime: allDay ? '00:00' : startTime,
        endTime: allDay ? '23:59' : endTime,
        allDay,
        location,
        description,
        category,
        reminder,
        attendees: attendees.map((a) => a.name),
        attachmentUrl,
      };
      onSave?.(event);
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setUploading(false);
    }
  };

  const nextStep = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1] as Step);
    else handleSave();
  };
  const prevStep = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1] as Step);
  };
  const canNext = step === 'details' ? title.trim().length > 0 : true;

  const stepLabels = [
    t('createMeeting.date'),
    t('createMeeting.attendees'),
    t('createMeeting.attachment'),
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col">
        {/* Header with stepper */}
        <div className="shrink-0 bg-(--card) border-b border-(--border) px-6 pt-5 pb-4">
          <h2 className="text-xl font-bold text-(--text-primary) mb-4">
            {t('createMeeting.title')}
          </h2>
          {/* Progress bar */}
          <div className="relative h-1.5 bg-(--background-subtle) rounded-full overflow-hidden mb-3">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => (i <= stepIndex || canNext) && setStep(s)}
                className="flex items-center gap-2 group"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${i < stepIndex ? 'bg-blue-500 border-blue-500 text-white' : i === stepIndex ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-(--border) text-(--text-muted)'}`}
                >
                  {i < stepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${i === stepIndex ? 'text-blue-500' : 'text-(--text-muted)'}`}
                >
                  {stepLabels[i]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step 1: Details */}
              {step === 'details' && (
                <div className="space-y-5">
                  {/* Title */}
                  <div>
                    <Label className="text-sm font-medium text-(--text-primary) mb-1.5 block">
                      {t('createMeeting.titlePlaceholder')} *
                    </Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('createMeeting.titlePlaceholder')}
                      className="h-12 text-base border-2 border-(--border) focus-visible:border-blue-500 rounded-xl"
                      autoFocus
                    />
                  </div>
                  {/* Date & Time */}
                  <div className="p-4 rounded-xl border border-(--border) bg-(--background-subtle)/50 space-y-3">
                    <div className="flex items-center gap-2 text-blue-500">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm font-semibold">{t('createMeeting.date')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-10 rounded-lg"
                      />
                      {!allDay && (
                        <>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className="h-10 pl-9 rounded-lg"
                            />
                          </div>
                          <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                            <Input
                              type="time"
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              className="h-10 pl-9 rounded-lg"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={allDay} onCheckedChange={setAllDay} id="all-day" />
                      <Label
                        htmlFor="all-day"
                        className="text-sm text-(--text-muted) cursor-pointer"
                      >
                        {t('createMeeting.allDay')}
                      </Label>
                    </div>
                  </div>
                  {/* Location */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <MapPin className="w-4 h-4" />
                      <Label className="text-sm font-medium">{t('createMeeting.location')}</Label>
                    </div>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t('createMeeting.locationPlaceholder')}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                      <AlignLeft className="w-4 h-4" />
                      <Label className="text-sm font-medium">
                        {t('createMeeting.description')}
                      </Label>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('createMeeting.descriptionPlaceholder')}
                      className="min-h-[90px] resize-none rounded-xl"
                    />
                  </div>
                  {/* Category & Reminder */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                        <Tag className="w-4 h-4" />
                        <Label className="text-sm font-medium">{t('createMeeting.category')}</Label>
                      </div>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting">
                            {t('createMeeting.categories.meeting')}
                          </SelectItem>
                          <SelectItem value="appointment">
                            {t('createMeeting.categories.appointment')}
                          </SelectItem>
                          <SelectItem value="conference">
                            {t('createMeeting.categories.conference')}
                          </SelectItem>
                          <SelectItem value="training">
                            {t('createMeeting.categories.training')}
                          </SelectItem>
                          <SelectItem value="other">
                            {t('createMeeting.categories.other')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-(--text-muted) mb-1.5">
                        <Bell className="w-4 h-4" />
                        <Label className="text-sm font-medium">{t('createMeeting.reminder')}</Label>
                      </div>
                      <Select value={reminder} onValueChange={setReminder}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('createMeeting.reminders.none')}</SelectItem>
                          <SelectItem value="5min">{t('createMeeting.reminders.5min')}</SelectItem>
                          <SelectItem value="15min">
                            {t('createMeeting.reminders.15min')}
                          </SelectItem>
                          <SelectItem value="30min">
                            {t('createMeeting.reminders.30min')}
                          </SelectItem>
                          <SelectItem value="1hour">
                            {t('createMeeting.reminders.1hour')}
                          </SelectItem>
                          <SelectItem value="1day">{t('createMeeting.reminders.1day')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: People */}
              {step === 'people' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-500 mb-1">
                    <Users className="w-5 h-5" />
                    <span className="text-base font-semibold">{t('createMeeting.attendees')}</span>
                    {attendees.length > 0 && (
                      <span className="ml-auto text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                        {attendees.length}
                      </span>
                    )}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      value={attendeeSearch}
                      onChange={(e) => {
                        setAttendeeSearch(e.target.value);
                        setShowPeoplePicker(true);
                      }}
                      onFocus={() => setShowPeoplePicker(true)}
                      placeholder={t('createMeeting.searchPeople')}
                      className="h-11 pl-10 rounded-xl text-sm"
                    />
                    {showPeoplePicker && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-52 overflow-y-auto rounded-xl border border-(--border) bg-(--card) shadow-2xl">
                        {filteredUsers.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-center text-(--text-muted)">
                            {t('createMeeting.noResults')}
                          </p>
                        ) : (
                          filteredUsers.map((u) => {
                            const hasConflict = getConflict(u._id);
                            return (
                              <button
                                key={u._id}
                                onClick={() => {
                                  setAttendees((p) => [...p, u]);
                                  setAttendeeSearch('');
                                  setShowPeoplePicker(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors text-left border-b border-(--border) last:border-0"
                              >
                                <Avatar className="w-8 h-8 shrink-0">
                                  <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold">
                                    {getInitials(u.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-(--text-primary) truncate">
                                    {u.name}
                                  </p>
                                  {u.position && (
                                    <p className="text-xs text-(--text-muted) truncate">
                                      {u.position}
                                    </p>
                                  )}
                                </div>
                                {hasConflict && (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full shrink-0">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('createMeeting.conflict')}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conflict warning */}
                  {attendees.some((a) => getConflict(a._id)) && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-400/30">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                        {t('createMeeting.conflict')}
                      </span>
                    </div>
                  )}

                  {/* Selected attendees */}
                  {attendees.length > 0 ? (
                    <div className="space-y-2">
                      {attendees.map((a) => {
                        const hasConflict = getConflict(a._id);
                        return (
                          <div
                            key={a._id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${hasConflict ? 'border-amber-400/50 bg-amber-500/5' : 'border-(--border) bg-(--background-subtle)/50 hover:border-blue-300'}`}
                          >
                            <Avatar className="w-9 h-9 shrink-0">
                              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold">
                                {getInitials(a.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-(--text-primary) truncate">
                                {a.name}
                              </p>
                              <p className="text-xs text-(--text-muted) truncate">
                                {a.position ?? a.department ?? ''}
                              </p>
                            </div>
                            {hasConflict && (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <button
                              onClick={() => setAttendees((p) => p.filter((x) => x._id !== a._id))}
                              className="p-1.5 rounded-lg hover:bg-(--border) transition-colors"
                            >
                              <X className="w-4 h-4 text-(--text-muted)" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-(--text-muted)">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{t('createMeeting.addAttendees')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Extras */}
              {step === 'extras' && (
                <div className="space-y-5">
                  {/* Teams Meeting */}
                  <div className="flex items-center justify-between p-5 rounded-xl border border-(--border) bg-gradient-to-r from-purple-500/5 to-indigo-500/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                        <Video className="w-5 h-5 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-(--text-primary)">
                          {t('createMeeting.teamsMeeting')}
                        </p>
                        <p className="text-xs text-(--text-muted)">
                          {t('createMeeting.teamsMeetingDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-purple-500 bg-purple-500/10 px-2.5 py-1 rounded-full">
                        {t('createMeeting.comingSoon')}
                      </span>
                      <Switch disabled checked={false} />
                    </div>
                  </div>

                  {/* File Attachment */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-500" />
                      <Label className="text-sm font-semibold text-(--text-primary)">
                        {t('createMeeting.attachment')}
                      </Label>
                      <span className="text-xs text-(--text-muted) ml-auto">
                        {t('createMeeting.maxFileSize')}
                      </span>
                    </div>
                    {attachment ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-500/5">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-(--text-primary) truncate">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-(--text-muted)">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => setAttachment(null)}
                          className="p-2 rounded-lg hover:bg-(--border) transition-colors"
                        >
                          <X className="w-4 h-4 text-(--text-muted)" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-(--border) hover:border-blue-400 hover:bg-blue-500/5 transition-all cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-full bg-(--background-subtle) group-hover:bg-blue-500/10 flex items-center justify-center transition-colors">
                          <Paperclip className="w-5 h-5 text-(--text-muted) group-hover:text-blue-500 transition-colors" />
                        </div>
                        <span className="text-sm font-medium text-(--text-muted) group-hover:text-blue-500 transition-colors">
                          {t('createMeeting.attachFile')}
                        </span>
                        <span className="text-xs text-(--text-muted)">
                          {t('createMeeting.maxFileSize')}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-(--card) border-t border-(--border) px-6 py-4 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={uploading}
              className="rounded-xl"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('createMeeting.back')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => handleClose(false)}
              className="rounded-xl text-(--text-muted)"
            >
              {t('createMeeting.cancel')}
            </Button>
          )}
          <Button
            onClick={nextStep}
            disabled={!canNext || uploading}
            className="rounded-xl btn-gradient text-white font-medium shadow-md hover:shadow-lg px-6"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('createMeeting.uploading')}
              </>
            ) : stepIndex === STEPS.length - 1 ? (
              t('createMeeting.save')
            ) : (
              <>
                {t('createMeeting.next')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const REMINDER_OFFSETS: Record<string, number> = {
  '5min': 5 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
};

function scheduleReminder(
  title: string,
  date: string,
  time: string,
  reminder: string,
  t: (key: string, opts?: Record<string, string>) => string,
) {
  const offset = REMINDER_OFFSETS[reminder];
  if (!offset) return;

  const eventTime = new Date(`${date}T${time}`).getTime();
  const fireAt = eventTime - offset;
  const delay = fireAt - Date.now();

  if (delay <= 0) return; // Already passed

  setTimeout(() => {
    // Play sound
    playNotificationSound('new_request');
    // Show rich toast
    toast(t('createMeeting.reminderFired', { title }), {
      icon: '🔔',
      duration: 8000,
      style: {
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      },
    });
    // Browser notification
    sendBrowserNotification(t('createMeeting.reminderFired', { title }), {
      body: `${date} ${time}`,
      soundType: 'new_request',
    });
  }, delay);
}
