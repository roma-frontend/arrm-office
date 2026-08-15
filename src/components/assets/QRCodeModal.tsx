'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { useTheme } from '@/components/ThemeProvider';
import { QrCode, Download, Printer, Copy, Check, ScanLine } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { loadQRCode } from '@/lib/dynamic-imports';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Id } from '@/convex/_generated/dataModel';

// ─── Category colour mapping ───
const CATEGORY_COLORS: Record<string, string> = {
  laptop: '#2563eb',
  monitor: '#10b981',
  phone: '#8b5cf6',
  tablet: '#06b6d4',
  peripheral: '#f59e0b',
  furniture: '#ec4899',
  software_license: '#6366f1',
  vehicle: '#14b8a6',
  other: '#64748b',
};

// ─── Props ───
interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: {
    _id: Id<'assetCatalog'> | string;
    name: string;
    serialNumber?: string | null;
    assetTag?: string | null;
    category?: string;
    brand?: string | null;
    model?: string | null;
  };
  organizationId: Id<'organizations'>;
}

export default function QRCodeModal({
  open,
  onOpenChange,
  asset,
  organizationId,
}: QRCodeModalProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const stickerRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const category = asset.category ?? 'other';
  const accent = CATEGORY_COLORS[category] ?? '#64748b';
  const isLoading = !qrDataUrl;

  // ─── Fetch QR payload ───
  const qrData = useQuery(
    api.assets.getAssetQRData,
    open && organizationId ? { organizationId, assetId: asset._id as Id<'assetCatalog'> } : 'skip',
  );

  // ─── Resolve the deep-link against the current origin ───
  // The URL from Convex is built server-side where NEXT_PUBLIC_APP_URL is not
  // available (Convex has its own env), so it falls back to localhost. Rewrite
  // its origin to wherever the app is actually served from.
  const deepLinkUrl = useMemo(() => {
    if (!qrData?.url || typeof window === 'undefined') return null;
    try {
      const parsed = new URL(qrData.url);
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return qrData.url;
    }
  }, [qrData]);

  // ─── Generate QR code ───
  useEffect(() => {
    if (!deepLinkUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = await loadQRCode();
        if (cancelled) return;
        const dataUrl = await QRCode.toDataURL(deepLinkUrl, {
          width: 280,
          margin: 1,
          color: { dark: '#1e293b', light: '#ffffff' },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        /* silently fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkUrl]);

  // ─── Copy deep-link ───
  const handleCopyLink = () => {
    if (!deepLinkUrl) return;
    void navigator.clipboard.writeText(deepLinkUrl);
    setCopied(true);
    toast.success(t('assets.qr.linkCopied', 'Link copied to clipboard'));
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Download QR as PNG ───
  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `${asset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qr.png`;
    link.href = qrDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t('assets.qr.downloaded', 'QR code downloaded'));
  };

  // ─── Print sticker ───
  const handlePrint = () => {
    if (!stickerRef.current || !qrDataUrl) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Sticker — ${escapeHtml(asset.name)}</title>
        <style>
          @page { margin: 0; size: auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            display: flex; justify-content: center; align-items: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
          }
          .sticker {
            width: 300px; padding: 24px 20px 20px;
            background: white; border-radius: 16px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            text-align: center;
          }
          .accent-bar { height: 4px; background: ${escapeHtml(accent)}; border-radius: 2px; margin-bottom: 16px; }
          h3 { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
          .sub { font-size: 11px; color: #64748b; margin-bottom: 14px; }
          .qr-wrap { background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 8px; display: inline-block; margin-bottom: 12px; }
          .qr-wrap img { display: block; width: 200px; height: 200px; }
          .info { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; }
          .badge { font-size: 10px; font-family: 'Courier New', monospace; background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="sticker">
          <div class="accent-bar"></div>
          <h3>${escapeHtml(asset.name)}</h3>
          <div class="sub">${escapeHtml(asset.brand ?? '')}${asset.brand && asset.model ? ' ' : ''}${escapeHtml(asset.model ?? '')}</div>
          <div class="qr-wrap"><img src="${escapeHtml(qrDataUrl)}" alt="QR" /></div>
          <div class="info">
            ${asset.serialNumber ? `<span class="badge">SN: ${escapeHtml(asset.serialNumber)}</span>` : ''}
            ${asset.assetTag ? `<span class="badge">${escapeHtml(asset.assetTag)}</span>` : ''}
          </div>
        </div>
        <script>window.onload=function(){window.print();window.close();}<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <QrCode className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <span>{t('assets.qr.title', 'QR Code')}</span>
              <p className="text-sm font-normal text-muted-foreground mt-0.5">
                {t('assets.qr.subtitle', 'Scan to open asset details')}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          /* ── Loading State ── */
          <div className="flex flex-col items-center py-8 gap-5">
            <div className="w-[220px] h-[220px] bg-muted animate-pulse rounded-2xl flex items-center justify-center">
              <QrCode className="w-14 h-14 text-muted-foreground/30" />
            </div>
            <div className="space-y-2 text-center">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mx-auto" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded mx-auto" />
            </div>
          </div>
        ) : (
          /* ── Content ── */
          <div className="flex flex-col items-center gap-5 py-2">
            {/* ── QR Card ── */}
            <div
              ref={stickerRef}
              className="relative w-full max-w-[300px] rounded-2xl border border-border overflow-hidden bg-gradient-to-b from-background to-muted/30"
            >
              {/* Accent header strip */}
              <div
                className="h-2 w-full"
                style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
              />

              <div className="p-5 sm:p-6 text-center space-y-4">
                {/* Icon + Name */}
                <div>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: `${accent}18` }}
                  >
                    <ScanLine className="w-6 h-6" style={{ color: accent }} />
                  </div>
                  <h3 className="text-base font-bold text-foreground truncate max-w-[240px] mx-auto leading-snug">
                    {asset.name}
                  </h3>
                  {asset.brand || asset.model ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[asset.brand, asset.model].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <div
                    className="rounded-xl p-2.5 inline-block"
                    style={{
                      background: isDark ? `linear-gradient(135deg, #1e293b, #0f172a)` : '#ffffff',
                      boxShadow: isDark
                        ? `0 0 0 1px ${accent}22, 0 4px 20px rgba(0,0,0,0.3)`
                        : `0 0 0 1px ${accent}15, 0 4px 16px rgba(0,0,0,0.06)`,
                      borderColor: `${accent}30`,
                    }}
                  >
                    <img
                      src={qrDataUrl!}
                      alt={`QR Code for ${asset.name}`}
                      className="block w-[180px] h-[180px]"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {asset.serialNumber && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-muted text-muted-foreground border border-border/50">
                      SN: {asset.serialNumber}
                    </span>
                  )}
                  {asset.assetTag && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-muted text-muted-foreground border border-border/50">
                      {asset.assetTag}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Deep-link row ── */}
            {deepLinkUrl && (
              <div className="w-full max-w-[300px] flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">
                    {t('assets.qr.deepLink', 'Deep Link')}
                  </p>
                  <code className="block text-[11px] text-muted-foreground truncate font-mono">
                    {deepLinkUrl}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  title={t('common.copy', 'Copy')}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-(--success-text)" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="flex items-center justify-center gap-3 pt-1 pb-1">
          <Button
            variant="outline"
            className="gap-2 flex-1 max-w-[140px]"
            onClick={handleDownload}
            disabled={isLoading}
          >
            <Download className="w-4 h-4" />
            {t('common.download', 'Download')}
          </Button>
          <Button
            variant="default"
            className="gap-2 flex-1 max-w-[140px]"
            onClick={handlePrint}
            disabled={isLoading}
          >
            <Printer className="w-4 h-4" />
            {t('common.print', 'Print')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── HTML-escaper ───
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
