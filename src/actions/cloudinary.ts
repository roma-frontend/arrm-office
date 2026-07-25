'use server';

import { logger } from '@/lib/logger';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload any file (PDF, image, doc, etc.) for task attachments
export async function uploadTaskAttachment(base64File: string, fileName: string): Promise<string> {
  try {
    const publicId = `task_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`;

    // Validate file size (1MB limit for free tier)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    const decodedSize = Math.round((base64File.length * 3) / 4);
    if (decodedSize > MAX_FILE_SIZE) {
      const sizeMB = (decodedSize / (1024 * 1024)).toFixed(2);
      throw new Error(
        `File size (${sizeMB}MB) exceeds the 1MB limit. Please upload a smaller file.`,
      );
    }
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
  logger.log('☁️ Cloudinary signed upload starting...');
  logger.log('👤 User ID:', userId);

  try {
    logger.log('📤 Uploading to Cloudinary with SDK...');

    // Validate file size (1MB limit for free tier)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    const decodedSize = Math.round((base64Image.length * 3) / 4);
    if (decodedSize > MAX_FILE_SIZE) {
      const sizeMB = (decodedSize / (1024 * 1024)).toFixed(2);
      throw new Error(
        `Avatar size (${sizeMB}MB) exceeds the 1MB limit. Please upload a smaller image.`,
      );
    }

    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'hr-office/avatars',
      public_id: userId,
      overwrite: true,
      transformation: [
        { width: 200, height: 200, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    logger.log('✅ Upload successful!');
    logger.log('🔗 URL:', result.secure_url);

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
  logger.log('🎤 Voice message upload starting...');
  logger.log('📄 File name:', fileName);
  logger.log('📄 MIME type:', mimeType);
  logger.log('📄 Base64 size:', base64File.length);

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

  // Validate file size (1MB limit for free tier)
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
  const decodedSize = Math.round((base64File.length * 3) / 4);
  if (decodedSize > MAX_FILE_SIZE) {
    const sizeMB = (decodedSize / (1024 * 1024)).toFixed(2);
    throw new Error(`File size (${sizeMB}MB) exceeds the 1MB limit. Please upload a smaller file.`);
  }

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
  } catch (error: any) {
    logger.error('❌ Voice message upload failed:', error);
    logger.error('❌ Error details:', {
      message: error?.message,
      error: error?.error,
      status: error?.status,
      http_code: error?.http_code,
    });
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    throw new Error(`Voice message upload error: ${errorMessage}`);
  }
}

export async function deleteAvatarFromCloudinary(userId: string): Promise<void> {
  logger.log('🗑️ Cloudinary delete starting...');
  logger.log('👤 User ID:', userId);

  try {
    const publicId = `hr-office/avatars/${userId}`;
    logger.log('📤 Deleting from Cloudinary:', publicId);

    const result = await cloudinary.uploader.destroy(publicId);

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
  logger.log('📄 Document upload starting...');

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const publicId = `doc_${Date.now()}_${safeFileName}`;

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for documents
  const decodedSize = Math.round((base64File.length * 3) / 4);
  if (decodedSize > MAX_FILE_SIZE) {
    const sizeMB = (decodedSize / (1024 * 1024)).toFixed(2);
    throw new Error(`File size (${sizeMB}MB) exceeds the 10MB limit.`);
  }

  // Pick the Cloudinary resource type from the MIME type. Documents (PDF, doc,
  // etc.) MUST be uploaded as `raw` — not `image`/`auto`. Cloudinary's `auto`
  // detection classifies a PDF as an `image` resource, and PDF delivery under
  // the `image` type is blocked by default (→ "failed to load PDF document"),
  // plus the image pipeline appends a second `.pdf` extension. `raw` serves the
  // file verbatim via /raw/upload/ with no restriction and no double extension.
  let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'raw';
  if (mimeType) {
    if (mimeType.startsWith('image/')) resourceType = 'image';
    else if (mimeType.startsWith('video/')) resourceType = 'video';
    else if (mimeType.startsWith('audio/')) resourceType = 'video';
  }

  let uploadData = base64File;
  if (mimeType && !base64File.startsWith('data:')) {
    uploadData = `data:${mimeType};base64,${base64File}`;
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
      size: decodedSize,
      type: mimeType || result.resource_type,
    };
  } catch (error: any) {
    logger.error('❌ Document upload failed:', error);
    throw new Error(error instanceof Error ? error.message : 'Upload failed');
  }
}

export async function deleteTaskAttachmentFromCloudinary(url: string): Promise<void> {
  logger.log('🗑️ Cloudinary task attachment delete starting...');
  logger.log('🔗 URL:', url);

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

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw', // task attachments can be any file type
    });

    logger.log('✅ Delete result:', result);

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Delete failed: ${result.result}`);
    }
  } catch (error) {
    logger.error('❌ Delete error:', error);
    throw new Error(error instanceof Error ? error.message : 'Delete failed');
  }
}
