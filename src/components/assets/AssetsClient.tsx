'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';
import { motion } from '@/lib/cssMotion';
import {
  Monitor,
  Laptop,
  Smartphone,
  Mouse,
  Sofa,
  Key,
  Car,
  Package,
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Wrench,
  ClipboardCheck,
  CheckCircle,
  X,
  UserPlus,
  History,
  FileSignature,
  FileText,
  Send,
  Download,
  LayoutGrid,
  List,
  MapPin,
  QrCode,
} from 'lucide-react';
import { useQuery, useMutation } from '@/lib/convex-typed';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthStore } from '@/store/useAuthStore';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from '@/lib/dynamic-imports';
import Link from 'next/link';
import AssetWizard from './AssetWizard';
import { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import {
  exportDocumentToPDF,
  type RenderableDocument,
  type DocumentLabels,
} from '@/lib/exportDocument';
import type { AccentColor } from '@/lib/documentCatalog';
import QRCodeModal from './QRCodeModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    label: string;
    color: string;
  }
> = {
  laptop: { icon: Laptop, label: 'Laptop', color: '#2563eb' },
  monitor: { icon: Monitor, label: 'Monitor', color: '#10b981' },
  phone: { icon: Smartphone, label: 'Phone', color: '#8b5cf6' },
  tablet: { icon: Smartphone, label: 'Tablet', color: '#06b6d4' },
  peripheral: { icon: Mouse, label: 'Peripheral', color: '#f59e0b' },
  furniture: { icon: Sofa, label: 'Furniture', color: '#ec4899' },
  software_license: { icon: Key, label: 'License', color: '#6366f1' },
  vehicle: { icon: Car, label: 'Vehicle', color: '#14b8a6' },
  other: { icon: Package, label: 'Other', color: '#64748b' },
};

function formatCurrency(amount: number, currency = 'AMD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getCategoryCfg(category: string): (typeof CATEGORY_CONFIG)['laptop'] {
  return (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other) as (typeof CATEGORY_CONFIG)['laptop'];
}

function getStatusBadge(status: string, t: (key: string) => string): React.ReactNode {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> =
    {
      available: 'success',
      assigned: 'default',
      maintenance: 'warning',
      retired: 'secondary',
      lost: 'destructive',
      new: 'success',
      good: 'success',
      fair: 'warning',
      poor: 'destructive',
      damaged: 'destructive',
      active: 'success',
      returned: 'secondary',
      pending: 'warning',
      approved: 'success',
      fulfilled: 'success',
      rejected: 'destructive',
      scheduled: 'secondary',
      in_progress: 'warning',
      completed: 'success',
      cancelled: 'destructive',
    };

  return (
    <Badge variant={variants[status] || 'secondary'} className="capitalize">
      {t(`assets.status.${status}`) || status}
    </Badge>
  );
}

/** Localized static labels for the themed PDF footer / signature block. */
function useDocumentLabels(): DocumentLabels {
  const { t: _t } = useTranslation();
  return {
    signature: _t('docLibrary.signature', 'Signature'),
    name: _t('docLibrary.nameLabel', 'Name'),
    position: _t('docLibrary.positionLabel', 'Position'),
    date: _t('docLibrary.dateLabel', 'Date'),
    generatedOn: _t('docLibrary.generatedOn', 'Generated on'),
    integrity: _t('docLibrary.integrity', 'Integrity'),
  };
}

/** Build localized body text for asset movement/return form PDFs. */
function buildLocalizedFormBody(params: {
  isReturn: boolean;
  assetName: string;
  assetSerial?: string;
  categoryLabel: string;
  employeeName: string;
  adminName: string;
  date: string;
  condition?: string;
  t: (key: string, defaultValue?: string) => string;
}): string {
  const {
    isReturn,
    assetName,
    assetSerial,
    categoryLabel,
    employeeName,
    adminName,
    date,
    condition,
    t,
  } = params;
  const typeLabel = isReturn
    ? t('assets.pdf.returnForm', 'Asset Return Form')
    : t('assets.pdf.movementForm', 'Asset Movement Form');
  const typeSub = isReturn
    ? t('assets.pdf.equipmentReturn', 'Equipment Return')
    : t('assets.pdf.equipmentTransfer', 'Equipment Transfer');
  const detailsTitle = isReturn
    ? t('assets.pdf.returnDetails', 'Return Details')
    : t('assets.pdf.handoverDetails', 'Handover Details');
  const personLabel = isReturn
    ? t('assets.pdf.returnedBy', 'Returned By')
    : t('assets.pdf.handedTo', 'Handed To');
  const termsText = isReturn
    ? t(
        'assets.pdf.returnTerms',
        'I confirm that I have returned the above equipment. The asset has been received in the noted condition and I am released from further responsibility for this item.',
      )
    : t(
        'assets.pdf.assignTerms',
        'I confirm that I have received the above equipment in good condition. I agree to take full responsibility for the item and will return it upon request or at the end of my employment.',
      );
  const lines = [
    typeLabel + ' — ' + assetName,
    '',
    t('assets.pdf.date', 'Date') + ': ' + date,
    '',
    t('assets.pdf.assetDetails', 'Asset Details'),
    '',
    '• ' + t('assets.name') + ': ' + assetName,
    assetSerial ? '• ' + t('assets.serialNumber') + ': ' + assetSerial : '',
    '• ' + t('assets.categoryLabel') + ': ' + categoryLabel,
    '• ' + t('assets.pdf.type', 'Type') + ': ' + typeSub,
    '',
    detailsTitle,
    '',
    '• ' + personLabel + ': ' + employeeName,
    '• ' + t('assets.pdf.handedBy', 'Handed By') + ': ' + adminName,
    '• ' + t('assets.pdf.transferDate', 'Transfer Date') + ': ' + date,
    ...(condition ? ['• ' + t('assets.conditionLabel', 'Condition') + ': ' + condition] : []),
    '',
    t('assets.pdf.terms', 'Terms and Conditions'),
    '',
    termsText,
    '',
    t('assets.pdf.signatures', 'Signatures'),
    '',
    t('assets.pdf.employeeSignature', 'Employee Signature') + ': _________________________',
    t('assets.pdf.signerName', 'Name') + ': ' + employeeName,
    t('assets.pdf.date', 'Date') + ': ' + date,
    '',
    t('assets.pdf.adminSignature', 'Admin/HR Signature') + ': _________________________',
    t('assets.pdf.signerName', 'Name') + ': ' + adminName,
    t('assets.pdf.date', 'Date') + ': ' + date,
  ];
  return lines.filter(Boolean).join('\n');
}

// ──────────── ASSIGN DIALOG ────────────
function AssignDialog({
  open,
  onOpenChange,
  asset,
  orgId,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape from Convex query
  asset: any;
  orgId: Id<'organizations'>;
  userId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const assignAsset = useMutation(api.assets.assignAsset);
  const [assigning, setAssigning] = useState(false);

  // Получаем список всех пользователей организации для выбора
  const allUsers = useQuery(api.tasks.getUsersForAssignment, userId ? {} : 'skip');

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    if (!searchQuery.trim()) return allUsers;
    const q = searchQuery.toLowerCase();
    return allUsers.filter((u) => u.name && u.name.toLowerCase().includes(q));
  }, [allUsers, searchQuery]);

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    try {
      const expectedReturnAt = expectedReturn ? new Date(expectedReturn).getTime() : undefined;
      await assignAsset({
        organizationId: orgId,
        assetId: asset._id,
        assignedTo: selectedUserId as Id<'users'>,
        assignedBy: userId,
        expectedReturnAt,
      });
      toast.success(t('assets.assignedSuccess'));
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('assets.assignedError'));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('assets.assignTitle')}</DialogTitle>
          <DialogDescription>
            {t('assets.assignDescription')} <strong>{asset.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-foreground">{t('assets.assignedTo')}</label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('assets.searchEmployee')}
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-1">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserId === u._id;
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u._id);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-background-subtle text-foreground'
                      }`}
                    >
                      <span className="font-medium">{u.name}</span>
                      {u.position && (
                        <span className="text-muted-foreground ml-2 text-xs">{u.position}</span>
                      )}
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('assets.noEmployeesFound')}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              {t('assets.expectedReturn')}{' '}
              <span className="text-muted-foreground">({t('common.optional')})</span>
            </label>
            <Input
              type="date"
              className="mt-1"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleAssign} disabled={!selectedUserId || assigning}>
            {assigning ? t('common.saving') : t('assets.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────── RETURN DIALOG ────────────
function ReturnDialog({
  open,
  onOpenChange,
  assignment,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape from Convex query
  assignment: any;
  userId: Id<'users'>;
}) {
  const { t } = useTranslation();
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');

  const returnAsset = useMutation(api.assets.returnAsset);
  const [returning, setReturning] = useState(false);

  const handleReturn = async () => {
    setReturning(true);
    try {
      await returnAsset({
        assignmentId: assignment._id,
        returnedBy: userId,
        condition: condition as 'good' | 'fair' | 'poor' | 'damaged',
        notes: notes || undefined,
      });
      toast.success(t('assets.returnedSuccess'));
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('assets.returnedError'));
    } finally {
      setReturning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('assets.returnTitle')}</DialogTitle>
          <DialogDescription>
            {t('assets.returnDescription')} <strong>{assignment.assetName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              {t('assets.conditionLabel', 'Condition')}
            </label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectContent>
                <SelectItem value="good">{t('assets.condition.good')}</SelectItem>
                <SelectItem value="fair">{t('assets.condition.fair')}</SelectItem>
                <SelectItem value="poor">{t('assets.condition.poor')}</SelectItem>
                <SelectItem value="damaged">{t('assets.condition.damaged')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              {t('assets.notes')}{' '}
              <span className="text-muted-foreground">({t('common.optional')})</span>
            </label>
            <Input
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('assets.notesPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleReturn} disabled={returning}>
            {returning ? t('common.saving') : t('assets.confirmReturn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────── ASSET DETAIL VIEW ────────────
function AssetDetailCard({
  asset,
  onAssign,
  onReturn,
  onClose,
  userId,
  setQrCodeAsset,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape from Convex query
  asset: any;
  onAssign: () => void;
  onReturn?: () => void;
  onClose: () => void;
  userId: Id<'users'>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setQrCodeAsset: (a: any) => void;
}) {
  const { t } = useTranslation();
  const cfg = getCategoryCfg(asset.category);
  const Icon = cfg.icon;
  const isAssigned = asset.status === 'assigned' && asset.currentUser;

  const _sendMovementForm = useMutation(api.assets.sendMovementForm);
  const [sending, setSending] = useState(false);
  const mfDocId = asset.currentAssignment?.movementFormDocId as
    | Id<'signatureDocuments'>
    | undefined;
  const sigDoc = useQuery(
    api.signatures.getDocument,
    mfDocId ? { documentId: mfDocId } : 'skip',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
  const labels = useDocumentLabels();

  const [downloading, setDownloading] = useState(false);
  const handleDownloadPdf = async () => {
    if (!sigDoc || !asset.currentAssignment) return;
    setDownloading(true);
    try {
      const isReturn = sigDoc.title?.toLowerCase().includes('return');
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const categoryLabel = t(`assets.category.${asset.category}`) || asset.category;
      const employeeName = asset.currentUser?.name || t('common.unknown');
      const adminName = asset.currentAssignment?.assignedByName || t('common.unknown');
      const body = buildLocalizedFormBody({
        isReturn,
        assetName: asset.name,
        assetSerial: asset.serialNumber,
        categoryLabel,
        employeeName,
        adminName,
        date,
        t: t as (key: string, defaultValue?: string) => string,
      });
      const title = isReturn
        ? `${t('assets.movementForm.title', 'Return Form')} — ${asset.name}`
        : `${t('assets.movementForm.title', 'Movement Form')} — ${asset.name}`;
      const renderable: RenderableDocument = {
        title,
        body,
        accent: (sigDoc.accent as AccentColor) || 'blue',
        signature: true,
        orgName: sigDoc.orgName || '',
        now: Date.now(),
        labels,
      };
      const filename = `${asset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_form.pdf`;
      await exportDocumentToPDF(renderable, filename);
      toast.success(t('assets.movementForm.pdfDownloaded', 'PDF downloaded'));
    } catch {
      toast.error(t('assets.movementForm.pdfError', 'Failed to generate PDF'));
    } finally {
      setDownloading(false);
    }
  };

  const handleSendForm = async () => {
    setSending(true);
    try {
      await _sendMovementForm({
        organizationId: asset.organizationId,
        assignmentId: asset.currentAssignment!._id,
        assetId: asset._id,
        assetName: asset.name,
        assignedTo: asset.currentAssignment!.assignedTo,
        assignedBy: userId,
      });
      toast.success(t('assets.movementForm.sent'));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t('assets.common.error', 'Failed to send form'),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="p-6 border-b border-border bg-gradient-to-br from-background-subtle to-background">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${cfg.color}15` }}
            >
              <Icon className="w-7 h-7" style={{ color: cfg.color }} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{asset.name}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`assets.category.${asset.category}`)} {asset.brand && `· ${asset.brand}`}
                {asset.model && ` ${asset.model}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(asset.status, t)}
            <QRButton asset={asset} setQrCodeAsset={setQrCodeAsset} t={t} />
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-background-subtle rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('assets.serialNumber')}</p>
            <p className="text-sm font-medium text-foreground">{asset.serialNumber || '—'}</p>
          </div>
          <div className="bg-background-subtle rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('assets.location')}</p>
            <p className="text-sm font-medium text-foreground">{asset.location || '—'}</p>
          </div>
          <div className="bg-background-subtle rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">
              {t('assets.conditionLabel', 'Condition')}
            </p>
            <p className="text-sm font-medium text-foreground capitalize">
              {t(`assets.condition.${asset.condition}`) || asset.condition}
            </p>
          </div>
          <div className="bg-background-subtle rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('assets.purchasePrice')}</p>
            <p className="text-sm font-medium text-foreground">
              {asset.purchasePrice ? formatCurrency(asset.purchasePrice, asset.currency) : '—'}
            </p>
          </div>
        </div>

        {/* Assignment Info */}
        {isAssigned && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t('assets.assignedTo')}:{' '}
                    <strong>{asset.currentUser?.name || t('common.unknown')}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">{asset.currentUser?.email}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Movement Form Status */}
        {isAssigned && asset.currentAssignment && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-background-subtle border-b border-border">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {t('assets.movementForm.title')}
                </span>
              </div>
              {(() => {
                const mfStatus = asset.currentAssignment?.movementFormStatus || 'not_sent';
                if (mfStatus === 'signed') {
                  return (
                    <Badge variant="success" className="text-xs">
                      {t('assets.movementForm.status.signed')}
                    </Badge>
                  );
                }
                if (mfStatus === 'pending') {
                  return (
                    <Badge variant="warning" className="text-xs">
                      {t('assets.movementForm.status.pending')}
                    </Badge>
                  );
                }
                return (
                  <Badge variant="secondary" className="text-xs">
                    {t('assets.movementForm.status.not_sent')}
                  </Badge>
                );
              })()}
            </div>
            <div className="p-3 space-y-3">
              {(() => {
                const mfStatus = asset.currentAssignment?.movementFormStatus || 'not_sent';
                if (mfStatus === 'signed') {
                  return (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        <Link
                          href="/signatures"
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          {t('assets.movementForm.viewDocument')}
                        </Link>
                      </div>
                      {sigDoc && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0"
                          onClick={handleDownloadPdf}
                          disabled={downloading}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          {downloading ? '…' : t('common.download', 'Download')}
                        </Button>
                      )}
                    </div>
                  );
                }
                if (mfStatus === 'pending') {
                  return (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <Link
                        href="/signatures"
                        className="text-sm text-primary hover:underline font-medium flex items-center gap-2"
                      >
                        <FileSignature className="w-4 h-4" />
                        {t('assets.movementForm.signNow')}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={handleSendForm}
                          disabled={sending}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          {sending
                            ? t('common.sending', 'Sending...')
                            : t('assets.movementForm.resend', 'Resend')}
                        </Button>
                        {sigDoc && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            {downloading ? '…' : t('common.download', 'Download')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'assets.movementForm.notSentHint',
                        'The movement form will be generated automatically after assignment.',
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendForm}
                        disabled={sending}
                        className="h-7 text-xs"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        {sending
                          ? t('common.sending', 'Sending...')
                          : t('assets.movementForm.send')}
                      </Button>
                      {sigDoc && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={handleDownloadPdf}
                          disabled={downloading}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          {downloading ? '…' : t('common.download', 'Download')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {asset.status === 'available' && (
            <Button onClick={onAssign}>
              <ArrowUpRight className="w-4 h-4 mr-2" />
              {t('assets.assign')}
            </Button>
          )}
          {asset.status === 'maintenance' && (
            <Button variant="outline" disabled>
              <Wrench className="w-4 h-4 mr-2" />
              {t('assets.inMaintenance')}
            </Button>
          )}
          {isAssigned && onReturn && (
            <Button variant="outline" onClick={onReturn}>
              <ArrowDownLeft className="w-4 h-4 mr-2" />
              {t('assets.return')}
            </Button>
          )}
        </div>

        {/* Assignment History */}
        {asset.assignments && asset.assignments.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <History className="w-4 h-4" />
              {t('assets.assignmentHistory')}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {asset.assignments.slice(0, 5).map((a: any) => (
                <div
                  key={a._id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-background-subtle border border-border text-sm"
                >
                  <div className="flex items-center gap-2">
                    {a.status === 'active' ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span className="text-foreground">{a.userName || t('common.unknown')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(a.assignedAt)}</span>
                    {getStatusBadge(a.status, t)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Maintenance History */}
        {asset.maintenanceHistory && asset.maintenanceHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4" />
              {t('assets.maintenanceHistory')}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {asset.maintenanceHistory.slice(0, 5).map((m: any) => (
                <div
                  key={m._id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-background-subtle border border-border text-sm"
                >
                  <div>
                    <p className="text-foreground font-medium">{m.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`assets.maintenanceType.${m.type}`)} —{' '}
                      {m.performedBy || t('common.unknown')}
                    </p>
                  </div>
                  <div className="text-right text-xs">{getStatusBadge(m.status, t)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ──────────── QR CODE BUTTON (used in multiple places) ────────────
/** Small ghost button that opens the QR-code sticker modal for a given asset. */
function QRButton({
  asset,
  setQrCodeAsset,
  t,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape from Convex query
  asset: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setQrCodeAsset: (a: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        setQrCodeAsset({
          _id: asset._id,
          name: asset.name,
          serialNumber: asset.serialNumber,
          assetTag: asset.assetTag,
          category: asset.category,
          brand: asset.brand,
          model: asset.model,
        });
      }}
      title={t('assets.qr.show', 'Show QR Code')}
    >
      <QrCode className="w-3.5 h-3.5 mr-1" />
      QR
    </Button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function AssetsClient() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)';
  const tooltipColor = isDark ? '#ffffff' : '#0f172a';
  const tooltipShadow = isDark ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#ffffff' : '#0f172a';

  const selectedOrgId = useSelectedOrganization();
  const { user } = useAuthStore();
  const isSuperuser = user?.role === 'superadmin' || user?.role === 'admin';
  const _isSuperadmin = user?.role === 'superadmin';
  const orgId = (selectedOrgId ?? user?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  // State
  const [activeTab, setActiveTab] = useState<'catalog' | 'myAssets' | 'requests' | 'maintenance'>(
    'catalog',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assignDialogAsset, setAssignDialogAsset] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [returnDialogAssignment, setReturnDialogAssignment] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qrCodeAsset, setQrCodeAsset] = useState<any>(null);

  // Deep-link: open an asset's detail card when the URL carries `?asset=<id>`
  // (e.g. when a QR-code sticker is scanned). Runs once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const assetIdParam = new URLSearchParams(window.location.search).get('asset');
    if (assetIdParam) {
      setActiveTab('catalog');
      setSelectedAsset({ _id: assetIdParam as Id<'assetCatalog'> });
    }
  }, []);

  // Queries
  const stats = useQuery(api.assets.getAssetStats, orgId ? { organizationId: orgId } : 'skip');

  const assets = useQuery(
    api.assets.listAssets,
    orgId
      ? {
          organizationId: orgId,
          category:
            categoryFilter !== 'all'
              ? (categoryFilter as
                  | 'laptop'
                  | 'monitor'
                  | 'phone'
                  | 'tablet'
                  | 'peripheral'
                  | 'furniture'
                  | 'software_license'
                  | 'vehicle'
                  | 'other')
              : undefined,
          status:
            statusFilter !== 'all'
              ? (statusFilter as 'available' | 'assigned' | 'maintenance' | 'retired' | 'lost')
              : undefined,
        }
      : 'skip',
  );

  const employeeAssets = useQuery(
    api.assets.listEmployeeAssets,
    orgId && user?.id ? { organizationId: orgId, employeeId: user.id as Id<'users'> } : 'skip',
  );

  const requests = useQuery(
    api.assets.listAssetRequests,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const myRequests = useQuery(
    api.assets.getMyAssetRequests,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const maintenanceRecords = useQuery(
    api.assets.listMaintenance,
    orgId ? { organizationId: orgId } : 'skip',
  );

  const selectedAssetDetail = useQuery(
    api.assets.getAsset,
    selectedAsset?._id ? { assetId: selectedAsset._id } : 'skip',
  );

  // Mutations
  const approveRequest = useMutation(api.assets.approveAssetRequest);
  const rejectRequest = useMutation(api.assets.rejectAssetRequest);
  const deleteAssetMut = useMutation(api.assets.deleteAsset);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    let result = assets;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.serialNumber && a.serialNumber.toLowerCase().includes(q)) ||
          (a.brand && a.brand.toLowerCase().includes(q)) ||
          (a.model && a.model.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [assets, searchQuery]);

  // Paginated slice for table view
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedAssets = useMemo(() => {
    const start = safePage * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, safePage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, categoryFilter, statusFilter]);

  // Category chart data
  const categoryChartData = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory).map(([key, value]) => ({
      name: t(`assets.category.${key}`) || key,
      value: value as number,
      color: CATEGORY_CONFIG[key]?.color || '#64748b',
    }));
  }, [stats, t]);

  const paramsAvailable = orgId !== undefined;

  // Delete handler
  const handleDelete = async (assetId: Id<'assetCatalog'>) => {
    try {
      await deleteAssetMut({ assetId });
      toast.success(t('assets.deletedSuccess'));
      setDeleteConfirmAsset(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('assets.deletedError'));
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('assets.title', 'Asset Management')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('assets.subtitle', 'Track and manage company equipment')}
            </p>
          </div>
        </div>
      </div>

      {!paramsAvailable && (
        <Card>
          <CardContent className="py-12 text-center text-(--text-muted)">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('common.selectOrganization')}</p>
          </CardContent>
        </Card>
      )}

      {paramsAvailable && (
        <>
          {/* QR Code Modal */}
          {orgId && qrCodeAsset && (
            <QRCodeModal
              open={!!qrCodeAsset}
              onOpenChange={(v) => {
                if (!v) setQrCodeAsset(null);
              }}
              asset={qrCodeAsset}
              organizationId={orgId}
            />
          )}

          {/* ── Stats Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 my-4">
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('assets.stats.total')}
                value={stats?.total || 0}
                icon={<Package className="w-5 h-5" />}
                color="blue"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('assets.stats.available')}
                value={stats?.available || 0}
                icon={<CheckCircle className="w-5 h-5" />}
                color="green"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('assets.stats.assigned')}
                value={stats?.assigned || 0}
                icon={<UserPlus className="w-5 h-5" />}
                color="purple"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('assets.stats.maintenance')}
                value={stats?.maintenance || 0}
                icon={<Wrench className="w-5 h-5" />}
                color="yellow"
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <StatsCard
                title={t('assets.stats.pendingRequests')}
                value={stats?.pendingRequests || 0}
                icon={<ClipboardCheck className="w-5 h-5" />}
                color="red"
              />
            </motion.div>
          </div>

          {/* ── Tabs ── */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2 md:grid-cols-4">
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="catalog"
              >
                <Monitor className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('assets.tabs.catalog')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="myAssets"
              >
                <UserPlus className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('assets.tabs.myAssets')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="requests"
              >
                <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('assets.tabs.requests')}</span>
              </TabsTrigger>
              <TabsTrigger
                className="w-full px-3 py-2.5 rounded-xl data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white data-[state=inactive]:bg-(--background-subtle) shadow-sm font-medium flex items-center justify-center gap-2 text-sm"
                value="maintenance"
              >
                <Wrench className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t('assets.tabs.maintenance')}</span>
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: Catalog ── */}
            <TabsContent value="catalog">
              <motion.div variants={itemVariants} className="space-y-4">
                {/* Controls */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <CardTitle className="text-lg">{t('assets.catalog')}</CardTitle>
                      <div className="flex flex-wrap gap-2 items-center">
                        {isSuperuser && (
                          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t('assets.addAsset')}
                          </Button>
                        )}
                        {/* View mode toggle */}
                        <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0 bg-muted">
                          <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-[#3b82f6] text-white' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
                            title={t('assets.gridView', 'Grid')}
                          >
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-[#3b82f6] text-white' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
                            title={t('assets.listView', 'List')}
                          >
                            <List className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                          <Input
                            placeholder={t('assets.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-48 sm:w-64"
                          />
                        </div>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="w-36">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder={t('assets.allCategories')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('assets.allCategories')}</SelectItem>
                            {Object.keys(CATEGORY_CONFIG).map((key) => {
                              const cfg = getCategoryCfg(key);
                              const Icon = cfg.icon;
                              return (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                                    {t(`assets.category.${key}`)}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-36">
                            <SelectValue placeholder={t('assets.allStatuses')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('assets.allStatuses')}</SelectItem>
                            <SelectItem value="available">
                              {t('assets.status.available')}
                            </SelectItem>
                            <SelectItem value="assigned">{t('assets.status.assigned')}</SelectItem>
                            <SelectItem value="maintenance">
                              {t('assets.status.maintenance')}
                            </SelectItem>
                            <SelectItem value="retired">{t('assets.status.retired')}</SelectItem>
                            <SelectItem value="lost">{t('assets.status.lost')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Asset Grid */}
                {selectedAssetDetail ? (
                  <AssetDetailCard
                    asset={selectedAssetDetail}
                    onAssign={() => {
                      setAssignDialogAsset(selectedAssetDetail);
                    }}
                    onReturn={() => {
                      const activeAssignment = selectedAssetDetail?.currentAssignment;
                      if (activeAssignment) {
                        setReturnDialogAssignment({
                          ...activeAssignment,
                          assetName: selectedAssetDetail.name,
                        });
                      }
                    }}
                    onClose={() => setSelectedAsset(null)}
                    userId={user?.id as Id<'users'>}
                    setQrCodeAsset={setQrCodeAsset}
                  />
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredAssets.length > 0 ? (
                      filteredAssets.map((asset) => {
                        const cfg = getCategoryCfg(asset.category);
                        const Icon = cfg.icon;
                        return (
                          <motion.div
                            key={asset._id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="group bg-(--card) border border-(--border) rounded-xl overflow-hidden hover:shadow-lg hover:border-(--primary)/30 transition-all cursor-pointer"
                            onClick={() => setSelectedAsset(asset)}
                          >
                            <div className="p-5">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                    style={{ backgroundColor: `${cfg.color}15` }}
                                  >
                                    <Icon className="w-6 h-6" style={{ color: cfg.color }} />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-(--text-primary) group-hover:text-(--primary) transition-colors">
                                      {asset.name}
                                    </p>
                                    <p className="text-xs text-(--text-muted) mt-0.5">
                                      {asset.brand && `${asset.brand} `}
                                      {asset.model}
                                    </p>
                                  </div>
                                </div>
                                {getStatusBadge(asset.status, t)}
                              </div>

                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-(--text-muted)">
                                    {t('assets.categoryLabel')}
                                  </span>
                                  <span className="text-(--text-primary)">
                                    {t(`assets.category.${asset.category}`)}
                                  </span>
                                </div>
                                {asset.serialNumber && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-(--text-muted)">SN</span>
                                    <span className="text-(--text-primary) font-mono text-xs">
                                      {asset.serialNumber}
                                    </span>
                                  </div>
                                )}
                                {asset.currentUser && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('assets.assignedTo')}
                                    </span>
                                    <span className="text-(--text-primary) font-medium">
                                      {asset.currentUser.name}
                                    </span>
                                  </div>
                                )}
                                {asset.location && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-(--text-muted)">
                                      {t('assets.location')}
                                    </span>
                                    <span className="text-(--text-primary)">{asset.location}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Hover Actions */}
                            {isSuperuser && (
                              <div className="px-5 py-2.5 bg-(--background-subtle)/50 border-t border-(--border) flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex gap-1">
                                  <QRButton asset={asset} setQrCodeAsset={setQrCodeAsset} t={t} />
                                  {asset.status === 'available' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAssignDialogAsset(asset);
                                      }}
                                    >
                                      <ArrowUpRight className="w-3 h-3 mr-1" />
                                      {t('assets.assign')}
                                    </Button>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmAsset(asset);
                                  }}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  {t('common.delete')}
                                </Button>
                              </div>
                            )}
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center py-16 text-(--text-muted)">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium mb-1">{t('assets.emptyCatalog')}</p>
                        <p className="text-sm mb-4">{t('assets.emptyCatalogHint')}</p>
                        {isSuperuser && (
                          <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t('assets.addFirst')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-(--border)">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-(--background-subtle) border-b border-(--border)">
                          <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                            {t('assets.name')}
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-(--text-muted)">
                            {t('assets.categoryLabel')}
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-(--text-muted)">
                            {t('assets.serialNumber')}
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-(--text-muted)">
                            {t('assets.assignedTo')}
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-(--text-muted)">
                            {t('assets.location')}
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-(--text-muted)">
                            {t('assets.statusLabel', 'Status')}
                          </th>
                          {isSuperuser && (
                            <th className="text-right px-4 py-3 font-semibold text-(--text-muted)">
                              {t('common.actions')}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--border)">
                        {paginatedAssets.length > 0 ? (
                          paginatedAssets.map((asset) => {
                            const cfg = getCategoryCfg(asset.category);
                            const Icon = cfg.icon;
                            return (
                              <tr
                                key={asset._id}
                                className="hover:bg-(--background-subtle)/50 transition-colors cursor-pointer"
                                onClick={() => setSelectedAsset(asset)}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                      style={{ backgroundColor: `${cfg.color}15` }}
                                    >
                                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                                    </div>
                                    <div>
                                      <p className="font-medium text-(--text-primary)">
                                        {asset.name}
                                      </p>
                                      <p className="text-xs text-(--text-muted)">
                                        {asset.brand && `${asset.brand} `}
                                        {asset.model}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-(--text-primary)">
                                  <div className="flex items-center gap-1.5">
                                    <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                                    <span>{t(`assets.category.${asset.category}`)}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-(--text-primary)">
                                  {asset.serialNumber || '—'}
                                </td>
                                <td className="px-4 py-3 text-(--text-primary)">
                                  {asset.currentUser?.name || '—'}
                                </td>
                                <td className="px-4 py-3 text-(--text-primary)">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-(--text-muted)" />
                                    {asset.location || '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3">{getStatusBadge(asset.status, t)}</td>
                                {isSuperuser && (
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <QRButton
                                        asset={asset}
                                        setQrCodeAsset={setQrCodeAsset}
                                        t={t}
                                      />
                                      {asset.status === 'available' && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setAssignDialogAsset(asset);
                                          }}
                                        >
                                          <ArrowUpRight className="w-3 h-3 mr-1" />
                                          {t('assets.assign')}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConfirmAsset(asset);
                                        }}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={isSuperuser ? 7 : 6}
                              className="text-center py-16 text-(--text-muted)"
                            >
                              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                              <p className="text-lg font-medium mb-1">{t('assets.emptyCatalog')}</p>
                              <p className="text-sm mb-4">{t('assets.emptyCatalogHint')}</p>
                              {isSuperuser && (
                                <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                                  <Plus className="w-4 h-4 mr-2" />
                                  {t('assets.addFirst')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {/* footer with pagination */}
                    {filteredAssets.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-(--border) bg-(--background-subtle)/30 text-xs text-(--text-muted) flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span>
                            {filteredAssets.length} {t('assets.assets', 'assets')}
                          </span>
                          <span className="text-(--border)">|</span>
                          <span className="flex items-center gap-1">
                            {t('assets.show', 'Show')}
                            <select
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(0);
                              }}
                              className="bg-(--card) border border-(--border) rounded px-1 py-0.5 text-xs text-(--text-primary)"
                            >
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPage(Math.max(0, safePage - 1))}
                            disabled={safePage === 0}
                            className="px-2 py-0.5 rounded border border-(--border) disabled:opacity-30 hover:bg-(--background-subtle) transition-colors"
                          >
                            ‹ {t('common.prev', 'Prev')}
                          </button>
                          <span className="font-medium">
                            {safePage + 1} / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                            disabled={safePage >= totalPages - 1}
                            className="px-2 py-0.5 rounded border border-(--border) disabled:opacity-30 hover:bg-(--background-subtle) transition-colors"
                          >
                            {t('common.next', 'Next')} ›
                          </button>
                          <span className="text-(--border)">|</span>
                          <button
                            type="button"
                            className="text-(--primary) hover:underline"
                            onClick={() => setViewMode('grid')}
                          >
                            <LayoutGrid className="w-3 h-3 inline mr-1" />
                            {t('assets.gridView', 'Grid view')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {/* ── TAB: My Assets ── */}
            <TabsContent value="myAssets">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('assets.myAssets')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeAssets && employeeAssets.length > 0 ? (
                      <div className="space-y-3">
                        {employeeAssets
                          .filter((a) => a.status === 'active')
                          .map((a) => {
                            const cfg = getCategoryCfg(a.assetCategory);
                            const Icon = cfg.icon;
                            return (
                              <div
                                key={a._id}
                                className="flex flex-wrap gap-3 items-center justify-between p-4 rounded-xl bg-(--card) border border-(--border)"
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ backgroundColor: `${cfg.color}15` }}
                                  >
                                    <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                                  </div>
                                  <div>
                                    <p className="font-medium text-(--text-primary)">
                                      {a.assetName}
                                    </p>
                                    <p className="text-xs text-(--text-muted)">
                                      {t(`assets.category.${a.assetCategory}`)} ·{' '}
                                      {formatDate(a.assignedAt)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {a.movementFormStatus === 'pending' && (
                                    <Link
                                      href="/signatures"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                                    >
                                      <FileSignature className="w-3 h-3" />
                                      {t('assets.movementForm.status.pending')}
                                    </Link>
                                  )}
                                  {a.movementFormStatus === 'signed' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                      <FileText className="w-3 h-3" />
                                      {t('assets.movementForm.status.signed')}
                                    </span>
                                  )}
                                  {a.expectedReturnAt && (
                                    <span className="text-xs text-(--text-muted)">
                                      {t('assets.returnBy')} {formatDate(a.expectedReturnAt)}
                                    </span>
                                  )}
                                  <QRButton
                                    asset={{
                                      _id: a.assetId,
                                      name: a.assetName,
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      serialNumber: (a as any).assetSerialNumber,
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      assetTag: (a as any).assetTag,
                                      category: a.assetCategory,
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      brand: (a as any).assetBrand,
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      model: (a as any).assetModel,
                                    }}
                                    setQrCodeAsset={setQrCodeAsset}
                                    t={t}
                                  />
                                  {isSuperuser && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setReturnDialogAssignment(a)}
                                    >
                                      <ArrowDownLeft className="w-3 h-3 mr-1" />
                                      {t('assets.return')}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {/* History */}
                        {employeeAssets.filter((a) => a.status !== 'active').length > 0 && (
                          <div className="mt-6">
                            <h4 className="text-sm font-semibold text-(--text-primary) mb-3 flex items-center gap-2">
                              <History className="w-4 h-4" />
                              {t('assets.previouslyAssigned')}
                            </h4>
                            <div className="space-y-2">
                              {employeeAssets
                                .filter((a) => a.status !== 'active')
                                .slice(0, 5)
                                .map((a) => (
                                  <div
                                    key={a._id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border) text-sm"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-(--text-primary)">{a.assetName}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-(--text-muted)">
                                      <span>{formatDate(a.assignedAt)}</span>
                                      <span>→</span>
                                      <span>{a.returnedAt ? formatDate(a.returnedAt) : '—'}</span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* My Requests */}
                        {myRequests && myRequests.length > 0 && (
                          <div className="mt-6">
                            <h4 className="text-sm font-semibold text-(--text-primary) mb-3 flex items-center gap-2">
                              <ClipboardCheck className="w-4 h-4" />
                              {t('assets.myRequests')}
                            </h4>
                            <div className="space-y-2">
                              {myRequests.slice(0, 5).map((r) => (
                                <div
                                  key={r._id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-(--background-subtle) border border-(--border) text-sm"
                                >
                                  <div>
                                    <p className="text-(--text-primary) font-medium">
                                      {t(`assets.requestCategory.${r.category}`)}
                                    </p>
                                    <p className="text-xs text-(--text-muted)">{r.reason}</p>
                                  </div>
                                  {getStatusBadge(r.status, t)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-(--text-muted)">
                        <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium mb-1">{t('assets.noAssetsAssigned')}</p>
                        <p className="text-sm">{t('assets.noAssetsAssignedHint')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* ── TAB: Requests ── */}
            <TabsContent value="requests">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('assets.requests')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {requests && requests.length > 0 ? (
                      <div className="space-y-3">
                        {requests.map((req) => {
                          const urgencyColors: Record<string, string> = {
                            low: 'bg-slate-500/15 text-slate-500',
                            medium: 'bg-amber-500/15 text-amber-500',
                            high: 'bg-red-500/15 text-red-500',
                          };
                          return (
                            <div
                              key={req._id}
                              className="flex flex-wrap gap-3 items-center justify-between p-4 rounded-xl bg-(--card) border border-(--border)"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center flex-shrink-0">
                                  <ClipboardCheck className="w-5 h-5 text-(--primary)" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-(--text-primary) truncate">
                                    {t(`assets.requestCategory.${req.category}`)} —{' '}
                                    {req.requesterName}
                                  </p>
                                  <p className="text-sm text-(--text-muted) truncate">
                                    {req.reason}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${urgencyColors[req.urgency]}`}
                                >
                                  {t(`assets.urgency.${req.urgency}`)}
                                </span>
                                {getStatusBadge(req.status, t)}
                                {req.status === 'pending' && isSuperuser && (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8"
                                      onClick={() =>
                                        approveRequest({
                                          requestId: req._id,
                                          approvedBy: user!.id as Id<'users'>,
                                        })
                                      }
                                    >
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      {t('common.approve')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-destructive"
                                      onClick={() =>
                                        rejectRequest({
                                          requestId: req._id,
                                          approvedBy: user!.id as Id<'users'>,
                                        })
                                      }
                                    >
                                      <X className="w-3 h-3 mr-1" />
                                      {t('common.reject')}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-(--text-muted)">
                        <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium mb-1">{t('assets.noRequests')}</p>
                        <p className="text-sm">{t('assets.noRequestsHint')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* ── TAB: Maintenance ── */}
            <TabsContent value="maintenance">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('assets.maintenance')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {maintenanceRecords && maintenanceRecords.length > 0 ? (
                      <div className="space-y-3">
                        {maintenanceRecords.map((m) => {
                          const typeIcons: Record<string, string> = {
                            scheduled: '🔧',
                            repair: '🔨',
                            upgrade: '⬆️',
                            inspection: '🔍',
                          };
                          return (
                            <div
                              key={m._id}
                              className="flex flex-wrap gap-3 items-center justify-between p-4 rounded-xl bg-(--card) border border-(--border)"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-(--background-subtle) flex items-center justify-center text-lg">
                                  {typeIcons[m.type] || '🔧'}
                                </div>
                                <div>
                                  <p className="font-medium text-(--text-primary)">{m.assetName}</p>
                                  <p className="text-sm text-(--text-muted)">{m.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-(--text-muted)">
                                  {m.scheduledDate && formatDate(m.scheduledDate)}
                                </span>
                                {getStatusBadge(m.status, t)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-(--text-muted)">
                        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium mb-1">{t('assets.noMaintenance')}</p>
                        <p className="text-sm">{t('assets.noMaintenanceHint')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>

          {/* ── Charts ── */}
          {stats && categoryChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('assets.byCategory')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}
                        />
                        <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 13 }} />
                        <YAxis tick={{ fill: textColor, fontSize: 13 }} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            border: `1px solid ${tooltipBorder}`,
                            borderRadius: '0.5rem',
                            color: tooltipColor,
                            boxShadow: tooltipShadow,
                          }}
                          labelStyle={{ color: tooltipColor, fontWeight: 500 }}
                          formatter={(value, _name) => [value, t('assets.count')]}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {categoryChartData.map((entry: any, idx: number) => (
                            <Cell key={idx} fill={entry.color || COLORS[idx % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('assets.byStatus')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center h-[300px]">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 w-full px-4">
                        {[
                          {
                            label: t('assets.status.available'),
                            value: stats.available || 0,
                            color: '#10b981',
                          },
                          {
                            label: t('assets.status.assigned'),
                            value: stats.assigned || 0,
                            color: '#3b82f6',
                          },
                          {
                            label: t('assets.status.maintenance'),
                            value: stats.maintenance || 0,
                            color: '#f59e0b',
                          },
                          {
                            label: t('assets.status.retired'),
                            value: stats.retired || 0,
                            color: '#64748b',
                          },
                          {
                            label: t('assets.status.lost'),
                            value: stats.lost || 0,
                            color: '#ef4444',
                          },
                        ]
                          .filter((d) => d.value > 0)
                          .map((d) => (
                            <div
                              key={d.label}
                              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background-subtle border border-border"
                            >
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: d.color }}
                              />
                              <span className="text-2xl font-bold text-foreground">{d.value}</span>
                              <span className="text-xs text-muted-foreground text-center">
                                {d.label}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{t('assets.createTitle')}</DialogTitle>
            <DialogDescription>{t('assets.createDescription')}</DialogDescription>
          </DialogHeader>
          {orgId && user && (
            <AssetWizard
              orgId={orgId}
              userId={user.id as Id<'users'>}
              onComplete={() => setCreateDialogOpen(false)}
              onCancel={() => setCreateDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {assignDialogAsset && orgId && user && (
        <AssignDialog
          open={!!assignDialogAsset}
          onOpenChange={() => setAssignDialogAsset(null)}
          asset={assignDialogAsset}
          orgId={orgId}
          userId={user.id as Id<'users'>}
        />
      )}

      {returnDialogAssignment && user && (
        <ReturnDialog
          open={!!returnDialogAssignment}
          onOpenChange={() => setReturnDialogAssignment(null)}
          assignment={returnDialogAssignment}
          userId={user.id as Id<'users'>}
        />
      )}

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteConfirmAsset}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirmAsset(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          {deleteConfirmAsset?.isAssigned ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <X className="w-5 h-5" />
                  {t('assets.cannotDelete', 'Cannot Delete')}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'assets.deleteAssignedWarning',
                    'This asset is currently assigned to a user. Please return it first, then delete.',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 my-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-amber-600 text-sm font-bold">!</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      <strong>{deleteConfirmAsset.name}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('assets.assignedTo')}:{' '}
                      <strong>{deleteConfirmAsset.currentUser?.name || t('common.unknown')}</strong>
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDeleteConfirmAsset(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    const asset = deleteConfirmAsset;
                    setDeleteConfirmAsset(null);
                    setSelectedAsset(asset);
                  }}
                >
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  {t('assets.openDetails', 'Open Asset Details')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <X className="w-5 h-5" />
                  {t('assets.confirmDelete', 'Delete Asset')}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'assets.deleteConfirmMessage',
                    'Are you sure you want to delete this asset? This action cannot be undone.',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-background-subtle rounded-xl p-4 my-4">
                <p className="text-sm font-medium text-foreground">
                  <strong>{deleteConfirmAsset?.name || '—'}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {deleteConfirmAsset?.serialNumber && `SN: ${deleteConfirmAsset.serialNumber}`}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmAsset(null)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(deleteConfirmAsset._id)}>
                  <X className="w-4 h-4 mr-2" />
                  {t('common.delete')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
