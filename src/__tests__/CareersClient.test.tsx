/**
 * Tests for CareersClient — the public careers page: hero + search, org/type/
 * department filters, vacancy cards and the application modal with email and
 * CV validation, upload and submission.
 *
 * Mocks: react-i18next (mutable mockLanguage for timeAgo locales), convex/react
 * (queries keyed by _name, mutation/action fn maps), api refs, auth store
 * (mutable mockUser), useHydrated (mutable), i18n/config side-effect, sonner,
 * ShieldLoader, CustomSelect (native select), Navbar/Footer, next/link,
 * next/image, lucide proxy. createPortal is left real — jsdom provides
 * document.body, and RTL queries it by default.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/* ── Mutable test doubles (read lazily by mock factories — component imported at the bottom) ── */

let mockHydrated = true;
let mockUser: { name?: string; email?: string } | null = null;
let mockLanguage = 'en';
const queryResults: Record<string, any> = {};
const mutationFns: Record<string, any> = {};
const actionFns: Record<string, any> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string'
        ? fallback
        : ((fallback as { defaultValue?: string } | undefined)?.defaultValue ?? key),
    i18n: { language: mockLanguage },
  }),
}));

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    mutationFns[name] = mutationFns[name] ?? jest.fn().mockResolvedValue(undefined);
    return mutationFns[name];
  },
  useAction: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    actionFns[name] = actionFns[name] ?? jest.fn();
    return actionFns[name];
  },
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    careers: {
      listAllOpenVacancies: { _name: 'listAllOpenVacancies' },
      listActiveOrganizations: { _name: 'listActiveOrganizations' },
      getVacancyDetails: { _name: 'getVacancyDetails' },
      applyToVacancy: { _name: 'applyToVacancy' },
    },
    emailValidation: { validateEmail: { _name: 'validateEmail' } },
  },
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

jest.mock('@/hooks/useHydrated', () => ({
  useHydrated: () => mockHydrated,
}));

jest.mock('@/i18n/config', () => ({}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/landing/Navbar', () => () => <nav data-testid="navbar">Nav</nav>);
jest.mock('@/components/landing/Footer', () => () => <footer data-testid="footer">Footer</footer>);

jest.mock('next/link', () => ({ children, href, ...props }: any) => (
  <a href={href} {...props}>
    {children}
  </a>
));

jest.mock('next/image', () => ({ src, alt, ...props }: any) => (
  <img src={src} alt={alt} {...props} />
));

jest.mock('lucide-react', () => {
  const Icon = ({ className, style }: any) => (
    <span data-testid="lucide" className={className} style={style} />
  );
  return new Proxy({}, { get: () => Icon });
});

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const ORGS = [
  { _id: 'org_1', name: 'Acme', slug: 'acme', logoUrl: undefined, industry: 'IT' },
  {
    _id: 'org_2',
    name: 'Globex',
    slug: 'globex',
    logoUrl: 'https://cdn/logo.png',
    industry: 'Retail',
  },
];

const VACANCIES = [
  {
    _id: 'vac_1',
    title: 'Frontend Engineer',
    department: 'Engineering',
    location: 'Yerevan',
    employmentType: 'full_time',
    salary: { min: 1000, max: 1500, currency: 'USD' },
    createdAt: Date.now() - 3600_000,
    excerpt: 'Build the product UI',
    org: { _id: 'org_1', name: 'Acme', slug: 'acme', logoUrl: undefined, industry: 'IT' },
  },
  {
    _id: 'vac_2',
    title: 'QA Engineer',
    department: 'Quality',
    location: undefined,
    employmentType: 'contract',
    salary: undefined,
    createdAt: Date.now() - 1000,
    excerpt: 'Test everything',
    org: {
      _id: 'org_2',
      name: 'Globex',
      slug: 'globex',
      logoUrl: 'https://cdn/logo.png',
      industry: 'Retail',
    },
  },
  {
    _id: 'vac_3',
    title: 'Big Pay Role',
    department: undefined,
    location: undefined,
    employmentType: 'weird_type',
    salary: { min: 2_500_000, max: 3_000_000, currency: 'AMD' },
    createdAt: Date.now() - 2000,
    excerpt: 'Lots of money',
    org: { _id: 'org_1', name: 'Acme', slug: 'acme', logoUrl: undefined, industry: undefined },
  },
  {
    _id: 'vac_4',
    title: 'Junior Role',
    department: undefined,
    location: undefined,
    employmentType: 'part_time',
    salary: { min: 500, max: 800, currency: 'USD' },
    createdAt: Date.now() - 5000,
    excerpt: 'Entry level',
    org: {
      _id: 'org_2',
      name: 'Globex',
      slug: 'globex',
      logoUrl: 'https://cdn/logo.png',
      industry: 'Retail',
    },
  },
];

const DETAIL = {
  _id: 'vac_1',
  title: 'Frontend Engineer',
  department: 'Engineering',
  location: 'Yerevan',
  employmentType: 'full_time',
  description: 'Line1\\nLine2',
  requirements: 'React\\nTypeScript',
  salary: { min: 1000, max: 1500, currency: 'USD' },
  createdAt: Date.now(),
  orgName: 'Acme',
};

function renderPage() {
  return render(<CareersClient />);
}

function openModal(detail: any = DETAIL) {
  // `null` (not undefined) opts out of the default so the loader state can be tested.
  queryResults.getVacancyDetails = detail;
  fireEvent.click(screen.getByText('Frontend Engineer').closest('button')!);
}

function applyForm() {
  openModal();
  fireEvent.click(screen.getByRole('button', { name: 'Apply Now' }));
  // Scope to the modal panel: the page behind it (portal) has its own textbox.
  const panel = document.querySelector('div.relative.w-full.max-w-2xl') as HTMLElement;
  const textboxes = within(panel).getAllByRole('textbox');
  return {
    name: textboxes[0],
    email: textboxes[1],
    phone: textboxes[2],
    resume: textboxes[3],
    consent: within(panel).getByRole('checkbox'),
    submit: within(panel).getByRole('button', { name: 'Submit Application' }),
  };
}

const cardOf = (title: string) => screen.getByText(title).closest('button')!;

beforeEach(() => {
  mockHydrated = true;
  mockUser = null;
  mockLanguage = 'en';
  queryResults.listAllOpenVacancies = VACANCIES;
  queryResults.listActiveOrganizations = ORGS;
  delete queryResults.getVacancyDetails;
  for (const m of Object.values(mutationFns)) m.mockClear();
  for (const a of Object.values(actionFns)) a.mockClear();
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      url: 'https://res.cloudinary.com/x/cv.pdf',
      name: 'cv.pdf',
      size: 10,
      type: 'application/pdf',
    }),
  });
});

afterEach(() => {
  document.body.style.overflow = '';
});

/* ── Page ─────────────────────────────────────────────────────────────── */

describe('CareersClient page', () => {
  it('renders only the navbar before hydration', () => {
    mockHydrated = false;
    renderPage();
    expect(screen.getByTestId('navbar')).toBeTruthy();
    expect(screen.queryByText('Find Your Dream Job')).toBeNull();
    expect(screen.queryByTestId('footer')).toBeNull();
  });

  it('shows a loader while vacancies are loading', () => {
    queryResults.listAllOpenVacancies = undefined;
    renderPage();
    expect(screen.getByTestId('shield-loader')).toBeTruthy();
  });

  it('renders the hero with the open-positions count and search box', () => {
    renderPage();
    expect(screen.getByText('Find Your Dream Job')).toBeTruthy();
    expect(screen.getByText(/4 open positions/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Search by job title or company...')).toBeTruthy();
  });

  it('shows the ellipsis badge while vacancies are loading', () => {
    queryResults.listAllOpenVacancies = undefined;
    renderPage();
    expect(screen.getByText('...')).toBeTruthy();
  });

  it('filters cards by title search', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search by job title or company...'), {
      target: { value: 'QA' },
    });
    expect(screen.getByText('QA Engineer')).toBeTruthy();
    expect(screen.queryByText('Frontend Engineer')).toBeNull();
  });

  it('filters cards by org name search', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search by job title or company...'), {
      target: { value: 'acme' },
    });
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
    expect(screen.queryByText('QA Engineer')).toBeNull();
  });

  it('filters by organization select', () => {
    renderPage();
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[0], { target: { value: 'globex' } });
    expect(screen.getByText('QA Engineer')).toBeTruthy();
    expect(screen.queryByText('Frontend Engineer')).toBeNull();
  });

  it('filters by employment type', () => {
    renderPage();
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[1], { target: { value: 'contract' } });
    expect(screen.getByText('QA Engineer')).toBeTruthy();
    expect(screen.queryByText('Frontend Engineer')).toBeNull();
  });

  it('filters by department', () => {
    renderPage();
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[2], { target: { value: 'Engineering' } });
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
    expect(screen.queryByText('QA Engineer')).toBeNull();
  });

  it('shows the active-filter count and clears all filters', () => {
    renderPage();
    const selects = screen.getAllByTestId('custom-select');
    fireEvent.change(selects[0], { target: { value: 'globex' } });
    fireEvent.change(selects[1], { target: { value: 'contract' } });
    const clear = screen.getByRole('button', { name: /Clear \(2\)/ });
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
    expect(screen.getByText('QA Engineer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull();
  });

  it('shows the empty state when nothing matches', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search by job title or company...'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByText('No positions found')).toBeTruthy();
    expect(screen.getByText('Try adjusting your filters or search query')).toBeTruthy();
  });

  it('renders the org options from the query result', () => {
    renderPage();
    const select = screen.getAllByTestId('custom-select')[0] as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'All Companies',
      'Acme',
      'Globex',
    ]);
  });

  it('derives department options from the vacancies', () => {
    renderPage();
    const select = screen.getAllByTestId('custom-select')[2] as HTMLSelectElement;
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toEqual(['All Departments', 'Engineering', 'Quality']);
  });
});

/* ── Vacancy cards ────────────────────────────────────────────────────── */

describe('VacancyCard', () => {
  it('renders full card details: title, org, industry, dept, type, location, salary, time', () => {
    renderPage();
    const card = cardOf('Frontend Engineer');
    expect(card.textContent).toContain('Acme');
    expect(card.textContent).toContain('· IT');
    expect(card.textContent).toContain('Engineering');
    expect(card.textContent).toContain('Full-time');
    expect(card.textContent).toContain('Yerevan');
    expect(card.textContent).toContain('1K – 1.5K USD');
    expect(card.textContent).toMatch(/ago/);
  });

  it('renders the org logo when available and the initial when not', () => {
    renderPage();
    const logos = screen.getAllByAltText('Globex') as HTMLImageElement[];
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0].src).toContain('https://cdn/logo.png');
    expect(screen.getAllByText('A').length).toBeGreaterThan(0); // Acme initial
  });

  it('formats million-range salaries compactly and unknown types as-is', () => {
    renderPage();
    expect(screen.getByText('2.5M – 3M AMD')).toBeTruthy();
    expect(screen.getByText('weird_type')).toBeTruthy();
  });

  it('formats small salaries with plain locale digits', () => {
    renderPage();
    expect(screen.getByText('500 – 800 USD')).toBeTruthy();
  });

  it('hides optional meta when missing', () => {
    renderPage();
    const qaCard = cardOf('QA Engineer');
    expect(qaCard.textContent).not.toContain('Yerevan');
    expect(qaCard.textContent).not.toContain('–');
  });

  it('formats time with the Russian locale when the UI language is ru', () => {
    mockLanguage = 'ru';
    renderPage();
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
    expect(screen.getAllByText(/назад/).length).toBeGreaterThan(0);
  });

  it('formats time with the Armenian locale when the UI language is hy', () => {
    mockLanguage = 'hy';
    renderPage();
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
  });

  it('formats time with the German locale when the UI language is de', () => {
    mockLanguage = 'de';
    renderPage();
    expect(screen.getByText('Frontend Engineer')).toBeTruthy();
  });
});

/* ── Detail modal ─────────────────────────────────────────────────────── */

describe('VacancyDetailModal', () => {
  it('opens on card click and closes via the close button', () => {
    renderPage();
    openModal();
    expect(screen.getByText('Description')).toBeTruthy();
    fireEvent.click(document.querySelector('button.absolute.top-4.right-4')!);
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('closes when the backdrop is clicked', () => {
    renderPage();
    openModal();
    const backdrop = [...document.querySelectorAll('div')].find((d) =>
      (d.className as string).includes('bg-black/60'),
    )!;
    fireEvent.click(backdrop);
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('keeps the modal open when the inner panel is clicked', () => {
    renderPage();
    openModal();
    fireEvent.click(document.querySelector('div.relative.w-full.max-w-2xl')!);
    expect(screen.getByText('Description')).toBeTruthy();
  });

  it('locks body scroll while open and unlocks on close', () => {
    renderPage();
    openModal();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(document.querySelector('button.absolute.top-4.right-4')!);
    expect(document.body.style.overflow).toBe('');
  });

  it('shows a loader while the detail is loading', () => {
    renderPage();
    openModal(null);
    expect(screen.getByTestId('shield-loader')).toBeTruthy();
  });

  it('renders the description and requirements', () => {
    renderPage();
    openModal();
    expect(screen.getByText(/Line1/)).toBeTruthy();
    expect(screen.getByText(/React/)).toBeTruthy();
  });

  it('omits the requirements section when absent', () => {
    renderPage();
    openModal({ ...DETAIL, requirements: undefined });
    expect(screen.queryByText('Requirements')).toBeNull();
  });

  it('links Join Organization to onboarding when the user is logged in', () => {
    mockUser = { name: 'Anna', email: 'anna@example.com' };
    renderPage();
    openModal();
    const join = screen.getByRole('link', { name: 'Join this Organization' });
    expect(join.getAttribute('href')).toBe('/onboarding/select-organization?org=acme');
  });

  it('links Join Organization to register when the user is anonymous', () => {
    renderPage();
    openModal();
    const join = screen.getByRole('link', { name: 'Join this Organization' });
    expect(join.getAttribute('href')).toBe('/register?org=acme');
  });

  it('links to all org vacancies', () => {
    renderPage();
    openModal();
    const viewAll = screen.getByRole('link', { name: /View all positions at/ });
    expect(viewAll.getAttribute('href')).toBe('/careers/acme');
  });
});

/* ── Apply form ───────────────────────────────────────────────────────── */

describe('apply flow', () => {
  it('prefills name and email from the logged-in user', () => {
    mockUser = { name: 'Anna Petrova', email: 'anna@example.com' };
    renderPage();
    const f = applyForm();
    expect((f.name as HTMLInputElement).value).toBe('Anna Petrova');
    expect((f.email as HTMLInputElement).value).toBe('anna@example.com');
  });

  it('keeps the submit button disabled until name, email and consent', () => {
    renderPage();
    const f = applyForm();
    expect(f.submit).toBeDisabled();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    expect(f.submit).toBeDisabled();
    fireEvent.click(f.consent);
    expect(f.submit).toBeEnabled();
  });

  it('goes back from the form to the detail view', () => {
    renderPage();
    applyForm();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Apply Now' })).toBeTruthy();
  });

  it('shows a mapped error for a rejected email reason', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: false, reason: 'no_mx_records' });
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() =>
      expect(screen.getByText('This email domain cannot receive messages')).toBeTruthy(),
    );
    expect(mutationFns.applyToVacancy).not.toHaveBeenCalled();
  });

  it('shows a mapped error for an invalid-format email', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: false, reason: 'invalid_format' });
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'nope' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() => expect(screen.getByText('Invalid email format')).toBeTruthy());
  });

  it('falls back to a generic message for an unknown rejection reason', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: false, reason: 'weird' });
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() => expect(screen.getByText('Invalid email address')).toBeTruthy());
  });

  it('clears the email error as the address is edited', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: false, reason: 'no_mx_records' });
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() =>
      expect(screen.getByText('This email domain cannot receive messages')).toBeTruthy(),
    );
    fireEvent.change(f.email, { target: { value: 'new@b.com' } });
    expect(screen.queryByText('This email domain cannot receive messages')).toBeNull();
  });

  it('submits a CV-less application, shows success and posts the telegram event', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: true });
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.change(f.phone, { target: { value: '+374' } });
    fireEvent.change(f.resume, { target: { value: 'Experienced' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);

    await waitFor(() =>
      expect(mutationFns.applyToVacancy).toHaveBeenCalledWith({
        vacancyId: 'vac_1',
        name: 'Anna',
        email: 'a@b.com',
        phone: '+374',
        resumeText: 'Experienced',
        consentGiven: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('Application Submitted!')).toBeTruthy());
    const tgCall = (global.fetch as jest.Mock).mock.calls.find(
      (c) => String(c[0]) === '/api/telegram/notify',
    );
    expect(tgCall).toBeTruthy();
    expect(JSON.parse(tgCall![1].body)).toMatchObject({
      type: 'career',
      data: { name: 'Anna', vacancy: 'Frontend Engineer' },
    });
  });

  it('rejects a non-PDF CV without uploading', () => {
    renderPage();
    applyForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'cv.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByText('careers.cvMustBePdf')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized CV', () => {
    renderPage();
    applyForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File([new ArrayBuffer(11 * 1024 * 1024)], 'cv.pdf', { type: 'application/pdf' }),
        ],
      },
    });
    expect(screen.getByText('careers.cvTooLarge')).toBeTruthy();
  });

  it('uploads a valid CV and passes its metadata to the mutation', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: true });
    renderPage();
    const f = applyForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);

    await waitFor(() =>
      expect(mutationFns.applyToVacancy).toHaveBeenCalledWith(
        expect.objectContaining({
          cvFileUrl: 'https://res.cloudinary.com/x/cv.pdf',
          cvFileName: 'cv.pdf',
          cvFileSize: 10,
          cvMimeType: 'application/pdf',
        }),
      ),
    );
  });

  it('shows the server error when the CV upload fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Too big' }),
    });
    renderPage();
    const f = applyForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() => expect(screen.getByText('Too big')).toBeTruthy());
    expect(mutationFns.applyToVacancy).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the upload error is not JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('no json');
      },
    });
    renderPage();
    const f = applyForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() => expect(screen.getByText('Could not upload the CV')).toBeTruthy());
  });

  it('shows a toast when the mutation throws', async () => {
    actionFns.validateEmail.mockResolvedValue({ valid: true });
    mutationFns.applyToVacancy.mockRejectedValueOnce(new Error('boom'));
    const { toast } = jest.requireMock('sonner') as { toast: { error: jest.Mock } };
    renderPage();
    const f = applyForm();
    fireEvent.change(f.name, { target: { value: 'Anna' } });
    fireEvent.change(f.email, { target: { value: 'a@b.com' } });
    fireEvent.click(f.consent);
    fireEvent.click(f.submit);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error submitting application'));
  });
});

import CareersClient from '@/components/careers/CareersClient';
