/**
 * Cloudinary credentials, resolved once for every server-side caller.
 *
 * The SDK keeps a single config object per process, and `cloudinary.config()`
 * merges whatever it is handed — including `undefined` values, which overwrite
 * credentials that were already resolved. Two modules configuring the SDK with
 * differently-named variables therefore fought each other: whichever ran last
 * blanked the other's cloud name and keys, and uploads failed with a missing
 * credentials error even though the account was configured correctly.
 *
 * So configuration happens here, exactly once, from one set of names:
 *
 *   - `CLOUDINARY_URL` (`cloudinary://key:secret@cloud`) is the SDK's own
 *     convention and carries all three values, so it is preferred when present.
 *   - Otherwise the discrete variables are read. The key and cloud name are
 *     `NEXT_PUBLIC_`-prefixed because the unsigned browser widget needs them;
 *     the secret never is, and must stay server-only.
 *
 * Callers get `assertCloudinaryConfigured()` instead of reading `process.env`
 * themselves, so a misconfigured deployment fails with one clear message rather
 * than a signature error from the API.
 */

import { v2 as cloudinary } from 'cloudinary';
import { logger } from '@/lib/logger';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Parses `cloudinary://key:secret@cloud-name`, the SDK's own env format. */
function fromUrl(url: string | undefined): Partial<CloudinaryCredentials> {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'cloudinary:') return {};
    return {
      cloudName: parsed.hostname || undefined,
      apiKey: decodeURIComponent(parsed.username) || undefined,
      apiSecret: decodeURIComponent(parsed.password) || undefined,
    };
  } catch {
    // A malformed URL is reported by the caller as missing credentials, which
    // is the same actionable outcome and keeps this parser side-effect free.
    return {};
  }
}

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out ? out : undefined;
}

function resolve(): Partial<CloudinaryCredentials> {
  const url = fromUrl(trimmed(process.env.CLOUDINARY_URL));
  return {
    cloudName:
      url.cloudName ??
      trimmed(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) ??
      trimmed(process.env.CLOUDINARY_CLOUD_NAME),
    apiKey:
      url.apiKey ??
      trimmed(process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY) ??
      trimmed(process.env.CLOUDINARY_API_KEY),
    apiSecret: url.apiSecret ?? trimmed(process.env.CLOUDINARY_API_SECRET),
  };
}

/**
 * Configures the SDK and returns the credentials.
 *
 * Throws when any of the three is missing — an upload attempted without them
 * fails at the API with an opaque signature error, so refusing early with the
 * names of the absent variables is the more useful failure.
 */
export function assertCloudinaryConfigured(): CloudinaryCredentials {
  const { cloudName, apiKey, apiSecret } = resolve();

  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName && 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
      !apiKey && 'NEXT_PUBLIC_CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean);
    logger.error('❌ Missing Cloudinary credentials:', { missing });
    throw new Error(
      `Cloudinary credentials not configured (missing ${missing.join(', ')} — or set CLOUDINARY_URL)`,
    );
  }

  // Re-applied per call rather than once at import: the values are complete
  // here, so this both survives another module's clobbering config() and keeps
  // the check and the configuration from ever disagreeing.
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  return { cloudName, apiKey, apiSecret };
}
