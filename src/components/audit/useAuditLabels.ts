'use client';

/**
 * Translated names for everything in the audit taxonomy.
 *
 * Action keys are looked up as `audit.actions.<normalized_action>`, then as
 * `activityFeed.actions.<normalized_action>` (the dashboard widget's dictionary,
 * already translated in every locale), and fall back to a humanized form of the
 * key itself. That fallback is the whole point: ~40 Convex modules write audit
 * rows and new actions appear without a translation, so "Recurring task instance
 * created" is what an untranslated action must look like — never
 * `recurring_task_instance_created` and never a blank cell.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AUDIT_CATEGORIES,
  AUDIT_SEVERITIES,
  humanizeAction,
  normalizeAction,
  type AuditCategory,
  type AuditSeverity,
} from '@/lib/audit/actionMeta';
import {
  CATEGORY_LABEL_FALLBACKS,
  CATEGORY_LABEL_KEYS,
  SEVERITY_LABEL_FALLBACKS,
} from './auditVisuals';

export interface AuditLabels {
  categoryLabel: (category: AuditCategory) => string;
  severityLabel: (severity: AuditSeverity) => string;
  actionLabel: (action: string) => string;
  /** `[value, label]` pairs for the filter dropdowns, in taxonomy order. */
  categoryOptions: { value: string; label: string }[];
  severityOptions: { value: string; label: string }[];
}

export function useAuditLabels(): AuditLabels {
  const { t } = useTranslation();

  const categoryLabel = useCallback(
    (category: AuditCategory) =>
      t(CATEGORY_LABEL_KEYS[category], CATEGORY_LABEL_FALLBACKS[category]),
    [t],
  );

  const severityLabel = useCallback(
    (severity: AuditSeverity) =>
      t(`audit.severity.${severity}`, SEVERITY_LABEL_FALLBACKS[severity]),
    [t],
  );

  const actionLabel = useCallback(
    (action: string) => {
      const key = normalizeAction(action);
      // Two dictionaries, in order: an audit-specific override if one exists,
      // then the `activityFeed.actions.*` map the dashboard widget already ships
      // in every locale. Duplicating ~150 labels here would only guarantee that
      // the page and the widget eventually name the same event differently.
      return t([`audit.actions.${key}`, `activityFeed.actions.${key}`], {
        defaultValue: humanizeAction(action),
      });
    },
    [t],
  );

  const categoryOptions = useMemo(
    () => AUDIT_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) })),
    [categoryLabel],
  );

  const severityOptions = useMemo(
    () => AUDIT_SEVERITIES.map((severity) => ({ value: severity, label: severityLabel(severity) })),
    [severityLabel],
  );

  return { categoryLabel, severityLabel, actionLabel, categoryOptions, severityOptions };
}
