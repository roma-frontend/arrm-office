/**
 * CV upload for the public careers form.
 *
 * This endpoint is deliberately unauthenticated: the person attaching a CV is
 * applying for a job and has no account yet. That makes it the one upload path in
 * the product without a session behind it, so the defences are here instead:
 *
 *   - rate limited per IP, because an open upload is otherwise free storage;
 *   - PDF only, checked against the file's own first bytes rather than the
 *     Content-Type the browser volunteered;
 *   - 10 MB ceiling, matching the document limit used elsewhere;
 *   - stored as a Cloudinary `raw` resource, which is how the rest of the
 *     product's PDFs are stored (the `image` pipeline blocks PDF delivery).
 *
 * The URL this returns is passed to `careers:applyToVacancy`, which re-checks the
 * host, type and size — the mutation is public too and cannot trust its caller.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

import { applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const MAX_CV_BYTES = 10 * 1024 * 1024;

/** Five CVs per hour from one address is generous for a real applicant. */
const CV_UPLOAD_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 60 * 60 * 1000,
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, CV_UPLOAD_RATE_LIMIT, 'careers-cv-upload');
  if (limited) return limited;

  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file received' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
    }
    if (file.size > MAX_CV_BYTES) {
      return NextResponse.json({ error: 'The CV must be under 10 MB' }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // A PDF starts with "%PDF-". Trusting the declared MIME type would let any
    // payload through under a PDF label.
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: 'The CV must be a PDF' }, { status: 415 });
    }

    const safeName = (file.name || 'cv.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const upload = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${bytes.toString('base64')}`,
      {
        folder: 'hr-office/cv',
        public_id: `cv_${Date.now()}_${safeName}`,
        resource_type: 'raw',
        overwrite: false,
        unique_filename: true,
      },
    );

    return NextResponse.json({
      url: upload.secure_url,
      name: file.name || safeName,
      size: file.size,
      type: 'application/pdf',
    });
  } catch (error: unknown) {
    logger.error('CV upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
