import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DriverRequestModal, geocodeSearch } from '@/components/calendar/DriverRequestModal';
import { toast } from 'sonner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => (typeof opts === 'string' ? opts : key),
    i18n: { language: 'en' },
  }),
}));

let queryResults: Record<string, any> = {};
const mutationCalls: Array<{ name?: string; args: any[] }> = [];
const mutationImpls: Record<string, (...args: any[]) => any> = {};

jest.mock('convex/react', () => ({
  useQuery: (ref: { _name?: string }) => queryResults[ref?._name ?? ''],
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
    users: {
      queries: { getCurrentUser: { _name: 'getCurrentUser' } },
    },
    drivers: {
      queries: {
        getAvailableDrivers: { _name: 'getAvailableDrivers' },
        getAlternativeDrivers: { _name: 'getAlternativeDrivers' },
        isDriverOnLeave: { _name: 'isDriverOnLeave' },
      },
      requests_mutations: { requestDriver: { _name: 'requestDriver' } },
    },
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

let mockNow = Date.now();
jest.mock('@/hooks/useNow', () => ({
  useNow: () => mockNow,
}));

let mockUser: any = { id: 'user-1' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

let mockSelectedOrg: string | null = 'org-1';
jest.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: () => mockSelectedOrg,
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

let pickupProps: any = {};
let dropoffProps: any = {};
let mapProps: any = {};
jest.mock('@/components/drivers/PlaceAutocomplete', () => ({
  PlaceAutocomplete: (props: any) => {
    if (props.placeholder === 'e.g., Office') pickupProps = props;
    else dropoffProps = props;
    return <div data-testid="place-autocomplete" />;
  },
}));

jest.mock('@/components/drivers/DriverMap', () => ({
  DriverMap: (props: any) => {
    mapProps = props;
    return <div data-testid="driver-map" />;
  },
}));

jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button type={props.type || 'button'} {...props}>
      {props.children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, className }: any) => <div className={className}>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
  AvatarImage: ({ src, alt }: any) => <img src={src} alt={alt ?? ''} />,
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children, className }: any) => (
    <div data-testid="sheet-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetBody: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children, disabled }: any) => {
    const options: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child?.props) return;
      if (child.props.value) options.push(child);
      else if (child.props.children) {
        React.Children.forEach(child.props.children, (grand: any) => {
          if (grand?.props?.value) options.push(grand);
        });
      }
    });
    return (
      <div data-testid="select" data-disabled={!!disabled}>
        <button type="button" data-testid={`select-current-${value}`}>
          {value}
        </button>
        <div data-testid="select-options">
          {options.map((opt) => (
            <button
              key={opt.props.value}
              type="button"
              data-testid={`select-option-${opt.props.value}`}
              onClick={() => onValueChange(opt.props.value)}
            >
              {opt.props.value}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return {
    Select,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <div value={value}>{children}</div>,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

const currentUser = { _id: 'user-1', organizationId: 'org-1', name: 'Alice' };

const availableDrivers = [
  {
    _id: 'drv-1',
    userName: 'Bob',
    vehicleInfo: { model: 'Toyota', plateNumber: 'AA-01', capacity: 4 },
  },
  {
    _id: 'drv-2',
    userName: 'Carol',
    vehicleInfo: { model: 'BMW', plateNumber: 'BB-02', capacity: 2 },
  },
];

const leave = {
  startDate: '2026-01-01',
  endDate: '2026-01-10',
  type: 'paid',
  reason: 'Vacation',
};

const alternativeDrivers = [
  {
    _id: 'drv-3',
    userName: 'Dan',
    userAvatar: '/a.png',
    vehicleInfo: { model: 'Honda', plateNumber: 'CC-03', capacity: 5 },
  },
];

const seed = () => {
  queryResults = {
    getCurrentUser: currentUser,
    getAvailableDrivers: availableDrivers,
    getAlternativeDrivers: undefined,
    isDriverOnLeave: { onLeave: false, leave: null },
  };
  mutationCalls.length = 0;
  Object.keys(mutationImpls).forEach((key) => delete mutationImpls[key]);
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockUser = { id: 'user-1' };
  mockSelectedOrg = 'org-1';
  pickupProps = {};
  dropoffProps = {};
  mapProps = {};
};

beforeEach(seed);

const onOpenChange = jest.fn();
const renderModal = (props: any = {}) =>
  render(<DriverRequestModal open={true} onOpenChange={onOpenChange} {...props} />);

describe('DriverRequestModal', () => {
  it('shows the loader while the current user loads', () => {
    queryResults.getCurrentUser = undefined;
    renderModal();
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
    expect(screen.queryByText('Request Driver')).not.toBeInTheDocument();
  });

  it('renders the form with drivers and trip fields', () => {
    renderModal();
    expect(screen.getByText('Request Driver')).toBeInTheDocument();
    expect(screen.getByText('Select Driver')).toBeInTheDocument();
    expect(screen.getAllByTestId('place-autocomplete').length).toBe(2);
    expect(screen.getByTestId('driver-map')).toBeInTheDocument();
    expect(screen.getByText('Trip Purpose')).toBeInTheDocument();
    expect(screen.getByText('Start Time')).toBeInTheDocument();
    expect(screen.getByText('End Time')).toBeInTheDocument();
    expect(screen.getByText('Passengers')).toBeInTheDocument();
    expect(screen.getByText('Notes (Optional)')).toBeInTheDocument();
    expect(mapProps.height).toBe('300px');
    expect(mapProps.interactive).toBe(true);
  });

  it('shows the no-drivers message when none are available', () => {
    queryResults.getAvailableDrivers = [];
    renderModal();
    expect(screen.getByText('No drivers available')).toBeInTheDocument();
  });

  it('selects a driver from the dropdown', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    expect(screen.getByTestId('select-current-drv-1')).toBeInTheDocument();
  });

  it('pre-fills the times from the selected date', () => {
    const { container } = renderModal({ selectedDate: new Date('2026-06-15T00:00:00') });
    const start = new Date('2026-06-15T00:00:00');
    start.setHours(9, 0, 0, 0);
    const end = new Date('2026-06-15T00:00:00');
    end.setHours(18, 0, 0, 0);
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    expect(inputs[0].value).toBe(start.toISOString().slice(0, 16));
    expect(inputs[1].value).toBe(end.toISOString().slice(0, 16));
  });

  it('validates that a user is logged in', async () => {
    queryResults.getCurrentUser = { _id: '', organizationId: 'org-1' };
    renderModal();
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('toasts.pleaseLogin'));
  });

  it('validates that a driver is selected', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('toasts.pleaseSelectDriver'));
  });

  it('validates that times are selected', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('toasts.pleaseSelectTime'));
  });

  it('validates that locations are filled', async () => {
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('toasts.pleaseFillLocations'));
  });

  it('submits a successful driver request with the full payload', async () => {
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });

    act(() => {
      pickupProps.onChange('Office');
      pickupProps.onSelect({ lat: 40.1, lng: 44.5, address: 'Office Bldg' });
      dropoffProps.onChange('Airport');
      dropoffProps.onSelect({ lat: 40.2, lng: 44.6, address: 'Zvartnots' });
    });

    fireEvent.change(screen.getByPlaceholderText('e.g., Airport transfer, Client meeting'), {
      target: { value: 'Client meeting' },
    });
    fireEvent.change(screen.getByPlaceholderText('Additional information for the driver...'), {
      target: { value: 'Call on arrival' },
    });
    const passenger = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(passenger, { target: { value: '3' } });

    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'requestDriver',
        args: [
          expect.objectContaining({
            organizationId: 'org-1',
            driverId: 'drv-1',
            startTime: new Date('2026-06-15T09:00').getTime(),
            endTime: new Date('2026-06-15T18:00').getTime(),
            tripInfo: {
              from: 'Office Bldg',
              to: 'Zvartnots',
              purpose: 'Client meeting',
              passengerCount: 3,
              notes: 'Call on arrival',
              pickupCoords: { lat: 40.1, lng: 44.5 },
              dropoffCoords: { lat: 40.2, lng: 44.6 },
            },
          }),
        ],
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Driver request submitted!');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits without coordinates when places are typed only', async () => {
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    act(() => {
      pickupProps.onChange('Office');
      dropoffProps.onChange('Airport');
    });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'requestDriver',
        args: [
          expect.objectContaining({
            tripInfo: expect.objectContaining({
              from: 'Office',
              to: 'Airport',
              pickupCoords: undefined,
              dropoffCoords: undefined,
            }),
          }),
        ],
      }),
    );
  });

  it('handles a server-side error result', async () => {
    mutationImpls.requestDriver = jest
      .fn()
      .mockResolvedValue({ error: { message: 'Driver is busy' } });
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    act(() => {
      pickupProps.onChange('Office');
      dropoffProps.onChange('Airport');
    });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        'Невозможно заказать водителя: он находится в отпуске',
        expect.objectContaining({ description: 'Driver is busy' }),
      ),
    );
  });

  it('toasts an error message when the request throws', async () => {
    mutationImpls.requestDriver = jest.fn().mockRejectedValue(new Error('network down'));
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    act(() => {
      pickupProps.onChange('Office');
      dropoffProps.onChange('Airport');
    });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('network down'));
  });

  it('uses the fallback message when the request throws a non-Error', async () => {
    mutationImpls.requestDriver = jest.fn().mockRejectedValue('oops');
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    act(() => {
      pickupProps.onChange('Office');
      dropoffProps.onChange('Airport');
    });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Не удалось запросить водителя'),
    );
  });

  it('cancels the dialog', () => {
    renderModal();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the checking state and disables the submit button', () => {
    queryResults.isDriverOnLeave = undefined;
    const { container } = renderModal();
    fireEvent.click(screen.getByTestId('select-option-drv-1'));
    const inputs = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-15T09:00' } });
    fireEvent.change(inputs[1], { target: { value: '2026-06-15T18:00' } });
    expect(screen.getByText('Проверка...').closest('button')).toBeDisabled();
  });

  it('shows the leave warning with leave type and reason', () => {
    queryResults.isDriverOnLeave = { onLeave: true, leave };
    renderModal();
    expect(screen.getByText('Driver on leave')).toBeInTheDocument();
    expect(screen.getByText(/Booking unavailable/)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-01-01/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-01-10/).length).toBeGreaterThan(0);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText('Водитель в отпуске')).toBeInTheDocument();
    expect(screen.getByText('Водитель в отпуске').closest('button')).toBeDisabled();
  });

  it('maps every leave type to its label', () => {
    const cases: Array<[string, string]> = [
      ['paid', 'Paid'],
      ['sick', 'Sick'],
      ['family', 'Family'],
      ['unpaid', 'Unpaid'],
      ['other', 'other'],
    ];
    for (const [type, label] of cases) {
      const { unmount } = renderModal();
      queryResults.isDriverOnLeave = { onLeave: true, leave: { ...leave, type } };
      const view = render(<DriverRequestModal open onOpenChange={onOpenChange} />);
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      view.unmount();
      unmount();
    }
  });

  it('omits the reason when absent and shows no-alternatives hint', () => {
    queryResults.isDriverOnLeave = { onLeave: true, leave: { ...leave, reason: '' } };
    queryResults.getAlternativeDrivers = [];
    renderModal();
    expect(screen.queryByText('Vacation')).not.toBeInTheDocument();
    expect(screen.getByText(/Нет доступных водителей/)).toBeInTheDocument();
  });

  it('lists alternative drivers and selects one', () => {
    queryResults.isDriverOnLeave = { onLeave: true, leave };
    queryResults.getAlternativeDrivers = alternativeDrivers;
    renderModal();
    expect(screen.getByText('Dan')).toBeInTheDocument();
    expect(screen.getByText(/Honda/)).toBeInTheDocument();
    expect(screen.getByText(/CC-03/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Выбрать'));
    expect(mockToast.success).toHaveBeenCalledWith('Выбран водитель: Dan');
    expect(screen.getByTestId('select-current-drv-3')).toBeInTheDocument();
  });

  it('updates the pickup location from the map', () => {
    renderModal();
    act(() => {
      mapProps.onLocationSelect({ lat: 1, lng: 2, address: 'Mapped pickup' }, 'pickup');
    });
    expect(mapProps.pickupLocation).toBeDefined();
    expect(screen.getByTestId('driver-map')).toBeInTheDocument();
  });

  it('updates the dropoff location from the map', () => {
    renderModal();
    act(() => {
      mapProps.onLocationSelect({ lat: 1, lng: 2, address: 'Mapped dropoff' }, 'dropoff');
    });
    expect(mapProps.dropoffLocation).toBeDefined();
  });

  it('clears coordinates when the pickup text changes', () => {
    renderModal();
    act(() => {
      pickupProps.onSelect({ lat: 1, lng: 2, address: 'Picked' });
      pickupProps.onChange('New text');
    });
    expect(mapProps.pickupCoords).toBeUndefined();
  });

  it('closes the result dropdowns on outside click', () => {
    renderModal();
    fireEvent.mouseDown(document.body);
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('does not render the form when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Request Driver')).not.toBeInTheDocument();
  });
});

describe('geocodeSearch', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  it('returns an empty list for short queries', async () => {
    await expect(geocodeSearch('ab')).resolves.toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps geocoding results to coordinates', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '40.1', lon: '44.5', display_name: 'Yerevan' }],
    });
    await expect(geocodeSearch('Yerevan')).resolves.toEqual([
      { lat: 40.1, lng: 44.5, display_name: 'Yerevan' },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/search?format=json&q='),
      expect.objectContaining({ headers: { 'Accept-Language': 'en,ru' } }),
    );
  });

  it('returns an empty list on HTTP errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(geocodeSearch('Yerevan')).resolves.toEqual([]);
  });

  it('returns an empty list when there are no results', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    await expect(geocodeSearch('Yerevan')).resolves.toEqual([]);
  });

  it('returns an empty list when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('net down'));
    await expect(geocodeSearch('Yerevan')).resolves.toEqual([]);
  });
});
