import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ──
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

const mockUseQuery = jest.fn();
jest.mock('convex/react', () => ({ useQuery: (...args: any[]) => mockUseQuery(...args) }));

// Not `virtual: true`: the module exists, and registering it as virtual made the
// mock lose to an already-resolved real module depending on which other suites
// shared the worker. The component then received the real Convex `api` proxy —
// which throws "Cannot convert object to primitive value" the moment Jest tries
// to print it — so the failure was both intermittent and unreadable.
jest.mock('@/convex/_generated/api', () => ({
  api: { reporting: { getPotentialManagers: 'getPotentialManagers' } },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...p }: any) => <img alt={alt} {...p} />,
}));

import { UserPicker } from '@/components/ui/UserPicker';

const users = [
  {
    _id: 'u1',
    name: 'Anna Petrova',
    email: 'anna@acme.com',
    role: 'employee',
    department: 'Engineering',
    position: 'Developer',
  },
  {
    _id: 'u2',
    name: 'Boris Ivanov',
    email: 'boris@acme.com',
    role: 'supervisor',
    department: 'Sales',
  },
];

describe('UserPicker', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue(users);
  });

  it('renders org employees instead of asking for a raw ID', () => {
    render(
      <UserPicker organizationId={'o1' as any} value="" onChange={() => {}} label="New hire" />,
    );

    expect(screen.getByText('New hire')).toBeInTheDocument();
    expect(screen.getByText('Anna Petrova')).toBeInTheDocument();
    expect(screen.getByText('Boris Ivanov')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, email, department…')).toBeInTheDocument();
  });

  it('returns the selected user id and object on click', () => {
    const onChange = jest.fn();
    const onSelectUser = jest.fn();
    render(
      <UserPicker
        organizationId={'o1' as any}
        value=""
        onChange={onChange}
        onSelectUser={onSelectUser}
      />,
    );

    fireEvent.click(screen.getByText('Anna Petrova'));

    expect(onChange).toHaveBeenCalledWith('u1');
    expect(onSelectUser).toHaveBeenCalledWith(expect.objectContaining({ _id: 'u1' }));
  });

  it('shows the selected employee summary and can clear it', () => {
    const onChange = jest.fn();
    render(<UserPicker organizationId={'o1' as any} value="u2" onChange={onChange} />);

    expect(screen.getByText('Boris Ivanov')).toBeInTheDocument();
    // list is hidden once someone is selected
    expect(screen.queryByPlaceholderText('Search by name, email, department…')).toBeNull();

    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('skips the query when there is no organization', () => {
    mockUseQuery.mockReturnValue(undefined);
    render(<UserPicker value="" onChange={() => {}} />);

    // The query reference itself is not the point — that the second argument is
    // `'skip'` is. Asserting on the reference tied the test to how the api module
    // happened to resolve.
    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), 'skip');
    expect(screen.getByText('No organization selected')).toBeInTheDocument();
  });
});
