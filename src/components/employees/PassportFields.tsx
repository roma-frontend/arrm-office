'use client';

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { FileText, Upload, ScanLine } from 'lucide-react';
import { scanPassportImage } from '@/lib/passportMrz';
import { uploadDocument } from '@/actions/cloudinary';

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

interface PassportFieldsProps {
  value: PassportData;
  onChange: (patch: Partial<PassportData>) => void;
  /** Optional: notify parent about an uploaded scan (to persist after the user exists). */
  onScanUploaded?: (file: PassportScanFile) => void;
  /** Also fill date of birth when MRZ provides it. */
  onDateOfBirth?: (isoDate: string) => void;
}

export function PassportFields({
  value,
  onChange,
  onScanUploaded,
  onDateOfBirth,
}: PassportFieldsProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanName, setScanName] = useState<string | null>(null);

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
      if (isImage) {
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
          <Input
            id="passport-social-card"
            value={value.socialCardNumber}
            onChange={(e) => onChange({ socialCardNumber: e.target.value })}
          />
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
