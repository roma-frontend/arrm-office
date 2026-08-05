/**
 * Tests for the Cloudinary upload server actions (src/actions/cloudinary.ts).
 *
 * These are 'use server' endpoints, so the two mandatory guards are tested:
 * `requireUser()` (session) and `assertUploadAllowed()` (MIME + extension +
 * size allowlist from src/lib/security.ts). The Cloudinary SDK and the
 * server-auth helper are mocked; the upload validation runs for real.
 */
import {
  uploadTaskAttachment,
  uploadAvatarToCloudinary,
  uploadChatAttachment,
  deleteAvatarFromCloudinary,
  uploadDocument,
  deleteTaskAttachmentFromCloudinary,
} from '@/actions/cloudinary';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn(), destroy: jest.fn() },
  },
}));

jest.mock('@/lib/server-auth', () => ({
  getServerUser: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const { uploader } = jest.requireMock('cloudinary').v2;
const { getServerUser } = jest.requireMock('@/lib/server-auth');

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgo=';
const BIG_PAYLOAD = 'A'.repeat(2 * 1024 * 1024); // > 1MB decoded

beforeEach(() => {
  jest.clearAllMocks();
  getServerUser.mockResolvedValue({ userId: 'u1', role: 'employee', organizationId: 'org_1' });
});

describe('uploadTaskAttachment', () => {
  it('rejects anonymous callers', async () => {
    getServerUser.mockResolvedValue(null);
    await expect(uploadTaskAttachment(TINY_PNG, 'scan.png', 'image/png')).rejects.toThrow(
      'Not authenticated',
    );
  });

  it('rejects a disallowed file type', async () => {
    await expect(
      uploadTaskAttachment(
        'data:application/x-msdownload;base64,MZ',
        'app.exe',
        'application/x-msdownload',
      ),
    ).rejects.toThrow('is not allowed');
  });

  it('uploads a valid attachment', async () => {
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/task.png' });
    const url = await uploadTaskAttachment(TINY_PNG, 'scan.png', 'image/png');
    expect(url).toBe('https://res.cloudinary.com/x/task.png');
    expect(uploader.upload).toHaveBeenCalledWith(
      TINY_PNG,
      expect.objectContaining({ folder: 'hr-office/task-attachments', resource_type: 'auto' }),
    );
  });
});

describe('uploadAvatarToCloudinary', () => {
  it('blocks a plain employee from changing someone else’s avatar', async () => {
    await expect(uploadAvatarToCloudinary(TINY_PNG, 'u2')).rejects.toThrow(
      'Not authorized to change this avatar',
    );
  });

  it('allows admins to upload for another user', async () => {
    getServerUser.mockResolvedValue({ userId: 'u1', role: 'admin', organizationId: 'org_1' });
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/a.png' });
    const url = await uploadAvatarToCloudinary(TINY_PNG, 'u2');
    expect(url).toBe('https://res.cloudinary.com/x/a.png');
  });

  it('uploads the caller’s own avatar with overwrite enabled', async () => {
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/a.png' });
    await uploadAvatarToCloudinary(TINY_PNG, 'u1');
    expect(uploader.upload).toHaveBeenCalledWith(
      TINY_PNG,
      expect.objectContaining({ public_id: 'u1', overwrite: true, folder: 'hr-office/avatars' }),
    );
  });

  it('strips the face- prefix for the ownership check', async () => {
    // face-u1 maps to u1 — the caller's own id, so it must be allowed.
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/f.png' });
    await uploadAvatarToCloudinary(TINY_PNG, 'face-u1');
    expect(uploader.upload).toHaveBeenCalledWith(
      TINY_PNG,
      expect.objectContaining({ public_id: 'face-u1' }),
    );
  });

  it('rejects an oversized payload', async () => {
    await expect(
      uploadAvatarToCloudinary(`data:image/png;base64,${BIG_PAYLOAD}`, 'u1'),
    ).rejects.toThrow('exceeds the 1MB limit');
  });
});

describe('uploadChatAttachment', () => {
  it('throws when Cloudinary credentials are missing', async () => {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    await expect(uploadChatAttachment(TINY_PNG, 'voice.webm', 'audio/webm')).rejects.toThrow(
      'Cloudinary credentials not configured',
    );
  });

  it('uploads audio as a video resource and prefixes the data URL', async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/v.webm' });

    const result = await uploadChatAttachment('dGluZQ==', 'voice.webm', 'audio/webm');
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/x/v.webm',
      name: 'voice.webm',
      type: 'audio/webm',
    });
    expect(uploader.upload).toHaveBeenCalledWith(
      'data:audio/webm;base64,dGluZQ==',
      expect.objectContaining({ resource_type: 'video', folder: 'hr-office/chat-attachments' }),
    );
  });

  it('uploads images with an optimization transformation', async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/i.png' });

    await uploadChatAttachment(TINY_PNG, 'photo.png', 'image/png');
    expect(uploader.upload).toHaveBeenCalledWith(
      TINY_PNG,
      expect.objectContaining({ resource_type: 'auto', transformation: expect.any(Array) }),
    );
  });
});

describe('deleteAvatarFromCloudinary', () => {
  it('blocks non-owners', async () => {
    await expect(deleteAvatarFromCloudinary('u2')).rejects.toThrow(
      'Not authorized to delete this avatar',
    );
  });

  it('destroys the avatar resource', async () => {
    uploader.destroy.mockResolvedValue({ result: 'ok' });
    await expect(deleteAvatarFromCloudinary('u1')).resolves.toBeUndefined();
    expect(uploader.destroy).toHaveBeenCalledWith('hr-office/avatars/u1');
  });

  it('treats "not found" as success', async () => {
    uploader.destroy.mockResolvedValue({ result: 'not found' });
    await expect(deleteAvatarFromCloudinary('u1')).resolves.toBeUndefined();
  });

  it('throws when the delete fails', async () => {
    uploader.destroy.mockResolvedValue({ result: 'error' });
    await expect(deleteAvatarFromCloudinary('u1')).rejects.toThrow('Delete failed');
  });
});

describe('uploadDocument', () => {
  it('uploads a PDF as a raw resource and returns its size', async () => {
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/d.pdf' });
    const result = await uploadDocument('JVBERi0x', 'contract.pdf', 'application/pdf');
    expect(result.type).toBe('application/pdf');
    expect(result.name).toBe('contract.pdf');
    expect(typeof result.size).toBe('number');
    expect(uploader.upload).toHaveBeenCalledWith(
      'data:application/pdf;base64,JVBERi0x',
      expect.objectContaining({ resource_type: 'raw', folder: 'hr-office/documents' }),
    );
  });

  it('uploads images as image resources', async () => {
    uploader.upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/i.png' });
    await uploadDocument(TINY_PNG, 'passport.png', 'image/png');
    expect(uploader.upload).toHaveBeenCalledWith(
      TINY_PNG,
      expect.objectContaining({ resource_type: 'image' }),
    );
  });
});

describe('deleteTaskAttachmentFromCloudinary', () => {
  const URL =
    'https://res.cloudinary.com/demo/image/upload/v123/hr-office/task-attachments/task_12345_report.pdf';

  it('deletes the extracted public id as a raw resource', async () => {
    uploader.destroy.mockResolvedValue({ result: 'ok' });
    await expect(deleteTaskAttachmentFromCloudinary(URL)).resolves.toBeUndefined();
    expect(uploader.destroy).toHaveBeenCalledWith('hr-office/task-attachments/task_12345_report', {
      resource_type: 'raw',
    });
  });

  it('rejects URLs without the task-attachments folder', async () => {
    await expect(
      deleteTaskAttachmentFromCloudinary(
        'https://res.cloudinary.com/demo/image/upload/avatars/x.png',
      ),
    ).rejects.toThrow('Invalid task attachment URL');
  });

  it('rejects URLs missing a filename', async () => {
    await expect(
      deleteTaskAttachmentFromCloudinary(
        'https://res.cloudinary.com/demo/image/upload/hr-office/task-attachments/',
      ),
    ).rejects.toThrow('Invalid task attachment URL');
  });
});
