'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  Coffee,
  UtensilsCrossed,
  Ticket,
  Clock,
  Shirt,
  HeartHandshake,
  Gift,
  Star,
  Users,
  Check,
  X,
  Hourglass,
  Copy,
  QrCode,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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

export type RewardCategory =
  | 'coffee'
  | 'meal'
  | 'experience'
  | 'time_off'
  | 'merch'
  | 'charity'
  | 'other';

export const CATEGORY_ICONS: Record<RewardCategory, LucideIcon> = {
  coffee: Coffee,
  meal: UtensilsCrossed,
  experience: Ticket,
  time_off: Clock,
  merch: Shirt,
  charity: HeartHandshake,
  other: Gift,
};

export const CATEGORY_TONE: Record<RewardCategory, string> = {
  coffee: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  meal: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200',
  experience: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200',
  time_off: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200',
  merch: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
  charity: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200',
  other: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
};

/** Money formatting for the reward's cash value, which is informational only. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString(locale)} ${currency}`;
  }
}

type CatalogItem = Doc<'rewardItems'> & {
  codesAvailable: number | null;
  stockLeft: number | null;
  myThisMonth: number;
  soldOut: boolean;
  limitReached: boolean;
};

type MyVoucher = Doc<'rewardVouchers'> & { isExpired: boolean };

interface RewardsTabProps {
  organizationId: Id<'organizations'>;
  currentUserId: Id<'users'>;
}

export function RewardsTab({ organizationId, currentUserId }: RewardsTabProps) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [voucherInFocus, setVoucherInFocus] = useState<MyVoucher | null>(null);

  const wallet = useQuery(api.rewards.getMyWallet, { organizationId });
  const catalog = useQuery(api.rewards.listCatalog, { organizationId });
  const vouchers = useQuery(api.rewards.listMyVouchers, { organizationId });

  const currency = wallet?.currency ?? 'AMD';
  const pointValue = wallet?.pointValue ?? 0;
  const balance = wallet?.balance ?? 0;

  const activeVouchers = useMemo(
    () =>
      (vouchers ?? []).filter(
        (voucher) =>
          (voucher.status === 'issued' || voucher.status === 'pending') && !voucher.isExpired,
      ),
    [vouchers],
  );
  const pastVouchers = useMemo(
    () =>
      (vouchers ?? []).filter(
        (voucher) =>
          voucher.status === 'redeemed' || voucher.status === 'cancelled' || voucher.isExpired,
      ),
    [vouchers],
  );

  if (catalog === undefined || wallet === undefined) {
    return <ShieldLoader size="md" />;
  }

  return (
    <div className="space-y-6">
      <WalletStrip
        balance={balance}
        allowance={wallet?.allowance ?? 0}
        allowanceTotal={wallet?.allowanceTotal ?? 0}
        pointValue={pointValue}
        currency={currency}
      />

      {catalog.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Gift className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="font-medium">{t('rewards.empty.title')}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {t('rewards.empty.description')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.map((item) => (
            <RewardCard
              key={item._id}
              item={item as CatalogItem}
              balance={balance}
              currency={currency}
              onPick={() => setSelected(item as CatalogItem)}
            />
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4" />
          <h3 className="font-semibold">{t('rewards.myVouchers')}</h3>
          {activeVouchers.length > 0 && <Badge variant="secondary">{activeVouchers.length}</Badge>}
        </div>

        {activeVouchers.length === 0 && pastVouchers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('rewards.noVouchers')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...activeVouchers, ...pastVouchers].map((voucher) => (
              <VoucherRow
                key={voucher._id}
                voucher={voucher}
                onOpen={() => setVoucherInFocus(voucher)}
              />
            ))}
          </div>
        )}
      </section>

      {selected && (
        <RedeemDialog
          item={selected}
          organizationId={organizationId}
          currentUserId={currentUserId}
          balance={balance}
          currency={currency}
          onClose={() => setSelected(null)}
          onIssued={(code) => {
            setSelected(null);
            const fresh = (vouchers ?? []).find((voucher) => voucher.code === code);
            if (fresh) setVoucherInFocus(fresh);
          }}
        />
      )}

      {voucherInFocus && (
        <VoucherDialog
          voucher={voucherInFocus}
          currency={currency}
          locale={i18n.language}
          onClose={() => setVoucherInFocus(null)}
        />
      )}
    </div>
  );
}

// ── Wallet strip ─────────────────────────────────────────────────────────────

function WalletStrip({
  balance,
  allowance,
  allowanceTotal,
  pointValue,
  currency,
}: {
  balance: number;
  allowance: number;
  allowanceTotal: number;
  pointValue: number;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const worth = balance * pointValue;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card className="border-yellow-200 dark:border-yellow-900/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-50 dark:bg-yellow-900/30 p-2">
              <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{balance}</p>
              <p className="text-sm text-muted-foreground">{t('rewards.wallet.redeemable')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-50 dark:bg-blue-900/30 p-2">
              <Gift className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {allowance}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  / {allowanceTotal}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{t('rewards.wallet.allowance')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 p-2">
              <Ticket className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatMoney(worth, currency, i18n.language)}</p>
              <p className="text-sm text-muted-foreground">{t('rewards.wallet.worth')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Catalog card ─────────────────────────────────────────────────────────────

function RewardCard({
  item,
  balance,
  currency,
  onPick,
}: {
  item: CatalogItem;
  balance: number;
  currency: string;
  onPick: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = CATEGORY_ICONS[item.category as RewardCategory] ?? Gift;
  const affordable = balance >= item.costPoints;
  const blocked = item.soldOut || item.limitReached;
  const progress = Math.min(100, Math.round((balance / Math.max(1, item.costPoints)) * 100));

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="pt-6 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`shrink-0 rounded-xl p-2 ${CATEGORY_TONE[item.category as RewardCategory]}`}
              aria-hidden
            >
              {item.emoji ? (
                <span className="text-base leading-none">{item.emoji}</span>
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {t(`rewards.category.${item.category}`)}
              </p>
            </div>
          </div>
          <Badge variant={affordable ? 'default' : 'secondary'} className="shrink-0 gap-1">
            <Star className="h-3 w-3" />
            {item.costPoints}
          </Badge>
        </div>

        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{item.description}</p>
        )}

        <div className="mt-auto space-y-2">
          {!affordable && !blocked && (
            <div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary/70" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('rewards.needMore', { count: item.costPoints - balance })}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.faceValue !== undefined && item.faceValue > 0 && (
              <span>{formatMoney(item.faceValue, currency, i18n.language)}</span>
            )}
            {item.stockLeft !== null && (
              <span>{t('rewards.stockLeft', { count: item.stockLeft })}</span>
            )}
            {item.codesAvailable !== null && (
              <span>{t('rewards.codesLeft', { count: item.codesAvailable })}</span>
            )}
            {item.requiresApproval && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Hourglass className="h-3 w-3" />
                {t('rewards.needsApproval')}
              </Badge>
            )}
            {item.requiresCompanion && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Users className="h-3 w-3" />
                {t('rewards.withColleague')}
              </Badge>
            )}
          </div>

          <Button className="w-full" size="sm" disabled={!affordable || blocked} onClick={onPick}>
            {item.soldOut
              ? t('rewards.soldOut')
              : item.limitReached
                ? t('rewards.limitReached')
                : t('rewards.redeem')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Redeem dialog ────────────────────────────────────────────────────────────

function RedeemDialog({
  item,
  organizationId,
  currentUserId,
  balance,
  currency,
  onClose,
  onIssued,
}: {
  item: CatalogItem;
  organizationId: Id<'organizations'>;
  currentUserId: Id<'users'>;
  balance: number;
  currency: string;
  onClose: () => void;
  onIssued: (code: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState('');
  const [companionId, setCompanionId] = useState('');
  const [busy, setBusy] = useState(false);

  const redeem = useMutation(api.rewards.redeem);
  const colleagues = useQuery(
    api.users.getUsersByOrganizationId,
    item.requiresCompanion ? { organizationId } : 'skip',
  );

  const options = useMemo(
    () =>
      (colleagues ?? [])
        .filter((u) => u._id !== currentUserId && u.isActive && u.role !== 'superadmin')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [colleagues, currentUserId],
  );

  const handleRedeem = async () => {
    if (item.requiresCompanion && !companionId) {
      toast.error(t('rewards.pickColleague'));
      return;
    }
    setBusy(true);
    try {
      const result = await redeem({
        itemId: item._id,
        note: note.trim() || undefined,
        companionId: companionId ? (companionId as Id<'users'>) : undefined,
      });
      toast.success(
        result.status === 'pending' ? t('rewards.requestSent') : t('rewards.voucherIssued'),
      );
      onIssued(result.code);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.redeemFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {t('rewards.confirmSpend', {
              points: item.costPoints,
              rest: balance - item.costPoints,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {item.description && <p className="text-sm">{item.description}</p>}

          {item.faceValue !== undefined && item.faceValue > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('rewards.faceValue')}: {formatMoney(item.faceValue, currency, i18n.language)}
            </p>
          )}

          {item.requiresCompanion && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="reward-companion">
                {t('rewards.companion')}
              </label>
              <Select value={companionId} onValueChange={setCompanionId}>
                <SelectTrigger id="reward-companion">
                  <SelectValue placeholder={t('rewards.pickColleague')} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option._id} value={option._id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="reward-note">
              {t('rewards.note')}
            </label>
            <Textarea
              id="reward-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('rewards.notePlaceholder')}
              rows={3}
            />
          </div>

          {item.requiresApproval && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {t('rewards.approvalHint')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleRedeem} disabled={busy}>
            {busy ? t('common.sending') : t('rewards.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Voucher ──────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  issued: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
  redeemed: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  expired: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200',
};

export function VoucherStatusBadge({ status, isExpired }: { status: string; isExpired?: boolean }) {
  const { t } = useTranslation();
  const effective =
    isExpired && status !== 'redeemed' && status !== 'cancelled' ? 'expired' : status;
  return (
    <Badge className={`font-normal ${STATUS_TONE[effective] ?? STATUS_TONE.issued}`}>
      {t(`rewards.status.${effective}`)}
    </Badge>
  );
}

function VoucherRow({ voucher, onOpen }: { voucher: MyVoucher; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const dead = voucher.isExpired || voucher.status === 'cancelled' || voucher.status === 'redeemed';

  return (
    <Card className={dead ? 'opacity-70' : undefined}>
      <CardContent className="pt-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{voucher.title}</p>
            <VoucherStatusBadge status={voucher.status} isExpired={voucher.isExpired} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{voucher.code}</p>
          <p className="text-xs text-muted-foreground">
            {voucher.status === 'redeemed' && voucher.redeemedAt
              ? t('rewards.redeemedOn', {
                  date: new Date(voucher.redeemedAt).toLocaleDateString(i18n.language),
                })
              : t('rewards.validUntil', {
                  date: new Date(voucher.expiresAt).toLocaleDateString(i18n.language),
                })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen} className="gap-1 shrink-0">
          <QrCode className="h-4 w-4" />
          {t('rewards.show')}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The voucher itself. The QR encodes the voucher code, which is all the staff
 * side needs to look it up — no personal data travels in the image.
 */
function VoucherDialog({
  voucher,
  currency,
  locale,
  onClose,
}: {
  voucher: MyVoucher;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const cancel = useMutation(api.rewards.cancelVoucher);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    let alive = true;
    QRCode.toDataURL(voucher.code, { width: 240, margin: 1 })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [voucher.code]);

  const canCancel =
    (voucher.status === 'issued' || voucher.status === 'pending') && !voucher.isExpired;

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancel({ voucherId: voucher._id });
      toast.success(t('rewards.cancelled'));
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('rewards.cancelFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            {voucher.title}
          </DialogTitle>
          <DialogDescription>{t('rewards.showToStaff')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {qr ? (
            /* eslint-disable-next-line @next/next/no-img-element -- data URL generated in-browser */
            <img
              src={qr}
              alt={t('rewards.qrAlt', { code: voucher.code })}
              className="rounded-lg border bg-white p-2"
              width={240}
              height={240}
            />
          ) : (
            <div className="h-[240px] w-[240px] rounded-lg border grid place-items-center">
              <QrCode className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}

          <p className="font-mono text-lg tracking-widest">{voucher.code}</p>
          <VoucherStatusBadge status={voucher.status} isExpired={voucher.isExpired} />

          {voucher.partnerCode && (
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('rewards.partnerCode')}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="font-mono font-semibold">{voucher.partnerCode}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    void navigator.clipboard?.writeText(voucher.partnerCode ?? '');
                    toast.success(t('rewards.copied'));
                  }}
                  aria-label={t('rewards.copyCode')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t('rewards.validUntil', {
              date: new Date(voucher.expiresAt).toLocaleDateString(locale),
            })}
            {voucher.faceValue ? ` · ${formatMoney(voucher.faceValue, currency, locale)}` : ''}
          </p>

          {voucher.note && (
            <p className="text-xs text-muted-foreground text-center italic">“{voucher.note}”</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {canCancel ? (
            <Button variant="outline" onClick={handleCancel} disabled={busy} className="gap-1">
              <X className="h-4 w-4" />
              {t('rewards.cancelAndRefund')}
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              {t(
                `rewards.status.${voucher.isExpired && voucher.status !== 'redeemed' ? 'expired' : voucher.status}`,
              )}
            </span>
          )}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
