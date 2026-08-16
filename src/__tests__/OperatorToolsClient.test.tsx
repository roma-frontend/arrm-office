/**
 * Tests for OperatorToolsClient — the Tier-1 no-code operator console.
 *
 * Mocks convex/react and react-i18next, then verifies the tab bar, the
 * translations studio (key rows + save), limits grid, scheduled ops table and
 * the maintenance window planner.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => {
  const KEY_MAP: Record<string, string> = {
    'superadmin.operatorTools.title': 'Operator tools',
    'superadmin.operatorTools.subtitle': 'Run the product without touching code.',
    'superadmin.operatorTools.tabs.translations': 'Translations',
    'superadmin.operatorTools.tabs.limits': 'Limits',
    'superadmin.operatorTools.tabs.scheduled': 'Scheduled ops',
    'superadmin.operatorTools.tabs.maintenance': 'Maintenance',
    'superadmin.operatorTools.searchKeys': 'Search keys, e.g. notifications.saved',
    'superadmin.operatorTools.keyCount': '{{n}} overrides active',
    'superadmin.operatorTools.keyCol': 'Key',
    'superadmin.operatorTools.enValue': 'English (current)',
    'superadmin.operatorTools.save': 'Save',
    'superadmin.operatorTools.jobCol': 'Job',
    'superadmin.operatorTools.scheduleCol': 'Schedule',
    'superadmin.operatorTools.lastRunCol': 'Last run',
    'superadmin.operatorTools.runNow': 'Run now',
    'superadmin.operatorTools.pause': 'Pause',
    'superadmin.operatorTools.resume': 'Resume',
    'superadmin.operatorTools.newWindow': 'Plan a maintenance window',
    'superadmin.operatorTools.planWindow': 'Plan window',
    'superadmin.operatorTools.noWindows': 'No maintenance windows yet.',
    'superadmin.operatorTools.noKeys': 'No keys match — try a different search.',
  };
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => KEY_MAP[key] ?? fallback ?? key,
      i18n: {
        language: 'en',
        options: { ns: ['common'] },
        getResourceBundle: () => ({
          notifications: { saved: 'Saved' },
          dashboard: { greeting: 'Hello' },
          leaves: { title: 'Leaves' },
        }),
      },
    }),
  };
});

let overridesData: any[] = [];
let limitsData: any[] = [];
let opsData: any[] = [];
let windowsData: any[] = [];

jest.mock('convex/react', () => ({
  useQuery: (ref: any) => {
    const name = ref?._name ?? '';
    if (name === 'listI18nOverrides') return overridesData;
    if (name === 'listPlatformLimits') return limitsData;
    if (name === 'listScheduledOps') return opsData;
    if (name === 'listMaintenanceWindows') return windowsData;
    return null;
  },
  useMutation: () => jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      operatorTools: {
        listI18nOverrides: { _name: 'listI18nOverrides' },
        listPlatformLimits: { _name: 'listPlatformLimits' },
        listScheduledOps: { _name: 'listScheduledOps' },
        listMaintenanceWindows: { _name: 'listMaintenanceWindows' },
        setI18nOverride: { _name: 'setI18nOverride' },
        deleteI18nOverride: { _name: 'deleteI18nOverride' },
        setPlatformLimit: { _name: 'setPlatformLimit' },
        resetPlatformLimit: { _name: 'resetPlatformLimit' },
        setScheduledOpPaused: { _name: 'setScheduledOpPaused' },
        runScheduledOpNow: { _name: 'runScheduledOpNow' },
        createMaintenanceWindow: { _name: 'createMaintenanceWindow' },
        setMaintenanceWindowActive: { _name: 'setMaintenanceWindowActive' },
        deleteMaintenanceWindow: { _name: 'deleteMaintenanceWindow' },
      },
    },
  },
}));

import { OperatorToolsClient } from '@/components/superadmin/OperatorToolsClient';

describe('OperatorToolsClient', () => {
  beforeEach(() => {
    overridesData = [];
    limitsData = [];
    opsData = [];
    windowsData = [];
  });

  it('renders all four tabs and the translations studio by default', () => {
    overridesData = [
      {
        _id: 'ov-1',
        key: 'common.notifications.saved',
        locale: 'ru',
        value: 'Сохранено!',
        updatedBy: 'u',
        updatedAt: Date.now(),
      },
    ];
    render(<OperatorToolsClient />);
    expect(screen.getByText('Translations')).toBeTruthy();
    expect(screen.getByText('Limits')).toBeTruthy();
    expect(screen.getByText('Scheduled ops')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Key')).toBeTruthy();
  });

  it('renders AI-translate buttons on non-English locale cells', () => {
    overridesData = [
      {
        _id: 'ov-1',
        key: 'common.notifications.saved',
        locale: 'ru',
        value: 'Сохранено!',
        updatedBy: 'u',
        updatedAt: Date.now(),
      },
    ];
    render(<OperatorToolsClient />);
    // The ru cell has an override → shows the revert ✕; every non-EN cell
    // shows the AI sparkle button.
    const aiButtons = document.querySelectorAll('button[title="Translate with AI"]');
    expect(aiButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('switches to the limits tab', () => {
    limitsData = [
      {
        key: 'session.timeoutMinutes',
        description: 'Session lifetime',
        default: 10080,
        value: 10080,
        updatedBy: null,
        updatedAt: null,
      },
    ];
    render(<OperatorToolsClient />);
    fireEvent.click(screen.getByText('Limits'));
    expect(screen.getByText('session.timeoutMinutes')).toBeTruthy();
    expect(screen.getByText(/default/)).toBeTruthy();
  });

  it('switches to the scheduled ops tab and shows jobs', () => {
    opsData = [
      {
        jobKey: 'news-schedule-publish',
        label: 'News schedule publish',
        description: 'Publishes dated news entries on their day.',
        schedule: 'hourly',
        isPaused: false,
        lastRunAt: null,
        lastRunOutcome: null,
        lastRunError: null,
      },
    ];
    render(<OperatorToolsClient />);
    fireEvent.click(screen.getByText('Scheduled ops'));
    expect(screen.getByText('News schedule publish')).toBeTruthy();
    expect(screen.getByText('Run now')).toBeTruthy();
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it('switches to the maintenance tab and shows the planner', () => {
    windowsData = [];
    render(<OperatorToolsClient />);
    fireEvent.click(screen.getByText('Maintenance'));
    expect(screen.getByText('Plan a maintenance window')).toBeTruthy();
    expect(screen.getByText('No maintenance windows yet.')).toBeTruthy();
  });
});
