'use client';

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date | null;
}

export function CreateEventModal({ open, onOpenChange, selectedDate }: CreateEventModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Set date from selectedDate when modal opens
  React.useEffect(() => {
    if (open && selectedDate) {
      setDate(format(selectedDate, 'yyyy-MM-dd'));
    }
  }, [open, selectedDate]);

  const resetForm = () => {
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

  const handleSave = () => {
    if (!title.trim()) {
      toast.error(t('createMeeting.required'));
      return;
    }
    // TODO: Save event via API
    toast.success(t('createMeeting.title'));
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-(--card) border-b border-(--border) px-6 py-4">
          <h2 className="text-xl font-bold text-(--text-primary)">{t('createMeeting.title')}</h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="event-title" className="text-sm font-medium text-(--text-primary)">
              {t('createMeeting.titlePlaceholder')} *
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createMeeting.titlePlaceholder')}
              className="h-11 text-base border-0 border-b-2 border-(--border) rounded-none px-0 focus-visible:ring-0 focus-visible:border-blue-500 bg-transparent"
              autoFocus
            />
          </div>

          {/* Date & Time Row */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-(--text-muted)">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">{t('createMeeting.date')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10"
              />
              {!allDay && (
                <>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                </>
              )}
            </div>
            {/* All Day Toggle */}
            <div className="flex items-center gap-3">
              <Switch checked={allDay} onCheckedChange={setAllDay} id="all-day" />
              <Label htmlFor="all-day" className="text-sm text-(--text-muted) cursor-pointer">
                {t('createMeeting.allDay')}
              </Label>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-(--text-muted)">
              <MapPin className="w-4 h-4" />
              <Label className="text-sm font-medium">{t('createMeeting.location')}</Label>
            </div>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('createMeeting.locationPlaceholder')}
              className="h-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-(--text-muted)">
              <AlignLeft className="w-4 h-4" />
              <Label className="text-sm font-medium">{t('createMeeting.description')}</Label>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createMeeting.descriptionPlaceholder')}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Category & Reminder Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-(--text-muted)">
                <Tag className="w-4 h-4" />
                <Label className="text-sm font-medium">{t('createMeeting.category')}</Label>
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">{t('createMeeting.categories.meeting')}</SelectItem>
                  <SelectItem value="appointment">
                    {t('createMeeting.categories.appointment')}
                  </SelectItem>
                  <SelectItem value="conference">
                    {t('createMeeting.categories.conference')}
                  </SelectItem>
                  <SelectItem value="training">{t('createMeeting.categories.training')}</SelectItem>
                  <SelectItem value="other">{t('createMeeting.categories.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-(--text-muted)">
                <Bell className="w-4 h-4" />
                <Label className="text-sm font-medium">{t('createMeeting.reminder')}</Label>
              </div>
              <Select value={reminder} onValueChange={setReminder}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('createMeeting.reminders.none')}</SelectItem>
                  <SelectItem value="5min">{t('createMeeting.reminders.5min')}</SelectItem>
                  <SelectItem value="15min">{t('createMeeting.reminders.15min')}</SelectItem>
                  <SelectItem value="30min">{t('createMeeting.reminders.30min')}</SelectItem>
                  <SelectItem value="1hour">{t('createMeeting.reminders.1hour')}</SelectItem>
                  <SelectItem value="1day">{t('createMeeting.reminders.1day')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Teams Meeting Toggle (disabled) */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-(--border) bg-(--background-subtle) opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('createMeeting.teamsMeeting')}
                </p>
                <p className="text-xs text-(--text-muted)">{t('createMeeting.teamsMeetingDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-(--text-muted) bg-(--border) px-2 py-0.5 rounded-full">
                {t('createMeeting.comingSoon')}
              </span>
              <Switch disabled checked={false} />
            </div>
          </div>

          {/* File Attachment */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-(--text-muted)">
              <Paperclip className="w-4 h-4" />
              <Label className="text-sm font-medium">{t('createMeeting.attachment')}</Label>
              <span className="text-xs text-(--text-muted) ml-auto">
                {t('createMeeting.maxFileSize')}
              </span>
            </div>
            {attachment ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-(--border) bg-(--background-subtle)">
                <FileText className="w-5 h-5 text-blue-500 shrink-0" />
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
                  className="p-1 rounded-md hover:bg-(--border) transition-colors"
                >
                  <X className="w-4 h-4 text-(--text-muted)" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-(--border) hover:border-blue-400 hover:bg-blue-500/5 transition-colors cursor-pointer"
              >
                <Paperclip className="w-4 h-4 text-(--text-muted)" />
                <span className="text-sm text-(--text-muted)">{t('createMeeting.attachFile')}</span>
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-(--card) border-t border-(--border) px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <Button variant="outline" onClick={() => handleClose(false)} className="sm:w-auto">
            {t('createMeeting.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            className="sm:w-auto btn-gradient text-white font-medium shadow-md hover:shadow-lg"
          >
            {t('createMeeting.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
