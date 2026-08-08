/**
 * Tests for AvatarUpload — avatar picker with Cloudinary upload, file
 * validation (type/size), base64 preview, Convex persistence, session cookie
 * refresh and auth-store update.
 *
 * Mocks: react-i18next, convex/react (useMutation), generated api/dataModel,
 * cloudinary + auth server actions, auth store, sonner, logger, cssMotion,
 * ShieldLoader, lucide, next/image. FileReader is stubbed to resolve a data URL
 * synchronously so the upload pipeline runs deterministically.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

const mockUpdateAvatar = jest.fn();
jest.mock('convex/react', () => ({
  useMutation: () => mockUpdateAvatar,
}));

jest.mock('@/convex/_generated/api', () => ({
  api: { users: { mutations: { updateAvatar: { _name: 'updateAvatar' } } } },
}));

const mockUploadAvatarToCloudinary = jest.fn();
jest.mock('@/actions/cloudinary', () => ({
  uploadAvatarToCloudinary: (...args: any[]) => mockUploadAvatarToCloudinary(...args),
}));

const mockUpdateSessionAvatarAction = jest.fn();
jest.mock('@/actions/auth', () => ({
  updateSessionAvatarAction: (...args: any[]) => mockUpdateSessionAvatarAction(...args),
}));

let mockUser: any = { id: 'user-1', name: 'Anna Petrova', avatar: null };
const mockSetUser = jest.fn();
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser, setUser: mockSetUser }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    time: () => jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/cssMotion', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('lucide-react', () => ({
  Camera: (props: any) => <span data-testid="icon-Camera" {...props} />,
  User: (props: any) => <span data-testid="icon-User" {...props} />,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

import { AvatarUpload } from '@/components/ui/avatar-upload';
import { toast } from 'sonner';
import { logger as log } from '@/lib/logger';
import { uploadAvatarToCloudinary } from '@/actions/cloudinary';
import { updateSessionAvatarAction } from '@/actions/auth';

const AVATAR_URL = 'https://cdn.test/avatar.png';
const DATA_URL = 'data:image/png;base64,QUJD';

const OriginalFileReader = (globalThis as any).FileReader;

class MockFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_file: File) {
    this.result = DATA_URL;
    if (this.onload) this.onload();
  }
}

const makeFile = (name: string, type: string, size = 1024): File =>
  new File([new ArrayBuffer(size)], name, { type });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('AvatarUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateAvatar.mockResolvedValue(undefined);
    mockUploadAvatarToCloudinary.mockResolvedValue(AVATAR_URL);
    mockUpdateSessionAvatarAction.mockResolvedValue(undefined);
    mockUser = { id: 'user-1', name: 'Anna Petrova', avatar: null };
    (globalThis as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    (globalThis as any).FileReader = OriginalFileReader;
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  it('renders the initials when there is no avatar', () => {
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('renders the fallback icon when the name has no initials', () => {
    render(<AvatarUpload userId="user-1" name="" />);
    expect(screen.getByTestId('icon-User')).toBeInTheDocument();
  });

  it('renders the current avatar image', () => {
    render(<AvatarUpload userId="user-1" name="Anna Petrova" currentUrl={AVATAR_URL} />);
    expect(screen.getByAltText('Anna Petrova')).toHaveAttribute('src', AVATAR_URL);
  });

  it('hides the upload button in readonly mode', () => {
    render(<AvatarUpload userId="user-1" name="Anna Petrova" readonly />);
    expect(screen.queryByTitle('ariaLabels.changeAvatar')).not.toBeInTheDocument();
    expect(fileInput()).toBeNull();
  });

  it('applies the requested size class', () => {
    const { container } = render(<AvatarUpload userId="user-1" name="Anna Petrova" size="sm" />);
    expect(container.querySelector('.w-10.h-10')).toBeInTheDocument();
  });

  // ── Validation ─────────────────────────────────────────────────────────

  it('rejects non-image files', async () => {
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('doc.txt', 'text/plain')] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.pleaseSelectImage'));
    expect(mockUploadAvatarToCloudinary).not.toHaveBeenCalled();
  });

  it('rejects files larger than 5 MB', async () => {
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), {
      target: { files: [makeFile('big.png', 'image/png', 6 * 1024 * 1024)] },
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.imageTooLarge'));
    expect(mockUploadAvatarToCloudinary).not.toHaveBeenCalled();
  });

  // ── Upload pipeline ────────────────────────────────────────────────────

  it('uploads a valid image end-to-end', async () => {
    const onSuccess = jest.fn();
    render(<AvatarUpload userId="user-1" name="Anna Petrova" onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTitle('ariaLabels.changeAvatar'));
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() =>
      expect(mockUploadAvatarToCloudinary).toHaveBeenCalledWith(DATA_URL, 'user-1'),
    );
    expect(mockUpdateAvatar).toHaveBeenCalledWith({ userId: 'user-1', avatarUrl: AVATAR_URL });
    expect(mockUpdateSessionAvatarAction).toHaveBeenCalledWith('user-1', AVATAR_URL);
    expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ avatar: AVATAR_URL }));
    expect(onSuccess).toHaveBeenCalledWith(AVATAR_URL);
    expect(toast.success).toHaveBeenCalledWith('toasts.avatarUpdated');
  });

  it('continues successfully when the session cookie refresh fails', async () => {
    mockUpdateSessionAvatarAction.mockRejectedValue(new Error('cookie expired'));
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('toasts.avatarUpdated'));
    expect(log.warn).toHaveBeenCalled();
    expect(mockUpdateAvatar).toHaveBeenCalled();
  });

  it('does not update the store for a different user', async () => {
    mockUser = { id: 'someone-else', name: 'Other', avatar: null };
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('toasts.avatarUpdated'));
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  // ── Error paths ────────────────────────────────────────────────────────

  it('shows the upload error message on failure', async () => {
    mockUploadAvatarToCloudinary.mockRejectedValue(new Error('cloud down'));
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('cloud down'));
    expect(log.error).toHaveBeenCalled();
  });

  it('falls back to the generic message for non-Error failures', async () => {
    mockUploadAvatarToCloudinary.mockRejectedValue('boom');
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.uploadFailed'));
    expect(log.error).toHaveBeenCalled();
  });

  it('shows the uploading overlay while the upload is in flight', async () => {
    mockUploadAvatarToCloudinary.mockImplementation(() => new Promise(() => {}));
    render(<AvatarUpload userId="user-1" name="Anna Petrova" />);
    fireEvent.change(fileInput(), { target: { files: [makeFile('photo.png', 'image/png')] } });

    await waitFor(() => expect(screen.getByTestId('shield-loader')).toBeInTheDocument());
    expect((screen.getByTitle('ariaLabels.changeAvatar') as HTMLButtonElement).disabled).toBe(true);
  });
});
