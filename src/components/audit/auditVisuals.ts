'use client';

/**
 * How the audit taxonomy looks and reads on screen.
 *
 * `@/lib/audit/actionMeta` decides *what* a row is (it has to stay pure — Convex
 * imports it); this module decides how that shows up: which icon, which tone
 * class, and which translation key. Keeping the two apart is what lets the
 * server filter by the same category the badge displays.
 */

import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  DollarSign,
  FileCheck,
  Info,
  ListChecks,
  LogIn,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { AuditCategory, AuditSeverity } from '@/lib/audit/actionMeta';

export type AuditIcon = typeof Activity;

export interface AuditTone {
  /** Badge / chip: background + text + border in one string. */
  badge: string;
  /** Icon tile background. */
  tile: string;
  /** Icon and accent text colour. */
  accent: string;
  /** Timeline dot. */
  dot: string;
}

/**
 * Severity carries the colour, category carries the icon.
 *
 * Colouring by category instead would give eight competing hues and no way to
 * spot the one failed login in a screenful of routine edits.
 */
export const SEVERITY_TONES: Record<AuditSeverity, AuditTone> = {
  critical: {
    badge: 'bg-(--danger-quiet) text-(--danger-text) border-(--danger-outline)',
    tile: 'bg-(--danger-quiet)',
    accent: 'text-(--danger-text)',
    dot: 'bg-(--danger-solid)',
  },
  warning: {
    badge: 'bg-(--warning-quiet) text-(--warning-text) border-(--warning-outline)',
    tile: 'bg-(--warning-quiet)',
    accent: 'text-(--warning-text)',
    dot: 'bg-(--warning-solid)',
  },
  info: {
    badge: 'bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline)',
    tile: 'bg-(--brand-quiet)',
    accent: 'text-(--brand-text)',
    dot: 'bg-(--brand)',
  },
};

export const SEVERITY_ICONS: Record<AuditSeverity, AuditIcon> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

export const CATEGORY_ICONS: Record<AuditCategory, AuditIcon> = {
  auth: LogIn,
  people: Users,
  work: ListChecks,
  finance: DollarSign,
  admin: Building2,
  compliance: FileCheck,
  ai: Bot,
  system: Activity,
};

/** Translation keys live next to the visuals so a new category needs one edit. */
export const CATEGORY_LABEL_KEYS: Record<AuditCategory, string> = {
  auth: 'audit.categories.auth',
  people: 'audit.categories.people',
  work: 'audit.categories.work',
  finance: 'audit.categories.finance',
  admin: 'audit.categories.admin',
  compliance: 'audit.categories.compliance',
  ai: 'audit.categories.ai',
  system: 'audit.categories.system',
};

export const CATEGORY_LABEL_FALLBACKS: Record<AuditCategory, string> = {
  auth: 'Authentication',
  people: 'People',
  work: 'Work',
  finance: 'Finance',
  admin: 'Administration',
  compliance: 'Compliance',
  ai: 'AI',
  system: 'System',
};

export const SEVERITY_LABEL_FALLBACKS: Record<AuditSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};
