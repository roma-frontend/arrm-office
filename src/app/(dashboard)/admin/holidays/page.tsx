'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { api } from '../../../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { Plus, Trash2, Pencil } from 'lucide-react';

export default function HolidaysPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const [showCreate, setShowCreate] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Doc<'holidays'> | null>(null);
  const [form, setForm] = useState({
    name: '',
    date: '',
    type: 'public' as 'public' | 'internal',
    isRecurring: false,
    description: '',
  });

  const holidays = useQuery(
    api.leaveSettings.getHolidays,
    organizationId ? { organizationId } : 'skip',
  );
  const createHoliday = useMutation(api.leaveSettings.createHoliday);
  const updateHoliday = useMutation(api.leaveSettings.updateHoliday);
  const deleteHoliday = useMutation(api.leaveSettings.deleteHoliday);

  if (!organizationId || !user) return <ShieldLoader />;

  const resetForm = () => {
    setForm({ name: '', date: '', type: 'public', isRecurring: false, description: '' });
    setEditingHoliday(null);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.date) {
      toast.error(t('admin.holidays.required', 'Name and date are required'));
      return;
    }
    try {
      if (editingHoliday) {
        await updateHoliday({
          holidayId: editingHoliday._id,
          name: form.name,
          date: form.date,
          type: form.type,
          isRecurring: form.isRecurring,
          description: form.description || undefined,
        });
        toast.success(t('admin.holidays.updated', 'Holiday updated'));
      } else {
        await createHoliday({
          organizationId,
          name: form.name,
          date: form.date,
          type: form.type,
          isRecurring: form.isRecurring,
          description: form.description || undefined,
        });
        toast.success(t('admin.holidays.created', 'Holiday created'));
      }
      resetForm();
      setShowCreate(false);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleEdit = (holiday: Doc<'holidays'>) => {
    setEditingHoliday(holiday);
    setForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      isRecurring: holiday.isRecurring,
      description: holiday.description || '',
    });
    setShowCreate(true);
  };

  const handleDelete = async (holidayId: Id<'holidays'>) => {
    try {
      await deleteHoliday({ holidayId });
      toast.success(t('admin.holidays.deleted', 'Holiday deleted'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const groupedHolidays = {
    public: holidays?.filter((h) => h.type === 'public') ?? [],
    internal: holidays?.filter((h) => h.type === 'internal') ?? [],
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur border-b border-(--border) flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.holidays.title', 'Holiday Management')}</h1>
          <p className="text-sm text-(--text-muted) mt-1">
            {t('admin.holidays.subtitle', 'Manage public holidays and internal non-working days')}
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> {t('admin.holidays.add', 'Add Holiday')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Public Holidays */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span>🏛️</span> {t('admin.holidays.public', 'Public Holidays')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {groupedHolidays.public.length === 0 ? (
              <p className="text-sm text-(--text-muted) text-center py-8">
                {t('admin.holidays.noHolidays', 'No public holidays configured')}
              </p>
            ) : (
              <div className="space-y-2">
                {groupedHolidays.public.map((h) => (
                  <div
                    key={h._id}
                    className="flex items-center justify-between p-3 rounded-xl bg-(--background-subtle) border border-(--border)"
                  >
                    <div>
                      <p className="font-medium text-sm">{h.name}</p>
                      <p className="text-xs text-(--text-muted)">
                        {new Date(h.date).toLocaleDateString()}
                        {h.isRecurring && ` (${t('admin.holidays.recurring', 'Recurring')})`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => handleEdit(h)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-(--danger-text)"
                        onClick={() => handleDelete(h._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Internal Holidays */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span>🏢</span> {t('admin.holidays.internal', 'Internal Non-Working Days')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {groupedHolidays.internal.length === 0 ? (
              <p className="text-sm text-(--text-muted) text-center py-8">
                {t('admin.holidays.noInternal', 'No internal non-working days configured')}
              </p>
            ) : (
              <div className="space-y-2">
                {groupedHolidays.internal.map((h) => (
                  <div
                    key={h._id}
                    className="flex items-center justify-between p-3 rounded-xl bg-(--background-subtle) border border-(--border)"
                  >
                    <div>
                      <p className="font-medium text-sm">{h.name}</p>
                      <p className="text-xs text-(--text-muted)">
                        {new Date(h.date).toLocaleDateString()}
                        {h.isRecurring && ` (${t('admin.holidays.recurring', 'Recurring')})`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => handleEdit(h)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-(--danger-text)"
                        onClick={() => handleDelete(h._id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" size="sm" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle>
              {editingHoliday
                ? t('admin.holidays.edit', 'Edit Holiday')
                : t('admin.holidays.create', 'Create Holiday')}
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div>
              <Label>{t('admin.holidays.name', 'Holiday Name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('admin.holidays.date', 'Date')}</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('admin.holidays.type', 'Type')}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((p) => ({ ...p, type: v as 'public' | 'internal' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    {t('admin.holidays.public', 'Public Holiday')}
                  </SelectItem>
                  <SelectItem value="internal">
                    {t('admin.holidays.internal', 'Internal Non-Working Day')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isRecurring}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isRecurring: v }))}
              />
              <Label>{t('admin.holidays.recurring', 'Recurring yearly')}</Label>
            </div>
            <div>
              <Label>{t('admin.holidays.description', 'Description (optional)')}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowCreate(false);
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingHoliday ? t('common.save', 'Save') : t('common.create', 'Create')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
