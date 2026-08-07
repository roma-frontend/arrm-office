/**
 * Tests for src/app/(auth)/register-org pages:
 *   - create: instant starter organization form (slug autogen, validation, submit)
 *   - request: professional/enterprise request form (plan param, validation, submit)
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) =>
      typeof fallbackOrOpts === 'string' ? fallbackOrOpts : key,
    ready: true,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    Building2: Icon,
    User: Icon,
    Mail: Icon,
    Lock: Icon,
    Phone: Icon,
    Globe: Icon,
    Briefcase: Icon,
    Eye: Icon,
    EyeOff: Icon,
    ArrowLeft: Icon,
    CheckCircle2: Icon,
    AlertCircle: Icon,
    Zap: Icon,
    Users: Icon,
    Crown: Icon,
  };
});

jest.mock('next/link', () => {
  return ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
});

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ login: jest.fn() }),
}));

// ── bcrypt ───────────────────────────────────────────────────────────────────
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// ── convex ───────────────────────────────────────────────────────────────────
const mockMutation = jest.fn().mockResolvedValue({});
jest.mock('convex/react', () => ({
  useMutation: () => mockMutation,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    organizationRequests: {
      createStarterOrganization: { _name: 'createStarterOrganization' },
      requestOrganization: { _name: 'requestOrganization' },
    },
  },
}));

// ── useCurrency ──────────────────────────────────────────────────────────────
jest.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({
    loading: false,
    starter: { formatted: '$29' },
    professional: { formatted: '$79' },
    currency: 'USD',
    symbol: '$',
    locale: 'en',
  }),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, ...props }: any) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ value, onChange, options }: any) => (
    <select value={value} onChange={(e: any) => onChange(e.target.value)} data-testid="select">
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

// ── navigation ───────────────────────────────────────────────────────────────
const mockPush = jest.fn();
let mockParams = new URLSearchParams('plan=professional');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}));

import CreateStarterOrgPage from '@/app/(auth)/register-org/create/page';
import RequestOrgPage from '@/app/(auth)/register-org/request/page';

describe('register-org/create page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutation.mockResolvedValue({});
  });

  it('renders the starter org form', () => {
    render(<CreateStarterOrgPage />);
    expect(screen.getByText('register.createStarterOrg')).toBeInTheDocument();
    expect(screen.getByText('register.orgNameLabel')).toBeInTheDocument();
    expect(screen.getByText('register.orgUrlLabel')).toBeInTheDocument();
  });

  it('auto-generates the slug from the organization name', () => {
    render(<CreateStarterOrgPage />);
    const orgInputs = screen.getAllByPlaceholderText('placeholders.acmeInc');
    fireEvent.change(orgInputs[0]!, { target: { value: 'My New Company' } });
    const slugInput = screen.getByPlaceholderText('acme-inc');
    expect((slugInput as HTMLInputElement).value).toBe('my-new-company');
  });

  it('rejects a short password', async () => {
    render(<CreateStarterOrgPage />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const pwInput = screen.getByPlaceholderText('placeholders.minCharacters');
    fireEvent.change(pwInput, { target: { value: 'short' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it('rejects a missing slug', async () => {
    render(<CreateStarterOrgPage />);
    fireEvent.change(screen.getByPlaceholderText('placeholders.minCharacters'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Organization slug is required')).toBeInTheDocument();
  });

  it('creates the organization on submit', async () => {
    mockMutation.mockResolvedValue({});
    render(<CreateStarterOrgPage />);
    const orgInputs = screen.getAllByPlaceholderText('placeholders.acmeInc');
    fireEvent.change(orgInputs[0]!, { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByPlaceholderText('placeholders.johnDoe'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.youAtCompany'), {
      target: { value: 'john@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.minCharacters'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockMutation).toHaveBeenCalled());
    expect(mockMutation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme Inc', slug: 'acme-inc', email: 'john@acme.com' }),
    );
  });

  it('shows an error when the mutation fails', async () => {
    mockMutation.mockRejectedValue(new Error('Slug taken'));
    render(<CreateStarterOrgPage />);
    const orgInputs = screen.getAllByPlaceholderText('placeholders.acmeInc');
    fireEvent.change(orgInputs[0]!, { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByPlaceholderText('placeholders.johnDoe'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.youAtCompany'), {
      target: { value: 'john@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.minCharacters'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form')!);

    expect(await screen.findByText('Slug taken')).toBeInTheDocument();
  });
});

describe('register-org/request page', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMutation.mockResolvedValue({});
    mockParams = new URLSearchParams('plan=professional');
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('renders the request form with the plan context', () => {
    render(<RequestOrgPage />);
    expect(screen.getByText('registerOrgPage.requestTitle')).toBeInTheDocument();
    expect(screen.getByText('registerOrgPage.orgDetails')).toBeInTheDocument();
    // The heading combines yourDetails and adminAccount with parentheses
    expect(screen.getByText(/registerOrgPage\.yourDetails/)).toBeInTheDocument();
  });

  it('rejects a short password', async () => {
    render(<RequestOrgPage />);
    const pwInput = screen.getByPlaceholderText('placeholders.minCharacters');
    fireEvent.change(pwInput, { target: { value: 'short' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it('submits the request and redirects to pending', async () => {
    mockMutation.mockResolvedValue({});
    render(<RequestOrgPage />);
    fireEvent.change(screen.getByPlaceholderText('placeholders.acmeCorporation'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.johnDoe'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'john@acme.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('placeholders.minCharacters'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(mockMutation).toHaveBeenCalled());
    expect(mockMutation).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'professional', name: 'Acme Corp' }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/register-org/pending'));
  });
});
