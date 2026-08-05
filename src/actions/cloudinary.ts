'use server';

import { logger } from '@/lib/logger';
import { validateUploadPayload, type UploadKind } from '@/lib/security';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─────────────────────────────────────────────────────────────────────────────
// Server-action guards
//
// Every export in this file is a `'use server'` function, i.e. a publicly
// reachable HTTP endpoint. Without these guards an unauthenticated caller could
// upload arbitrary files of arbitrary type into the project's Cloudinary
// account (and delete other users' avatars). Both checks are mandatory:
//   1. `requireUser()`      — the caller must have a valid session.
//   2. `assertUploadAllowed` — the payload must match the allowlist for its kind.
// ─────────────────────────────────────────────────────────────────────────────

interface UploadActor {
  userId: string;
  role: string;
  organizationId?: string;
}

/** Reject anonymous callers. Returns the authenticated actor. */
async function requireUser(): Promise<UploadActor> {
  // Imported lazily on purpose: `server-auth` pulls in `jose`, which ships as
  // ESM only. A static import would drag it into the module graph of every
  // component that merely imports an upload action, which Jest cannot parse.
  const { getServerUser } = await import('@/lib/server-auth');
  const user = await getServerUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  return {
    userId: user.userId,
    role: user.role ?? 'employee',
    organizationId: user.organizationId,
  };
}

/**
 * Decoded byte size of a base64 payload, tolerating a `data:` URL prefix and
 * accounting for `=` padding. The naive `length * 3 / 4` used previously
 * over-counted by the length of the prefix.
 */
function decodedByteSize(base64: string): number {
  const commaIndex = base64.startsWith('data:') ? base64.indexOf(',') : -1;
  const payload = commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/** Infer a MIME type from a `data:` URL prefix when the caller omitted one. */
function mimeFromDataUrl(base64: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/.exec(base64);
  return match?.[1];
}

/**
 * Enforce the allowlist for an upload kind. Throws with the validator's message
 * so the client surfaces an actionable error.
 */
function assertUploadAllowed(args: {
  base64: string;
  fileName: string;
  mimeType?: string;
  kind: UploadKind;
}): { sizeBytes: number; mimeType: string } {
  const sizeBytes = decodedByteSize(args.base64);
  const mimeType = args.mimeType ?? mimeFromDataUrl(args.base64);
  const result = validateUploadPayload({
    fileName: args.fileName,
    mimeType,
    sizeBytes,
    kind: args.kind,
  });
  if (!result.valid) {
    throw new Error(result.error ?? 'Upload rejected');
  }
  // `validateUploadPayload` guarantees a non-empty mimeType when valid.
  return { sizeBytes, mimeType: mimeType as string };
}

// Upload any file (PDF, image, doc, etc.) for task attachments
export async function uploadTaskAttachment(
  base64File: string,
  fileName: string,
  mimeType?: string,
): Promise<string> {
  await requireUser();
  assertUploadAllowed({ base64: base64File, fileName, mimeType, kind: 'attachment' });

  try {
    const publicId = `task_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`;

    const result = await cloudinary.uploader.upload(base64File, {
      folder: 'hr-office/task-attachments',
      public_id: publicId,
      resource_type: 'auto', // auto-detect: image, video, raw (pdf, doc, etc.)
      overwrite: false,
    });
    return result.secure_url;
  } catch (error) {
    logger.error('❌ Attachment upload error:', error);
    throw new Error(error instanceof Error ? error.message : 'Upload failed');
  }
}

export async function uploadAvatarToCloudinary(
  base64Image: string,
  userId: string,
): Promise<string> {
  const actor = await requireUser();
  // An avatar is keyed by `userId` and uploaded with `overwrite: true`, so
  // allowing an arbitrary id would let any user replace anyone's avatar.
  // Face registration reuses this action with a `face-<userId>` public id.
  const targetUserId = userId.startsWith('face-') ? userId.slice('face-'.length) : userId;
  const isPrivileged = actor.role === 'admin' || actor.role === 'superadmin';
  if (actor.userId !== targetUserId && !isPrivileged) {
    throw new Error('Not authorized to change this avatar');
  }
  assertUploadAllowed({
    base64: base64Image,
    // Avatars are sent as raw data URLs with no filename; derive one from the
    // declared MIME type so the extension check has something to validate.
    fileName: `avatar.${(mimeFromDataUrl(base64Image) ?? 'image/png').split('/')[1]}`,
    kind: 'avatar',
  });

  logger.log('☁️ Cloudinary signed upload starting...', { userId });

  try {
    logger.log('📤 Uploading to Cloudinary with SDK...');

    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'hr-office/avatars',
      public_id: userId,
      overwrite: true,
      transformation: [
        { width: 200, height: 200, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    logger.log('✅ Upload successful:', result.secure_url);

    return result.secure_url;
  } catch (error) {
    logger.error('❌ Upload error:', error);
    throw new Error(error instanceof Error ? error.message : 'Upload failed');
  }
}

export async function uploadChatAttachment(
  base64File: string,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; name: string; type: string }> {
  await requireUser();
  assertUploadAllowed({ base64: base64File, fileName, mimeType, kind: 'chat' });

  logger.log('🎤 Voice message upload starting...', {
    fileName,
    mimeType,
    base64Size: base64File.length,
  });

  // Validate environment variables
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    logger.error('❌ Missing Cloudinary credentials:', {
      cloudName: !!cloudName,
      apiKey: !!apiKey,
      apiSecret: !!apiSecret,
    });
    throw new Error('Cloudinary credentials not configured');
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const publicId = `chat_${Date.now()}_${safeFileName}`;

  // Determine resource type based on mime type
  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    resourceType = 'video'; // Cloudinary stores audio files as video resources
  }

  // Add data URL prefix if not present (required for proper upload)
  let uploadData = base64File;
  if (!base64File.startsWith('data:')) {
    uploadData = `data:${mimeType};base64,${base64File}`;
    logger.log('📝 Added data URL prefix');
  }

  logger.log('📤 Uploading to Cloudinary...', {
    publicId,
    resourceType,
    folder: 'hr-office/chat-attachments',
  });

  try {
    const result = await cloudinary.uploader.upload(uploadData, {
      folder: 'hr-office/chat-attachments',
      public_id: publicId,
      resource_type: resourceType,
      overwrite: false,
      unique_filename: true,
      // Image optimization
      ...(mimeType.startsWith('image/')
        ? {
            transformation: [
              { width: 1200, crop: 'limit' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          }
        : {}),
      // For audio files, add specific transformations
      ...(resourceType === 'video'
        ? {
            eager: [{ width: 0, height: 0, crop: 'scale', audio_codec: 'aac' }],
            eager_async: true,
          }
        : {}),
    });

    logger.log('✅ Voice message uploaded successfully:', result.secure_url);
    return { url: result.secure_url, name: fileName, type: mimeType };
  } catch (error) {
    logger.error('❌ Voice message upload failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    throw new Error(`Voice message upload error: ${errorMessage}`);
  }
}

export async function deleteAvatarFromCloudinary(userId: string): Promise<void> {
  const actor = await requireUser();
  const targetUserId = userId.startsWith('face-') ? userId.slice('face-'.length) : userId;
  const isPrivileged = actor.role === 'admin' || actor.role === 'superadmin';
  if (actor.userId !== targetUserId && !isPrivileged) {
    throw new Error('Not authorized to delete this avatar');
  }

  logger.log('🗑️ Cloudinary delete starting...', { userId });

  try {
    const publicId = `hr-office/avatars/${userId}`;
    logger.log('📤 Deleting from Cloudinary:', publicId);

    const result = (await cloudinary.uploader.destroy(publicId)) as {
      result?: string;
    };

    logger.log('✅ Delete result:', result);

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Delete failed: ${result.result}`);
    }
  } catch (error) {
    logger.error('❌ Delete error:', error);
    throw new Error(error instanceof Error ? error.message : 'Delete failed');
  }
}

export async function uploadDocument(
  base64File: string,
  fileName: string,
  mimeType?: string,
): Promise<{ url: string; name: string; size: number; type: string }> {
  await requireUser();
  const { sizeBytes, mimeType: resolvedMime } = assertUploadAllowed({
    base64: base64File,
    fileName,
    mimeType,
    kind: 'document',
  });

  logger.log('📄 Document upload starting...');

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const publicId = `doc_${Date.now()}_${safeFileName}`;

  // Pick the Cloudinary resource type from the MIME type. Documents (PDF, doc,
  // etc.) MUST be uploaded as `raw` — not `image`/`auto`. Cloudinary's `auto`
  // detection classifies a PDF as an `image` resource, and PDF delivery under
  // the `image` type is blocked by default (→ "failed to load PDF document"),
  // plus the image pipeline appends a second `.pdf` extension. `raw` serves the
  // file verbatim via /raw/upload/ with no restriction and no double extension.
  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'raw';
  if (resolvedMime.startsWith('image/')) resourceType = 'image';
  else if (resolvedMime.startsWith('video/')) resourceType = 'video';
  else if (resolvedMime.startsWith('audio/')) resourceType = 'video';

  let uploadData = base64File;
  if (!base64File.startsWith('data:')) {
    uploadData = `data:${resolvedMime};base64,${base64File}`;
  }

  try {
    const result = await cloudinary.uploader.upload(uploadData, {
      folder: 'hr-office/documents',
      public_id: publicId,
      resource_type: resourceType,
      overwrite: false,
      unique_filename: true,
    });

    logger.log('✅ Document uploaded:', result.secure_url);
    return {
      url: result.secure_url,
      name: fileName,
      size: sizeBytes,
      type: resolvedMime,
    };
  } catch (error) {
    logger.error('❌ Document upload failed:', error);
    throw new Error(error instanceof Error ? error.message : 'Upload failed');
  }
}

export async function deleteTaskAttachmentFromCloudinary(url: string): Promise<void> {
  await requireUser();

  logger.log('🗑️ Cloudinary task attachment delete starting...', { url });

  try {
    // Extract public_id from URL
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v1234567890/hr-office/task-attachments/task_1234567890_filename.pdf
    const urlParts = url.split('/');
    const folderIndex = urlParts.findIndex((part) => part === 'task-attachments');
    if (folderIndex === -1) {
      throw new Error('Invalid task attachment URL');
    }

    // Get the public_id (folder/filename without extension and version)
    const folder = urlParts[folderIndex];
    const filenameWithVersion = urlParts[folderIndex + 1];
    if (!filenameWithVersion) {
      throw new Error('Invalid task attachment URL: missing filename');
    }
    const filename = filenameWithVersion.replace(/^v\d+_/, '').split('.')[0];
    const publicId = `hr-office/${folder}/${filename}`;

    logger.log('📤 Deleting from Cloudinary:', publicId);

    const result = (await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw', // task attachments can be any file type
    })) as { result?: string };

    logger.log('✅ Delete result:', result);

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Delete failed: ${result.result}`);
    }
  } catch (error) {
    logger.error('❌ Delete error:', error);
    throw new Error(error instanceof Error ? error.message : 'Delete failed');
  }
}
