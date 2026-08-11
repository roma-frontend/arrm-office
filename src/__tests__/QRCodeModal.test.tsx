/**
 * Tests for QRCodeModal — the asset QR-sticker dialog.
 *
 * Covers: the loading skeleton, the generated QR content (accent colors per
 * category, brand/model subtitle, SN + tag badges), the deep-link origin
 * rewrite against window.location (and the invalid-URL fallback), QR
 * generation via the lazy-loaded QRCode library (incl. the cancelled-effect
 * guard), copy-to-clipboard with toast + check reset, PNG download, the print
 * sticker flow (new window and window.print fallback), and the dark theme.
 *
 * Mocks: react-i18next, convex/react (getAssetQRData), generated api,
 * ThemeProvider (mutable resolvedTheme), lucide, sonner toast, dynamic-imports
 * (loadQRCode), Button and Dialog primitives, plus clipboard/window.open.
 */

import React from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// ── Theme ────────────────────────────────────────────────────────────────────
let mockTheme = 'light';
jest.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let mockQrData: any = undefined;
jest.mock('convex/react', () => ({
  useQuery: (q: any, args: any) =>
    q?._name === 'getAssetQRData' ? (args === 'skip' ? undefined : mockQrData) : undefined,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    assets: { getAssetQRData: { _name: 'getAssetQRData' } },
  },
}));

// ── lucide ───────────────────────────────────────────────────────────────────
jest.mock('lucide-react', () => {
  const names = ['QrCode', 'Download', 'Printer', 'Copy', 'Check', 'ScanLine'];
  const mocks: Record<string, any> = {};
  for (const name of names) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── Toast ────────────────────────────────────────────────────────────────────
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({
  toast: mockToast,
}));

// ── Lazy QR library ──────────────────────────────────────────────────────────
const mockQrToDataURL = jest.fn();
const mockLoadQRCode = jest.fn();
jest.mock('@/lib/dynamic-imports', () => ({
  loadQRCode: (...args: any[]) => mockLoadQRCode(...args),
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)}>
          close
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

import QRCodeModal from '@/components/assets/QRCodeModal';

const ASSET = {
  _id: 'a1',
  name: 'MacBook Pro 14',
  serialNumber: 'SN-1234',
  assetTag: 'AST-99',
  category: 'laptop',
  brand: 'Apple',
  model: 'M3 Pro',
};

function renderModal(props: Record<string, any> = {}) {
  const base = {
    open: true,
    onOpenChange: jest.fn(),
    asset: ASSET,
    organizationId: 'org1',
    ...props,
  };
  const result = render(<QRCodeModal {...(base as any)} />);
  return { ...base, ...result };
}

describe('QRCodeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = 'light';
    mockQrData = { url: 'https://localhost:9000/assets/a1?tab=qr' };
    mockQrToDataURL.mockReset().mockResolvedValue('data:image/png;base64,FAKE');
    mockLoadQRCode.mockReset().mockResolvedValue({ toDataURL: mockQrToDataURL });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('closes through the dialog close handler', () => {
    const base = renderModal();
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(base.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the loading skeleton while the QR data is pending', () => {
    mockQrData = undefined;
    renderModal();
    expect(screen.getByText('QR Code')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
    const download = screen.getByText('Download');
    expect((download.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('generates a QR from the deep link and shows the asset details', async () => {
    renderModal();
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(
        expect.stringContaining('/assets/a1?tab=qr'),
        expect.objectContaining({ width: 280 }),
      ),
    );
    const img = document.querySelector('img[alt="QR Code for MacBook Pro 14"]') as HTMLImageElement;
    await waitFor(() => expect(img).not.toBeNull());
    expect(screen.getByText('MacBook Pro 14')).toBeInTheDocument();
    expect(screen.getByText('Apple · M3 Pro')).toBeInTheDocument();
    expect(screen.getByText('SN: SN-1234')).toBeInTheDocument();
    expect(screen.getByText('AST-99')).toBeInTheDocument();
    // Deep-link row is shown with the rewritten origin.
    expect(screen.getByText(`${window.location.origin}/assets/a1?tab=qr`)).toBeInTheDocument();
  });

  it('rewrites the deep-link origin to the current window origin', async () => {
    renderModal();
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(
        `${window.location.origin}/assets/a1?tab=qr`,
        expect.anything(),
      ),
    );
  });

  it('falls back to the raw URL when it cannot be parsed', async () => {
    mockQrData = { url: 'not a url' };
    renderModal();
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith('not a url', expect.anything()),
    );
  });

  it('uses the default accent color for an unknown category', async () => {
    renderModal({ asset: { ...ASSET, category: 'weird' } });
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(expect.any(String), expect.anything()),
    );
    const strip = document.querySelector('.h-2.w-full') as HTMLElement;
    expect(strip.style.background).toContain('#64748b');
  });

  it('falls back to the other category when the category is missing', async () => {
    renderModal({ asset: { ...ASSET, category: undefined } });
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(expect.any(String), expect.anything()),
    );
    const strip = document.querySelector('.h-2.w-full') as HTMLElement;
    expect(strip.style.background).toContain('#64748b');
  });

  it('uses the category accent color', async () => {
    renderModal();
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(expect.any(String), expect.anything()),
    );
    const strip = document.querySelector('.h-2.w-full') as HTMLElement;
    expect(strip.style.background).toContain('#2563eb');
  });

  it('applies the dark theme styling to the QR frame', async () => {
    mockTheme = 'dark';
    renderModal();
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(expect.any(String), expect.anything()),
    );
    const frame = document.querySelector('.rounded-xl.p-2\\.5') as HTMLElement;
    expect(frame.style.background).toContain('#1e293b');
  });

  it('omits brand/model and badges when absent', async () => {
    renderModal({
      asset: { _id: 'a2', name: 'Dell Monitor', category: 'monitor' },
    });
    await waitFor(() =>
      expect(mockQrToDataURL).toHaveBeenCalledWith(expect.any(String), expect.anything()),
    );
    expect(screen.queryByText(/·/)).toBeNull();
    expect(screen.queryByText(/SN:/)).toBeNull();
    expect(screen.queryByText(/AST-/)).toBeNull();
  });

  it('copies the deep link, toasts and resets the check mark', async () => {
    renderModal();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.click(screen.getByTitle('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/assets/a1'),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Link copied to clipboard');
    expect(screen.getByTestId('icon-Check')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('icon-Copy')).toBeInTheDocument();
  });

  it('downloads the QR as a PNG and toasts', async () => {
    renderModal();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    const clickSpy = jest.fn();
    const origCreateElement = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });
    try {
      fireEvent.click(screen.getByText('Download'));
      expect(clickSpy).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('QR code downloaded');
      const link = createSpy.mock.results.at(-1)?.value;
      expect(link.download).toBe('macbook_pro_14_qr.png');
    } finally {
      createSpy.mockRestore();
    }
  });

  it('prints the sticker in a new window with the generated HTML', async () => {
    const docWrite = jest.fn();
    const docClose = jest.fn();
    const openMock = jest.fn().mockReturnValue({ document: { write: docWrite, close: docClose } });
    Object.defineProperty(window, 'open', { value: openMock, configurable: true, writable: true });
    renderModal();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.click(screen.getByText('Print'));
    expect(openMock).toHaveBeenCalledWith('', '_blank', 'width=400,height=600');
    expect(docWrite).toHaveBeenCalledWith(expect.stringContaining('MacBook Pro 14'));
    // The printed HTML escapes HTML entities in the asset name.
    expect(docWrite).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,FAKE'));
    expect(docClose).toHaveBeenCalled();
  });

  it('falls back to window.print when popups are blocked', async () => {
    Object.defineProperty(window, 'open', {
      value: jest.fn().mockReturnValue(null),
      configurable: true,
      writable: true,
    });
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderModal();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.click(screen.getByText('Print'));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('escapes HTML in the printed sticker', async () => {
    const docWrite = jest.fn();
    const openMock = jest.fn().mockReturnValue({
      document: { write: docWrite, close: jest.fn() },
    });
    Object.defineProperty(window, 'open', { value: openMock, configurable: true, writable: true });
    renderModal({ asset: { ...ASSET, name: '<script>alert(1)</script>' } });
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.click(screen.getByText('Print'));
    expect(docWrite).toHaveBeenCalledWith(
      expect.stringContaining('&lt;script&gt;alert(1)&lt;/script&gt;'),
    );
  });

  it('prints a minimal sticker without brand, model, serial or tag', async () => {
    const docWrite = jest.fn();
    const openMock = jest.fn().mockReturnValue({
      document: { write: docWrite, close: jest.fn() },
    });
    Object.defineProperty(window, 'open', { value: openMock, configurable: true, writable: true });
    renderModal({ asset: { _id: 'a3', name: 'Generic', category: 'other' } });
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.click(screen.getByText('Print'));
    expect(docWrite).toHaveBeenCalled();
    expect(docWrite).not.toHaveBeenCalledWith(expect.stringContaining('class="badge"'));
  });

  it('ignores QR generation failures silently', async () => {
    mockQrToDataURL.mockRejectedValue(new Error('qr boom'));
    renderModal();
    // No crash, no QR image rendered.
    await waitFor(() => expect(mockQrToDataURL).toHaveBeenCalled());
    expect(document.querySelector('img')).toBeNull();
  });

  it('skips QR generation when the effect is cancelled before the library loads', async () => {
    let resolveLoad!: (v: unknown) => void;
    mockLoadQRCode.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
    const { unmount } = renderModal();
    unmount();
    await act(async () => {
      resolveLoad({ toDataURL: mockQrToDataURL });
    });
    expect(mockQrToDataURL).not.toHaveBeenCalled();
  });

  it('skips setting the QR image when cancelled after the library loads', async () => {
    let resolveDataUrl!: (v: unknown) => void;
    mockQrToDataURL.mockImplementation(() => new Promise((resolve) => (resolveDataUrl = resolve)));
    const { unmount } = renderModal();
    await waitFor(() => expect(mockQrToDataURL).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolveDataUrl('data:image/png;base64,LATE');
    });
    // No image should appear for the late-resolving QR.
    expect(document.querySelector('img')).toBeNull();
  });

  it('skips the query while closed and does not generate a QR', () => {
    mockQrData = { url: 'https://x.test/a' };
    renderModal({ open: false });
    expect(mockQrToDataURL).not.toHaveBeenCalled();
  });
});
