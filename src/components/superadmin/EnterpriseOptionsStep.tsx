'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useWizardContext } from '@/components/ui/wizard';
import { BILLING_CATEGORIES, BILLING_MODULES } from '../../../convex/billing/modules';
import type { ModuleOptionSchema } from '../../../convex/billing/modules';

/**
 * Enterprise Options wizard step — the per-org custom deal.
 *
 * The superadmin picks exactly which modules (and their limits) a specific
 * Enterprise customer paid for. The selection is stored on the subscription as
 * `customSnapshot`, which the entitlements engine reads before the published
 * catalog — so unselected modules stay locked for that org, and limits apply.
 *
 * The wizard data model is flat, so the selection lives in two fields:
 *   - `customModules: string[]`  — included module keys
 *   - `customLimitsJson: string` — JSON { moduleKey: { option: value } }
 */

/** Default selection: core modules only, with their min limits. */
export const DEFAULT_ENT_SELECTION = Object.fromEntries(
  BILLING_MODULES.filter((m) => m.isCore).map((m) => [m.key, true]),
);

export function defaultEntLimits(): Record<string, Record<string, number | boolean>> {
  const out: Record<string, Record<string, number | boolean>> = {};
  for (const m of BILLING_MODULES) {
    if (!m.settingsSchema) continue;
    const entry: Record<string, number | boolean> = {};
    for (const [opt, schema] of Object.entries(m.settingsSchema)) {
      if (schema.type === 'number' && schema.min !== undefined) entry[opt] = schema.min;
    }
    if (Object.keys(entry).length > 0) out[m.key] = entry;
  }
  return out;
}

/**
 * Resolve the wizard's flat fields into the mutation's customModules arg.
 * Falls back to the core-only default selection when the step was untouched.
 */
export function resolveCustomModules(
  stepData: Record<string, string | number | boolean | null | string[]>,
): Array<{ moduleKey: string; included: boolean; limits?: Record<string, number | boolean> }> {
  const keys = Array.isArray(stepData.customModules)
    ? (stepData.customModules as string[])
    : Object.keys(DEFAULT_ENT_SELECTION);
  let limitsJson: Record<string, Record<string, number | boolean>>;
  try {
    limitsJson = stepData.customLimitsJson
      ? (JSON.parse(String(stepData.customLimitsJson)) as Record<
          string,
          Record<string, number | boolean>
        >)
      : defaultEntLimits();
  } catch {
    limitsJson = defaultEntLimits();
  }

  const all = BILLING_MODULES.filter((m) => m.status !== 'coming');
  return all.map((m) => ({
    moduleKey: m.key,
    included: keys.includes(m.key),
    limits: limitsJson[m.key] ?? undefined,
  }));
}

function ModuleGroup({
  category,
  selected,
  limits,
  accentFrom,
  onToggle,
  onLimit,
}: {
  category: string;
  selected: Set<string>;
  limits: Record<string, Record<string, number | boolean>>;
  accentFrom: string;
  onToggle: (key: string, isCore: boolean) => void;
  onLimit: (key: string, option: string, value: number) => void;
}) {
  const { t } = useTranslation();
  const modules = BILLING_MODULES.filter((m) => m.category === category && m.status !== 'coming');
  if (modules.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p
        className="text-[10px] font-bold uppercase tracking-widest px-0.5"
        style={{ color: accentFrom }}
      >
        {t(`billing.categories.${category}`, category)}
      </p>
      {modules.map((m) => {
        const isOn = selected.has(m.key);
        const schema = m.settingsSchema;
        const hasLimits = !!schema && Object.keys(schema).length > 0;
        return (
          <div
            key={m.key}
            className={`rounded-xl border transition-colors ${
              isOn ? 'border-(--primary)/40 bg-(--primary)/5' : 'border-(--border)'
            }`}
          >
            <div className="flex items-start gap-2.5 p-2.5">
              <Checkbox
                checked={isOn}
                onCheckedChange={() => onToggle(m.key, m.isCore)}
                id={`ent-module-${m.key}`}
                className="shrink-0 mt-0.5"
              />
              <Label htmlFor={`ent-module-${m.key}`} className="flex-1 cursor-pointer select-none">
                <span className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
                  {t(`billing.modules.${m.key}`, m.name)}
                  {m.isCore && (
                    <span className="rounded-full bg-(--brand)/10 text-(--brand-text) px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      {t('subscriptionWizard.steps.options.coreBadge')}
                    </span>
                  )}
                </span>
              </Label>
            </div>
            {isOn && hasLimits && (
              <div className="px-3 pb-2.5 pt-0.5 grid grid-cols-2 gap-2">
                {Object.entries(schema!).map(([opt, optSchema]: [string, ModuleOptionSchema]) => {
                  if (optSchema.type !== 'number') return null;
                  const value = limits[m.key]?.[opt];
                  return (
                    <label
                      key={opt}
                      className="flex items-center gap-1.5 text-[11px] text-(--text-muted)"
                    >
                      <span className="flex-1 truncate">{t(`billing.options.${opt}`, opt)}</span>
                      <input
                        type="number"
                        min={optSchema.min ?? 0}
                        value={value === undefined ? '' : Number(value)}
                        placeholder={t('subscriptionWizard.steps.options.limitPlaceholder')}
                        onChange={(e) => onLimit(m.key, opt, Number(e.target.value))}
                        className="w-16 rounded-md border border-(--border) bg-(--background) px-1.5 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-(--primary)/30"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EnterpriseOptionsStep() {
  const { t } = useTranslation();
  const context = useWizardContext();
  const stepData = context.stepData;
  const update = context.updateStepData;

  const selected = useMemo(() => {
    const keys = Array.isArray(stepData.customModules)
      ? (stepData.customModules as string[])
      : Object.keys(DEFAULT_ENT_SELECTION);
    return new Set(keys);
  }, [stepData.customModules]);

  const limits = useMemo<Record<string, Record<string, number | boolean>>>(() => {
    try {
      const parsed = JSON.parse(String(stepData.customLimitsJson ?? '{}')) as Record<
        string,
        Record<string, number | boolean>
      >;
      // Merge over the defaults so untouched modules still carry their min.
      const base = defaultEntLimits();
      for (const [mk, opts] of Object.entries(parsed)) {
        base[mk] = { ...(base[mk] ?? {}), ...opts };
      }
      return base;
    } catch {
      return defaultEntLimits();
    }
  }, [stepData.customLimitsJson]);

  const toggle = (key: string, isCore: boolean) => {
    if (isCore) return; // core modules are always included
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update('customModules', [...next]);
  };

  const setLimit = (key: string, option: string, value: number) => {
    const next = { ...limits, [key]: { ...(limits[key] ?? {}), [option]: value } };
    update('customLimitsJson', JSON.stringify(next));
  };

  /** The effective selection (defaulted core modules when untouched). */

  const allKeys = BILLING_MODULES.filter((m) => m.status !== 'coming').map((m) => m.key);
  const allSelected = allKeys.every((k) => selected.has(k));

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl p-3 text-xs leading-relaxed"
        style={{ background: 'rgb(var(--brand-600-ch) / 8%)', color: 'var(--text-muted)' }}
      >
        {t('subscriptionWizard.steps.options.hint')}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
          {t('subscriptionWizard.steps.options.modulesLabel')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              update(
                'customModules',
                BILLING_MODULES.filter((m) => m.status !== 'coming').map((m) => m.key),
              )
            }
            className="text-[11px] font-medium text-(--primary) hover:underline"
          >
            {t('subscriptionWizard.steps.options.selectAll')}
          </button>
          <span className="text-(--border)">·</span>
          <button
            type="button"
            onClick={() =>
              update(
                'customModules',
                BILLING_MODULES.filter((m) => m.isCore).map((m) => m.key),
              )
            }
            className="text-[11px] font-medium text-(--text-muted) hover:underline"
          >
            {t('subscriptionWizard.steps.options.clearAll')}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto pr-1 space-y-4">
        {BILLING_CATEGORIES.map((cat) => (
          <ModuleGroup
            key={cat}
            category={cat}
            selected={selected}
            limits={limits}
            accentFrom="var(--brand)"
            onToggle={toggle}
            onLimit={setLimit}
          />
        ))}
      </div>

      {!allSelected && (
        <p className="text-[10px] text-(--warning-text)">
          {t('subscriptionWizard.steps.options.required')}
        </p>
      )}
    </div>
  );
}
