'use client';

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { FileText, Upload, ScanLine, ShieldCheck, ShieldAlert, BadgeCheck } from 'lucide-react';
import { scanPassportImage } from '@/lib/passportMrz';
import { uploadDocument } from '@/actions/cloudinary';
import { validateTaxId } from '@/lib/hvhh';
import type { Id } from '../../../convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export interface PassportData {
  passportNumber: string;
  passportIssuedBy: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  socialCardNumber: string;
  nationality: string;
}

export interface PassportScanFile {
  url: string;
  name: string;
  size: number;
}

export const EMPTY_PASSPORT: PassportData = {
  passportNumber: '',
  passportIssuedBy: '',
  passportIssueDate: '',
  passportExpiryDate: '',
  socialCardNumber: '',
  nationality: '',
};

export type TaxIdVerifyStatus =
  | 'verified'
  | 'not_found'
  | 'valid_local'
  | 'invalid_checksum'
  | 'invalid_format'
  | 'error';

interface PassportFieldsProps {
  value: PassportData;
  onChange: (patch: Partial<PassportData>) => void;
  /** Optional: notify parent about an uploaded scan (to persist after the user exists). */
  onScanUploaded?: (file: PassportScanFile) => void;
  /** Also fill date of birth when MRZ provides it. */
  onDateOfBirth?: (isoDate: string) => void;
  /** When provided (employee exists), persists the SRC verification result. */
  userId?: Id<'users'>;
  /** Called after a verification completes (for the parent to show in review). */
  onTaxIdVerified?: (status: TaxIdVerifyStatus) => void;
}

/** Map a verify-route status to a stable UI status. */
function normalizeVerifyStatus(raw: string): TaxIdVerifyStatus {
  const statuses: TaxIdVerifyStatus[] = [
    'verified',
    'not_found',
    'valid_local',
    'invalid_checksum',
    'invalid_format',
    'error',
  ];
  return statuses.includes(raw as TaxIdVerifyStatus) ? (raw as TaxIdVerifyStatus) : 'error';
}

export function PassportFields({
  value,
  onChange,
  onScanUploaded,
  onDateOfBirth,
  userId,
  onTaxIdVerified,
}: PassportFieldsProps) {
  const { t } = useTranslation();
  const recordTaxIdVerification = useMutation(api.employeeProfiles.recordTaxIdVerification);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanName, setScanName] = useState<string | null>(null);
  const [verifyingTaxId, setVerifyingTaxId] = useState(false);
  const [taxIdStatus, setTaxIdStatus] = useState<TaxIdVerifyStatus | null>(null);

  // Verify the social card number (ՀՎՀՀ) locally + via SRC when configured.
  const handleVerifyTaxId = async () => {
    const tin = value.socialCardNumber?.trim() ?? '';
    if (!tin) {
      toast.warning(t('employees.taxIdRequired', 'Enter a social card number first'));
      return;
    }
    // Local format gate — catches typos instantly without a network round trip.
    const local = validateTaxId(tin);
    if (!local.formatValid) {
      const status: TaxIdVerifyStatus = 'invalid_format';
      setTaxIdStatus(status);
      onTaxIdVerified?.(status);
      toast.error(t('employees.taxIdFormatError', 'Tax ID must be 8 digits'));
      return;
    }

    setVerifyingTaxId(true);
    try {
      const res = await fetch('/api/taxid/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tin }),
      });
      if (!res.ok) throw new Error('verify failed');
      const data = (await res.json()) as { status?: string; ok?: boolean };
      const status = normalizeVerifyStatus(data.status ?? (data.ok ? 'valid_local' : 'error'));
      setTaxIdStatus(status);
      onTaxIdVerified?.(status);
      // Persist when the employee already exists (edit flow) — but never claim
      // validity for a failed/unknown verification.
      if (userId && status !== 'error') {
        await recordTaxIdVerification({ userId, status }).catch(() => {});
      }
    } catch {
      setTaxIdStatus('error');
      onTaxIdVerified?.('error');
    } finally {
      setVerifyingTaxId(false);
    }
  };

  const taxIdBadge = (() => {
    if (!taxIdStatus) return null;
    const map: Record<TaxIdVerifyStatus, { color: string; label: string }> = {
      verified: {
        color:
          'text-(--success-text) dark:text-(--success-text) bg-(--success-quiet) border-(--success-outline)',
        label: t('employees.taxIdVerified', 'Verified by SRC'),
      },
      not_found: {
        color:
          'text-(--warning-text) dark:text-(--warning-text) bg-(--warning-quiet) border-(--warning-outline)',
        label: t('employees.taxIdNotFound', 'Not found in SRC'),
      },
      valid_local: {
        color:
          'text-(--brand-text) dark:text-(--brand-text) bg-(--brand-quiet) border-(--brand-outline)',
        label: t('employees.taxIdValidLocal', 'Format valid (local check)'),
      },
      invalid_checksum: {
        color:
          'text-(--danger-text) dark:text-(--danger-text) bg-(--danger-quiet) border-(--danger-outline)',
        label: t('employees.taxIdInvalidChecksum', 'Checksum invalid'),
      },
      invalid_format: {
        color:
          'text-(--danger-text) dark:text-(--danger-text) bg-(--danger-quiet) border-(--danger-outline)',
        label: t('employees.taxIdInvalidFormat', 'Must be 8 digits'),
      },
      error: {
        color:
          'text-(--danger-text) dark:text-(--danger-text) bg-(--danger-quiet) border-(--danger-outline)',
        label: t('employees.taxIdCheckError', 'Verification failed'),
      },
    };
    const cfg = map[taxIdStatus];
    const Icon = taxIdStatus === 'verified' ? BadgeCheck : ShieldAlert;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.color}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </span>
    );
  })();

  const handleFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      toast.error(t('employees.passportScanTypeError'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('employees.passportScanTooLarge'));
      return;
    }

    setScanning(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload the scan to Cloudinary for record-keeping.
      const uploaded = await uploadDocument(base64, file.name, file.type);
      setScanName(uploaded.name);
      onScanUploaded?.({ url: uploaded.url, name: uploaded.name, size: uploaded.size });

      // Attempt MRZ auto-fill (images only — OCR can't read PDFs directly here).
      // OCR is best-effort: the scan was already uploaded to Cloudinary above, so
      // a recognition failure must NOT abort the flow — the admin can still fill
      // the fields manually. Only hard-upload errors are surfaced as errors.
      if (isImage) {
        try {
          const mrz = await scanPassportImage(base64);
          if (mrz && mrz.valid) {
            const patch: Partial<PassportData> = {};
            if (mrz.passportNumber) patch.passportNumber = mrz.passportNumber;
            if (mrz.passportExpiryDate) patch.passportExpiryDate = mrz.passportExpiryDate;
            if (mrz.nationality) patch.nationality = mrz.nationality;
            if (Object.keys(patch).length > 0) onChange(patch);
            if (mrz.dateOfBirth) onDateOfBirth?.(mrz.dateOfBirth);
            toast.success(t('employees.mrzFilled'));
          } else if (mrz && mrz.errors.length > 0) {
            toast.warning(t('employees.mrzParseError'));
          } else {
            toast.info(t('employees.mrzNotFound'));
          }
        } catch {
          // OCR failed (worker/CDN/timeout) — scan is saved, fill manually.
          toast.info(t('employees.mrzNotFound'));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('employees.passportScanFailed'));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Scan upload + OCR */}
      <div className="rounded-xl border-2 border-dashed border-(--border) p-4 text-center">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg btn-gradient text-white text-sm font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-60"
        >
          {scanning ? (
            <>
              <ShieldLoader size="xs" variant="inline" />
              {t('employees.scanning')}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {t('employees.uploadScan')}
            </>
          )}
        </button>
        <p className="mt-2 text-xs text-(--text-muted) flex items-center justify-center gap-1">
          <ScanLine className="w-3.5 h-3.5" />
          {t('employees.mrzHint')}
        </p>
        {scanName && (
          <p className="mt-2 text-xs text-(--text-primary) flex items-center justify-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {scanName}
          </p>
        )}
      </div>

      {/* Manual fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="passport-number">{t('employees.passportNumber')}</Label>
          <Input
            id="passport-number"
            value={value.passportNumber}
            onChange={(e) => onChange({ passportNumber: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passport-nationality">{t('employees.nationality')}</Label>
          <Input
            id="passport-nationality"
            value={value.nationality}
            onChange={(e) => onChange({ nationality: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passport-issued-by">{t('employees.passportIssuedBy')}</Label>
          <Input
            id="passport-issued-by"
            value={value.passportIssuedBy}
            onChange={(e) => onChange({ passportIssuedBy: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passport-social-card">{t('employees.socialCardNumber')}</Label>
          <div className="flex gap-2">
            <Input
              id="passport-social-card"
              value={value.socialCardNumber}
              inputMode="numeric"
              maxLength={8}
              placeholder="12345678"
              onChange={(e) => {
                onChange({ socialCardNumber: e.target.value });
                setTaxIdStatus(null);
              }}
            />
            <button
              type="button"
              onClick={handleVerifyTaxId}
              disabled={verifyingTaxId}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all disabled:opacity-60 bg-(--background-subtle) hover:border-(--brand-outline) hover:text-(--primary)"
            >
              {verifyingTaxId ? (
                <>
                  <ShieldLoader size="xs" variant="inline" />
                  {t('employees.taxIdVerifying', 'Checking…')}
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t('employees.taxIdVerify', 'Verify')}
                </>
              )}
            </button>
          </div>
          {taxIdBadge}
          <p className="text-[11px] text-(--text-muted)">
            {t(
              'employees.taxIdHint',
              '8-digit Armenian tax ID (ՀՎՀՀ) — verified against SRC when connected',
            )}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passport-issue-date">{t('employees.passportIssueDate')}</Label>
          <Input
            id="passport-issue-date"
            type="date"
            value={value.passportIssueDate}
            onChange={(e) => onChange({ passportIssueDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passport-expiry-date">{t('employees.passportExpiryDate')}</Label>
          <Input
            id="passport-expiry-date"
            type="date"
            value={value.passportExpiryDate}
            onChange={(e) => onChange({ passportExpiryDate: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
