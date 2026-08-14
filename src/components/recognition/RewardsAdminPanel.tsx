'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  KeyRound,
  Upload,
  Settings2,
  ScanLine,
  Check,
  X,
  Wallet,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import {
  CATEGORY_ICONS,
  CATEGORY_TONE,
  VoucherStatusBadge,
  formatMoney,
  type RewardCategory,
} from './RewardsTab';

const CATEGORIES: RewardCategory[] = [
  'coffee',
  'meal',
  'experience',
  'time_off',
  'merch',
  'charity',
  'other',
];

/**
 * Starter shelf.
 *
 * A catalog that opens empty gets abandoned, so the panel offers a one-click
 * set of realistic Yerevan-priced items. Face values are typical mid-2026 city
 * prices (a cappuccino around 1,300 AMD, a cheap lunch around 4,000) and are
 * meant to be edited, not trusted.
 */
const STARTER_ITEMS: Array<{
  nameKey: string;
  category: RewardCategory;
  emoji: string;
  faceValue: number;
  costPoints: number;
  fulfillment: 'manual' | 'code_pool';
  requiresCompanion?: boolean;
  requiresApproval?: boolean;
  perUserLimitPerMonth?: number;
}> = [
  {
    nameKey: 'coffee',
    category: 'coffee',
    emoji: '☕',
    faceValue: 1300,
    costPoints: 13,
    fulfillment: 'manual',
  },
  {
    nameKey: 'coffeeForTwo',
    category: 'coffee',
    emoji: '👯',
    faceValue: 2600,
    costPoints: 26,
    fulfillment: 'manual',
    requiresCompanion: true,
  },
  {
    nameKey: 'lunch',
    category: 'meal',
    emoji: '🍽️',
    faceValue: 4000,
    costPoints: 40,
    fulfillment: 'manual',
  },
  {
    nameKey: 'cinema',
    category: 'experience',
    emoji: '🎬',
    faceValue: 5000,
    costPoints: 50,
    fulfillment: 'code_pool',
  },
  {
    nameKey: 'earlyFriday',
    category: 'time_off',
    emoji: '🌅',
    faceValue: 0,
    costPoints: 60,
    fulfillment: 'manual',
    requiresApproval: true,
    perUserLimitPerMonth: 1,
  },
  {
    nameKey: 'dinnerForTwo',
    category: 'meal',
    emoji: '🍷',
    faceValue: 16500,
    costPoints: 165,
    fulfillment: 'manual',
    requiresApproval: true,
    requiresCompanion: true,
  },
];

interface RewardsAdminPanelProps {
  organizationId: Id<'organizations'>;
}

export function RewardsAdminPanel({ organizationId }: RewardsAdminPanelProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<Doc<'rewardItems'> | null>(null);
  const [creating, setCreating] = useState(false);
  const [codesFor, setCodesFor] = useState<Doc<'rewardItems'> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const summary = useQuery(api.rewards.getSummary, { organizationId });
  const catalog = useQuery(api.rewards.listCatalog, { organizationId, includeArchived: true });
  const createItem = useMutation(api.rewards.createItem);
  const setItemStatus = useMutation(api.rewards.setItemStatus);
  const removeItem = useMutation(api.rewards.removeItem);

  const currency = summary?.settings.currency ?? 'AMD';

  const seedStarterCatalog = async () => {
    setSeeding(true);
    try {
      for (const preset of STARTER_ITEMS) {
        await createItem({
          organizationId,
          name: t(`rewards.starter.${preset.nameKey}.name`),
          description: t(`rewards.starter.${preset.nameKey}.description`),
          category: preset.category,
          emoji: preset.emoji,
          costPoints: preset.costPoints,
          faceValue: preset.faceValue,
          fulfillment: preset.fulfillment,
          requiresApproval: preset.requiresApproval,
          requiresCompanion: preset.requiresCompanion,
          perUserLimitPerMonth: preset.perUserLimitPerMonth,
        });
      }
      toast.success(t('rewards.admin.starterAdded'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.admin.saveFailed'));
    } finally {
      setSeeding(false);
    }
  };

  if (catalog === undefined || summary === undefined) return <ShieldLoader size="md" />;
  if (summary === null) {
    return <p className="text-sm text-muted-foreground">{t('rewards.admin.noAccess')}</p>;
  }

  const budgetUsed = summary.monthlyBudgetCap
    ? Math.min(100, Math.round((summary.monthSpend / summary.monthlyBudgetCap) * 100))
    : null;

  return (
    <div className="space-y-6">
      {/* Budget and liability */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('rewards.admin.monthSpend')}</p>
            <p className="text-2xl font-bold">
              {formatMoney(summary.monthSpend, currency, i18n.language)}
            </p>
            {summary.monthlyBudgetCap !== undefined && (
              <>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div
                    className={`h-full ${budgetUsed && budgetUsed > 85 ? 'bg-destructive' : 'bg-primary/70'}`}
                    style={{ width: `${budgetUsed ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('rewards.admin.ofCap', {
                    cap: formatMoney(summary.monthlyBudgetCap, currency, i18n.language),
                  })}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('rewards.admin.outstanding')}</p>
            <p className="text-2xl font-bold">
              {formatMoney(summary.outstandingValue, currency, i18n.language)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('rewards.admin.outstandingPoints', { count: summary.outstandingPoints })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('rewards.admin.vouchers')}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(['pending', 'issued', 'redeemed', 'expired', 'cancelled'] as const).map((key) => (
                <Badge key={key} variant="outline" className="font-normal">
                  {t(`rewards.status.${key}`)}: {summary.counts[key]}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreating(true)} className="gap-1">
          <Plus className="h-4 w-4" />
          {t('rewards.admin.newItem')}
        </Button>
        <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-1">
          <Settings2 className="h-4 w-4" />
          {t('rewards.admin.economy')}
        </Button>
        {catalog.length === 0 && (
          <Button
            variant="outline"
            onClick={seedStarterCatalog}
            disabled={seeding}
            className="gap-1"
          >
            <Gift className="h-4 w-4" />
            {seeding ? t('common.sending') : t('rewards.admin.addStarter')}
          </Button>
        )}
      </div>

      {/* Catalog list */}
      {catalog.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Gift className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="font-medium">{t('rewards.admin.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {t('rewards.admin.emptyDescription')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {catalog.map((item) => (
            <AdminItemRow
              key={item._id}
              item={item as Doc<'rewardItems'> & { codesAvailable: number | null }}
              currency={currency}
              onEdit={() => setEditing(item as Doc<'rewardItems'>)}
              onCodes={() => setCodesFor(item as Doc<'rewardItems'>)}
              onArchive={async () => {
                try {
                  await setItemStatus({
                    itemId: item._id,
                    status: item.status === 'active' ? 'archived' : 'active',
                  });
                } catch (error: unknown) {
                  toast.error(
                    error instanceof Error ? error.message : t('rewards.admin.saveFailed'),
                  );
                }
              }}
              onDelete={async () => {
                try {
                  await removeItem({ itemId: item._id });
                  toast.success(t('rewards.admin.deleted'));
                } catch (error: unknown) {
                  toast.error(
                    error instanceof Error ? error.message : t('rewards.admin.saveFailed'),
                  );
                }
              }}
            />
          ))}
        </div>
      )}

      <RedemptionDesk organizationId={organizationId} />
      <VoucherRegistry organizationId={organizationId} currency={currency} />

      {(creating || editing) && (
        <ItemDialog
          organizationId={organizationId}
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {codesFor && <CodePoolDialog item={codesFor} onClose={() => setCodesFor(null)} />}

      {showSettings && summary && (
        <EconomyDialog
          organizationId={organizationId}
          settings={summary.settings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ── Catalog row ──────────────────────────────────────────────────────────────

function AdminItemRow({
  item,
  currency,
  onEdit,
  onCodes,
  onArchive,
  onDelete,
}: {
  item: Doc<'rewardItems'> & { codesAvailable: number | null };
  currency: string;
  onEdit: () => void;
  onCodes: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = CATEGORY_ICONS[item.category as RewardCategory] ?? Gift;
  const poolEmpty = item.fulfillment === 'code_pool' && (item.codesAvailable ?? 0) === 0;

  return (
    <Card className={item.status === 'archived' ? 'opacity-60' : undefined}>
      <CardContent className="py-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-xl p-2 ${CATEGORY_TONE[item.category as RewardCategory]}`}
          aria-hidden
        >
          {item.emoji ? (
            <span className="text-base leading-none">{item.emoji}</span>
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{item.name}</p>
            <Badge variant="secondary" className="font-normal">
              {item.costPoints} {t('rewards.pointsShort')}
            </Badge>
            {item.faceValue !== undefined && item.faceValue > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatMoney(item.faceValue, currency, i18n.language)}
              </span>
            )}
            {item.status === 'archived' && (
              <Badge variant="outline" className="font-normal">
                {t('rewards.admin.archived')}
              </Badge>
            )}
            {poolEmpty && (
              <Badge variant="destructive" className="gap-1 font-normal">
                <AlertTriangle className="h-3 w-3" />
                {t('rewards.admin.poolEmpty')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(`rewards.category.${item.category}`)} ·{' '}
            {t(`rewards.admin.fulfillment.${item.fulfillment}`)} ·{' '}
            {t('rewards.admin.issuedCount', { count: item.issuedCount })}
            {item.codesAvailable !== null
              ? ` · ${t('rewards.codesLeft', { count: item.codesAvailable })}`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {item.fulfillment === 'code_pool' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCodes}
              aria-label={t('rewards.admin.codes')}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onArchive}
            aria-label={
              item.status === 'active' ? t('rewards.admin.archive') : t('rewards.admin.restore')
            }
          >
            {item.status === 'active' ? (
              <Archive className="h-4 w-4" />
            ) : (
              <ArchiveRestore className="h-4 w-4" />
            )}
          </Button>
          {item.issuedCount === 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t('common.delete')}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Item editor ──────────────────────────────────────────────────────────────

function ItemDialog({
  organizationId,
  item,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  item: Doc<'rewardItems'> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createItem = useMutation(api.rewards.createItem);
  const updateItem = useMutation(api.rewards.updateItem);

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState<RewardCategory>(
    (item?.category as RewardCategory) ?? 'coffee',
  );
  const [emoji, setEmoji] = useState(item?.emoji ?? '');
  const [costPoints, setCostPoints] = useState(String(item?.costPoints ?? 13));
  const [faceValue, setFaceValue] = useState(
    item?.faceValue !== undefined ? String(item.faceValue) : '',
  );
  const [fulfillment, setFulfillment] = useState<'manual' | 'code_pool'>(
    item?.fulfillment ?? 'manual',
  );
  const [instructions, setInstructions] = useState(item?.instructions ?? '');
  const [stockLimit, setStockLimit] = useState(
    item?.stockLimit !== undefined ? String(item.stockLimit) : '',
  );
  const [perUserLimit, setPerUserLimit] = useState(
    item?.perUserLimitPerMonth !== undefined ? String(item.perUserLimitPerMonth) : '',
  );
  const [requiresApproval, setRequiresApproval] = useState(item?.requiresApproval ?? false);
  const [requiresCompanion, setRequiresCompanion] = useState(item?.requiresCompanion ?? false);
  const [validDays, setValidDays] = useState(
    item?.validDays !== undefined ? String(item.validDays) : '',
  );
  const [busy, setBusy] = useState(false);

  const numberOrUndefined = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const save = async () => {
    setBusy(true);
    try {
      if (item) {
        await updateItem({
          itemId: item._id,
          name,
          description,
          category,
          emoji,
          costPoints: Number(costPoints) || item.costPoints,
          faceValue: numberOrUndefined(faceValue),
          instructions,
          stockLimit: numberOrUndefined(stockLimit) ?? null,
          perUserLimitPerMonth: numberOrUndefined(perUserLimit) ?? null,
          requiresApproval,
          requiresCompanion,
          validDays: numberOrUndefined(validDays) ?? null,
        });
      } else {
        await createItem({
          organizationId,
          name,
          description,
          category,
          emoji,
          costPoints: Number(costPoints) || 1,
          faceValue: numberOrUndefined(faceValue),
          fulfillment,
          instructions,
          stockLimit: numberOrUndefined(stockLimit),
          perUserLimitPerMonth: numberOrUndefined(perUserLimit),
          requiresApproval,
          requiresCompanion,
          validDays: numberOrUndefined(validDays),
        });
      }
      toast.success(t('rewards.admin.saved'));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.admin.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{item ? t('rewards.admin.editItem') : t('rewards.admin.newItem')}</SheetTitle>
          <SheetDescription>{t('rewards.admin.itemHint')}</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reward-name">{t('rewards.admin.name')}</Label>
              <Input id="reward-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5 w-20">
              <Label htmlFor="reward-emoji">{t('rewards.admin.emoji')}</Label>
              <Input
                id="reward-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="text-center"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reward-description">{t('rewards.admin.description')}</Label>
            <Textarea
              id="reward-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reward-category">{t('rewards.admin.category')}</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as RewardCategory)}
              >
                <SelectTrigger id="reward-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`rewards.category.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reward-fulfillment">{t('rewards.admin.fulfillmentLabel')}</Label>
              <Select
                value={fulfillment}
                onValueChange={(value) => setFulfillment(value as 'manual' | 'code_pool')}
                disabled={!!item}
              >
                <SelectTrigger id="reward-fulfillment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('rewards.admin.fulfillment.manual')}</SelectItem>
                  <SelectItem value="code_pool">
                    {t('rewards.admin.fulfillment.code_pool')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reward-cost">{t('rewards.admin.costPoints')}</Label>
              <Input
                id="reward-cost"
                type="number"
                min={1}
                value={costPoints}
                onChange={(e) => setCostPoints(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reward-face">{t('rewards.admin.faceValue')}</Label>
              <Input
                id="reward-face"
                type="number"
                min={0}
                value={faceValue}
                onChange={(e) => setFaceValue(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reward-instructions">{t('rewards.admin.instructions')}</Label>
            <Textarea
              id="reward-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              placeholder={t('rewards.admin.instructionsPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reward-stock">{t('rewards.admin.stockLimit')}</Label>
              <Input
                id="reward-stock"
                type="number"
                min={0}
                value={stockLimit}
                onChange={(e) => setStockLimit(e.target.value)}
                placeholder="∞"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reward-per-user">{t('rewards.admin.perUserLimit')}</Label>
              <Input
                id="reward-per-user"
                type="number"
                min={1}
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                placeholder="∞"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reward-valid">{t('rewards.admin.validDays')}</Label>
              <Input
                id="reward-valid"
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={requiresApproval}
                onCheckedChange={(checked) => setRequiresApproval(checked === true)}
              />
              {t('rewards.admin.requiresApproval')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={requiresCompanion}
                onCheckedChange={(checked) => setRequiresCompanion(checked === true)}
              />
              {t('rewards.admin.requiresCompanion')}
            </label>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Code pool ────────────────────────────────────────────────────────────────

function CodePoolDialog({ item, onClose }: { item: Doc<'rewardItems'>; onClose: () => void }) {
  const { t } = useTranslation();
  const codes = useQuery(api.rewards.listCodes, { rewardItemId: item._id });
  const uploadCodes = useMutation(api.rewards.uploadCodes);
  const voidCode = useMutation(api.rewards.voidCode);
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(
    () => [
      ...new Set(
        raw
          .split(/[\s,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    [raw],
  );

  const available = (codes ?? []).filter((code) => code.status === 'available').length;
  const assigned = (codes ?? []).filter((code) => code.status === 'assigned').length;

  const upload = async () => {
    setBusy(true);
    try {
      const result = await uploadCodes({
        itemId: item._id,
        codes: parsed,
        note: note.trim() || undefined,
      });
      toast.success(
        t('rewards.admin.codesUploaded', { added: result.added, skipped: result.skipped }),
      );
      setRaw('');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.admin.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {item.name}
          </SheetTitle>
          <SheetDescription>{t('rewards.admin.codesHint')}</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div className="flex gap-2 text-sm">
            <Badge variant="secondary" className="font-normal">
              {t('rewards.admin.codesAvailable', { count: available })}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {t('rewards.admin.codesAssigned', { count: assigned })}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pool-codes">{t('rewards.admin.pasteCodes')}</Label>
            <Textarea
              id="pool-codes"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={5}
              placeholder={'JAZZVE-4KD9\nJAZZVE-7PL2\n…'}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('rewards.admin.parsedCount', { count: parsed.length })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pool-note">{t('rewards.admin.batchNote')}</Label>
            <Input
              id="pool-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('rewards.admin.batchNotePlaceholder')}
            />
          </div>

          <Button onClick={upload} disabled={busy || parsed.length === 0} className="gap-1 w-full">
            <Upload className="h-4 w-4" />
            {busy ? t('common.sending') : t('rewards.admin.upload')}
          </Button>

          {codes && codes.length > 0 && (
            <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
              {codes.map((code) => (
                <div key={code._id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-sm truncate">{code.code}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={code.status === 'available' ? 'secondary' : 'outline'}
                      className="font-normal"
                    >
                      {t(`rewards.admin.codeStatus.${code.status}`)}
                    </Badge>
                    {code.status === 'available' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label={t('rewards.admin.voidCode')}
                        onClick={async () => {
                          try {
                            await voidCode({ codeId: code._id });
                          } catch (error: unknown) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : t('rewards.admin.saveFailed'),
                            );
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Economy settings ─────────────────────────────────────────────────────────

function EconomyDialog({
  organizationId,
  settings,
  onClose,
}: {
  organizationId: Id<'organizations'>;
  settings: {
    currency: string;
    pointValue: number;
    monthlyAllowance: number;
    kudosCost: number;
    receiverReward: number;
    attendanceReward: number;
    reviewReward: number;
    maxKudosPerColleaguePerMonth: number;
    voucherValidDays: number;
    monthlyBudgetCap?: number;
  };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useMutation(api.rewards.updateSettings);
  const [form, setForm] = useState({
    currency: settings.currency,
    pointValue: String(settings.pointValue),
    monthlyAllowance: String(settings.monthlyAllowance),
    kudosCost: String(settings.kudosCost),
    receiverReward: String(settings.receiverReward),
    attendanceReward: String(settings.attendanceReward),
    reviewReward: String(settings.reviewReward),
    maxKudosPerColleaguePerMonth: String(settings.maxKudosPerColleaguePerMonth),
    voucherValidDays: String(settings.voucherValidDays),
    monthlyBudgetCap:
      settings.monthlyBudgetCap !== undefined ? String(settings.monthlyBudgetCap) : '',
  });
  const [busy, setBusy] = useState(false);

  const num = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  /** What the giving allowance costs per head per month, in money. */
  const perHeadCost =
    num(form.monthlyAllowance, 0) > 0 && num(form.kudosCost, 1) > 0
      ? (num(form.monthlyAllowance, 0) / num(form.kudosCost, 1)) *
        num(form.receiverReward, 0) *
        num(form.pointValue, 0)
      : 0;

  const save = async () => {
    setBusy(true);
    try {
      await update({
        organizationId,
        currency: form.currency,
        pointValue: num(form.pointValue, settings.pointValue),
        monthlyAllowance: num(form.monthlyAllowance, settings.monthlyAllowance),
        kudosCost: num(form.kudosCost, settings.kudosCost),
        receiverReward: num(form.receiverReward, settings.receiverReward),
        attendanceReward: num(form.attendanceReward, settings.attendanceReward),
        reviewReward: num(form.reviewReward, settings.reviewReward),
        maxKudosPerColleaguePerMonth: num(
          form.maxKudosPerColleaguePerMonth,
          settings.maxKudosPerColleaguePerMonth,
        ),
        voucherValidDays: num(form.voucherValidDays, settings.voucherValidDays),
        monthlyBudgetCap: form.monthlyBudgetCap.trim() ? num(form.monthlyBudgetCap, 0) : null,
      });
      toast.success(t('rewards.admin.saved'));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.admin.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, labelKey: string, hintKey?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`economy-${key}`}>{t(labelKey)}</Label>
      <Input
        id={`economy-${key}`}
        value={form[key]}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
        inputMode={key === 'currency' ? 'text' : 'numeric'}
      />
      {hintKey && <p className="text-xs text-muted-foreground">{t(hintKey)}</p>}
    </div>
  );

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {t('rewards.admin.economy')}
          </SheetTitle>
          <SheetDescription>{t('rewards.admin.economyHint')}</SheetDescription>
        </SheetHeader>

        <SheetBody className="grid grid-cols-2 gap-3">
          {field('currency', 'rewards.admin.currency')}
          {field('pointValue', 'rewards.admin.pointValue', 'rewards.admin.pointValueHint')}
          {field(
            'monthlyAllowance',
            'rewards.admin.monthlyAllowance',
            'rewards.admin.allowanceHint',
          )}
          {field('kudosCost', 'rewards.admin.kudosCost')}
          {field('receiverReward', 'rewards.admin.receiverReward', 'rewards.admin.receiverHint')}
          {field(
            'maxKudosPerColleaguePerMonth',
            'rewards.admin.maxPerColleague',
            'rewards.admin.maxPerColleagueHint',
          )}
          {field(
            'attendanceReward',
            'rewards.admin.attendanceReward',
            'rewards.admin.attendanceHint',
          )}
          {field('reviewReward', 'rewards.admin.reviewReward')}
          {field('voucherValidDays', 'rewards.admin.voucherValidDays')}
          {field('monthlyBudgetCap', 'rewards.admin.budgetCap', 'rewards.admin.budgetCapHint')}
        </SheetBody>

        <p className="text-xs text-muted-foreground px-5 pb-2">
          {t('rewards.admin.forecast', {
            amount: formatMoney(perHeadCost, form.currency || 'AMD', 'en'),
          })}
        </p>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Redemption desk ──────────────────────────────────────────────────────────

/**
 * Where a voucher is turned in. Staff types or scans the code; the lookup is a
 * separate query so nothing is mutated until the reward is actually handed over.
 */
function RedemptionDesk({ organizationId }: { organizationId: Id<'organizations'> }) {
  const { t, i18n } = useTranslation();
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState(false);

  const found = useQuery(
    api.rewards.findVoucherByCode,
    submitted ? { organizationId, code: submitted } : 'skip',
  );
  const markRedeemed = useMutation(api.rewards.markRedeemed);

  const redeem = async () => {
    if (!found) return;
    setBusy(true);
    try {
      await markRedeemed({ voucherId: found._id });
      toast.success(t('rewards.admin.markedRedeemed'));
      setCode('');
      setSubmitted('');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.admin.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4" />
          <h3 className="font-semibold">{t('rewards.admin.desk')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{t('rewards.admin.deskHint')}</p>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(code.trim().toUpperCase());
          }}
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="RW-XXXX-XXXX"
            className="font-mono"
            aria-label={t('rewards.admin.voucherCode')}
          />
          <Button type="submit" variant="outline">
            {t('rewards.admin.find')}
          </Button>
        </form>

        {submitted && found === null && (
          <p className="text-sm text-destructive">{t('rewards.admin.notFound')}</p>
        )}

        {found && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{found.title}</p>
                <p className="text-sm text-muted-foreground">
                  {found.recipient?.name ?? '—'} ·{' '}
                  {t('rewards.validUntil', {
                    date: new Date(found.expiresAt).toLocaleDateString(i18n.language),
                  })}
                </p>
              </div>
              <VoucherStatusBadge status={found.status} isExpired={found.isExpired} />
            </div>

            {found.instructions && (
              <p className="text-xs text-muted-foreground">{found.instructions}</p>
            )}
            {found.note && <p className="text-xs italic">“{found.note}”</p>}

            <Button
              onClick={redeem}
              disabled={busy || found.status !== 'issued' || found.isExpired}
              className="gap-1"
              size="sm"
            >
              <Check className="h-4 w-4" />
              {t('rewards.admin.markRedeemed')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Voucher registry ─────────────────────────────────────────────────────────

function VoucherRegistry({
  organizationId,
  currency,
}: {
  organizationId: Id<'organizations'>;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<'all' | 'pending' | 'issued' | 'redeemed' | 'cancelled'>(
    'all',
  );
  const [search, setSearch] = useState('');

  const vouchers = useQuery(api.rewards.listVouchers, {
    organizationId,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  });
  const approve = useMutation(api.rewards.approveVoucher);
  const cancel = useMutation(api.rewards.cancelVoucher);

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('rewards.admin.registry')}</h3>
          <div className="flex gap-2">
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rewards.admin.allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('rewards.status.pending')}</SelectItem>
                <SelectItem value="issued">{t('rewards.status.issued')}</SelectItem>
                <SelectItem value="redeemed">{t('rewards.status.redeemed')}</SelectItem>
                <SelectItem value="cancelled">{t('rewards.status.cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('rewards.admin.searchPlaceholder')}
              className="w-[180px]"
            />
          </div>
        </div>

        {vouchers === undefined ? (
          <ShieldLoader size="sm" />
        ) : vouchers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('rewards.admin.noVouchers')}</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
            {vouchers.map((voucher) => (
              <div key={voucher._id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{voucher.title}</p>
                    <VoucherStatusBadge status={voucher.status} isExpired={voucher.isExpired} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {voucher.recipient?.name ?? '—'} ·{' '}
                    <span className="font-mono">{voucher.code}</span>
                    {voucher.faceValue
                      ? ` · ${formatMoney(voucher.faceValue, currency, i18n.language)}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {voucher.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('rewards.admin.approve')}
                      onClick={async () => {
                        try {
                          await approve({ voucherId: voucher._id });
                          toast.success(t('rewards.admin.approved'));
                        } catch (error: unknown) {
                          toast.error(
                            error instanceof Error ? error.message : t('rewards.admin.saveFailed'),
                          );
                        }
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  {voucher.status !== 'redeemed' && voucher.status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={t('rewards.admin.cancel')}
                      onClick={async () => {
                        try {
                          await cancel({ voucherId: voucher._id });
                          toast.success(t('rewards.admin.cancelledRefunded'));
                        } catch (error: unknown) {
                          toast.error(
                            error instanceof Error ? error.message : t('rewards.admin.saveFailed'),
                          );
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
