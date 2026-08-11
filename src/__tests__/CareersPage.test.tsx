/**
 * Tests for CareersPage — the public career landing page: loading/not-found
 * states, hero + stats, search and filter selects, vacancy cards (salary
 * formatting, employment type labels, time-ago), the vacancy detail modal,
 * and the application form with validation and submit paths.
 *
 * Mocks: convex/react, api, i18n config, react-i18next, next/image, next/link,
 * CustomSelect, ShieldLoader.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

jest.mock('@/i18n/config', () => ({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, unknown> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }, args?: any) =>
    args === 'skip' ? undefined : queryResults[ref?._name ?? ''],
  useMutation:
    (ref: { _name?: string }) =>
    (...args: any[]) => {
      mutationCalls.push({ name: ref?._name, args });
      const impl = mutationImpls[ref?._name ?? ''];
      return impl ? impl(...args) : Promise.resolve();
    },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    careers: {
      listOpenVacancies: { _name: 'listOpenVacancies' },
      getVacancyDetails: { _name: 'getVacancyDetails' },
      applyToVacancy: { _name: 'applyToVacancy' },
    },
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} {...rest} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select
      data-testid="custom-select"
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

import CareersPage from '@/components/CareersPage';

const ORG = { _id: 'org-1', name: 'Profix', slug: 'profix', logoUrl: '/logo.png' };

const VACANCIES = [
  {
    _id: 'v-1',
    title: 'Frontend Engineer',
    department: 'Engineering',
    location: 'Yerevan',
    employmentType: 'full_time',
    salary: { min: 1500000, max: 2500000, currency: 'AMD' },
    createdAt: Date.now() - 3600_000,
    excerpt: 'Build great UIs with React and TypeScript.',
  },
  {
    _id: 'v-2',
    title: 'Office Manager',
    department: 'Operations',
    location: 'Yerevan',
    employmentType: 'part_time',
    salary: { min: 900, max: 1200, currency: 'USD' },
    createdAt: Date.now() - 48 * 3600_000,
    excerpt: 'Keep the office running smoothly.',
  },
  {
    _id: 'v-3',
    title: 'Senior QA',
    employmentType: 'contract',
    createdAt: Date.now() - 2000 * 3600_000,
    excerpt: 'Own quality across the platform.',
  },
];

const DETAILS = {
  _id: 'v-1',
  title: 'Frontend Engineer',
  department: 'Engineering',
  location: 'Yerevan',
  employmentType: 'full_time',
  description: 'Full description of the role.',
  requirements: '5+ years of React experience',
  salary: { min: 1500000, max: 2500000, currency: 'AMD' },
  createdAt: Date.now() - 3600_000,
  orgName: 'Profix',
};

describe('CareersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationCalls.length = 0;
    Object.keys(mutationImpls).forEach((k) => delete mutationImpls[k]);
    queryResults = {
      listOpenVacancies: { org: ORG, vacancies: VACANCIES },
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a loader while vacancies are loading', () => {
    queryResults.listOpenVacancies = undefined;
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('shows the not-found state when the org does not exist', () => {
    queryResults.listOpenVacancies = { org: null, vacancies: [] };
    render(<CareersPage orgSlug="nope" />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByText(/does not have a career page/)).toBeInTheDocument();
  });

  it('renders the hero, stats, filters and vacancy cards', () => {
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByText("We're Hiring")).toBeInTheDocument();
    expect(screen.getByText(/Join/)).toBeInTheDocument();
    expect(screen.getByText('Profix')).toBeInTheDocument();
    // stats
    expect(screen.getByText('Open Positions')).toBeInTheDocument();
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('Locations')).toBeInTheDocument();
    // cards
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Office Manager')).toBeInTheDocument();
    expect(screen.getByText('Senior QA')).toBeInTheDocument();
    // salary formatting
    expect(screen.getByText(/1.5M – 2.5M AMD/)).toBeInTheDocument();
    expect(screen.getByText(/900 – 1.2K USD/)).toBeInTheDocument();
    // footer CTA
    expect(screen.getByText(/Don't see the right role/)).toBeInTheDocument();
    const cta = screen.getByText('Get in Touch');
    expect(cta.closest('a')).toHaveAttribute('href', 'mailto:careers@profix.com');
  });

  it('renders the org logo when present', () => {
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByAltText('Profix')).toBeInTheDocument();
  });

  it('filters by search text against title and excerpt', () => {
    render(<CareersPage orgSlug="profix" />);
    fireEvent.change(screen.getByPlaceholderText('Search positions...'), {
      target: { value: 'office' },
    });
    expect(screen.queryByText('Frontend Engineer')).toBeNull();
    expect(screen.getByText('Office Manager')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search positions...'), {
      target: { value: 'quality' },
    });
    expect(screen.getByText('Senior QA')).toBeInTheDocument();
  });

  it('filters by department via the select', () => {
    render(<CareersPage orgSlug="profix" />);
    const selects = screen.getAllByTestId('custom-select');
    // first select = department
    fireEvent.change(selects[0], { target: { value: 'Engineering' } });
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Office Manager')).toBeNull();
  });

  it('filters by employment type via the select', () => {
    render(<CareersPage orgSlug="profix" />);
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[1], { target: { value: 'full_time' } });
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Office Manager')).toBeNull();
    expect(screen.queryByText('Senior QA')).toBeNull();
  });

  it('filters by location via the select', () => {
    render(<CareersPage orgSlug="profix" />);
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[2], { target: { value: 'Yerevan' } });
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Senior QA')).toBeNull();
  });

  it('clears all filters at once', () => {
    render(<CareersPage orgSlug="profix" />);
    fireEvent.change(screen.getByPlaceholderText('Search positions...'), {
      target: { value: 'office' },
    });
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Office Manager')).toBeInTheDocument();
  });

  it('shows a no-results message when filters exclude everything', () => {
    render(<CareersPage orgSlug="profix" />);
    fireEvent.change(screen.getByPlaceholderText('Search positions...'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByText('No positions match your filters')).toBeInTheDocument();
  });

  it('shows the no-vacancies message when the org has none', () => {
    queryResults.listOpenVacancies = { org: ORG, vacancies: [] };
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByText('No open positions right now')).toBeInTheDocument();
    expect(screen.getByText(/Check back soon/)).toBeInTheDocument();
  });

  it('formats exact-thousand salaries and fresh timestamps', () => {
    queryResults.listOpenVacancies = {
      org: ORG,
      vacancies: [
        {
          _id: 'v-10',
          title: 'Intern',
          employmentType: 'internship',
          salary: { min: 2000, max: 2000, currency: 'USD' },
          createdAt: Date.now() - 30_000, // under a minute
          excerpt: 'Learn on the job.',
        },
        {
          _id: 'v-11',
          title: 'Designer',
          employmentType: 'part_time',
          salary: { min: 500, max: 700, currency: 'USD' },
          createdAt: Date.now() - 10 * 60_000, // under an hour
          excerpt: 'Design delightful experiences.',
        },
      ],
    };
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByText(/2K – 2K USD/)).toBeInTheDocument();
    expect(screen.getByText(/500 – 700 USD/)).toBeInTheDocument();
    expect(screen.getByText('Intern')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
  });

  it('falls back to the raw employment type when unknown', () => {
    queryResults.listOpenVacancies = {
      org: ORG,
      vacancies: [
        {
          _id: 'v-20',
          title: 'Seasonal Helper',
          employmentType: 'seasonal',
          createdAt: Date.now(),
          excerpt: 'Summer help wanted.',
        },
      ],
    };
    render(<CareersPage orgSlug="profix" />);
    expect(screen.getByText('Seasonal Helper')).toBeInTheDocument();
    expect(screen.getByText('seasonal')).toBeInTheDocument();
  });

  it('renders modal details without department or location', () => {
    const { department, location, ...rest } = DETAILS;
    queryResults.getVacancyDetails = { ...rest };
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(screen.getByText('Full description of the role.')).toBeInTheDocument();
    expect(screen.getByText('Apply Now')).toBeInTheDocument();
  });

  it('falls back to the raw employment type in the modal for unknown types', () => {
    queryResults.getVacancyDetails = {
      ...DETAILS,
      employmentType: 'seasonal',
      department: undefined,
      location: undefined,
    };
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(screen.getByText('seasonal')).toBeInTheDocument();
  });

  it('opens the vacancy modal and shows details and requirements', () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));

    expect(screen.getByText('Full description of the role.')).toBeInTheDocument();
    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('5+ years of React experience')).toBeInTheDocument();
    expect(screen.getAllByText(/1.5M – 2.5M AMD/).length).toBeGreaterThan(0);
    expect(screen.getByText('Apply Now')).toBeInTheDocument();
  });

  it('shows a loader in the modal while details load', () => {
    queryResults.getVacancyDetails = undefined;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();
  });

  it('closes the modal via the X button', () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(screen.getByText('Apply Now')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '' }).closest('button')!);
    expect(screen.queryByText('Apply Now')).toBeNull();
  });

  it('closes the modal when clicking the backdrop', () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(screen.getByText('Apply Now')).toBeInTheDocument();

    fireEvent.click(document.querySelector('.fixed.inset-0')!);
    expect(screen.queryByText('Apply Now')).toBeNull();
  });

  it('blocks background scroll while the modal is open and restores it after', () => {
    queryResults.getVacancyDetails = DETAILS;
    const { unmount } = render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('validates required fields in the application form', async () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    // Empty submit → name/email required.
    fireEvent.click(screen.getByText('Submit Application'));
    await waitFor(() =>
      expect(screen.getByText('Name and email are required')).toBeInTheDocument(),
    );

    // Fill name/email but skip consent.
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.click(screen.getByText('Submit Application'));
    await waitFor(() =>
      expect(screen.getByText('Please agree to the privacy policy')).toBeInTheDocument(),
    );
  });

  it('submits a full application and shows the success screen', async () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.change(screen.getByPlaceholderText('+374 XX XXX XXX'), {
      target: { value: '+374 99 123 456' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Tell us about yourself/), {
      target: { value: '5 years of experience' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'applyToVacancy',
            args: [
              expect.objectContaining({
                vacancyId: 'v-1',
                name: 'Anna',
                email: 'anna@profix.am',
                phone: '+374 99 123 456',
                resumeText: '5 years of experience',
                consentGiven: true,
              }),
            ],
          }),
        ]),
      );
    });
    // Telegram notification fired with the vacancy title in the payload.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/telegram/notify',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Frontend Engineer'),
        }),
      );
    });
    expect(screen.getByText('Application Submitted!')).toBeInTheDocument();
    expect(screen.queryByText('Submit Application')).toBeNull();
  });

  it('submits an application without optional fields', async () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => {
      expect(mutationCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'applyToVacancy',
            args: [
              expect.objectContaining({
                phone: undefined,
                resumeText: undefined,
              }),
            ],
          }),
        ]),
      );
    });
  });

  it('shows the error message when the application fails', async () => {
    mutationImpls.applyToVacancy = jest.fn().mockRejectedValue(new Error('apply boom'));
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => expect(screen.getByText('apply boom')).toBeInTheDocument());
    expect(screen.queryByText('Application Submitted!')).toBeNull();
  });

  it('falls back to a generic error for non-Error failures', async () => {
    mutationImpls.applyToVacancy = jest.fn().mockRejectedValue('string boom');
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });

  it('goes back to the details view from the form', () => {
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));
    expect(screen.getByText('Your Application')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to details'));
    expect(screen.getByText('Apply Now')).toBeInTheDocument();
    expect(screen.queryByText('Your Application')).toBeNull();
  });

  it('closes the success screen via the Close button', async () => {
    mutationImpls.applyToVacancy = jest.fn().mockResolvedValue(undefined);
    queryResults.getVacancyDetails = DETAILS;
    render(<CareersPage orgSlug="profix" />);
    fireEvent.click(screen.getByText('Frontend Engineer'));
    fireEvent.click(screen.getByText('Apply Now'));

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
      target: { value: 'anna@profix.am' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => {
      expect(screen.getByText('Application Submitted!')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Application Submitted!')).toBeNull();
  });
});
