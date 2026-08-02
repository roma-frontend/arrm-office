/**
 * Client-side passport MRZ (Machine Readable Zone) extraction + parsing.
 *
 * OCR (tesseract.js) and the MRZ parser (mrz) are both heavy / client-only and are
 * loaded via dynamic import so they stay out of the main bundle. All processing runs
 * in the browser — passport PII is never sent to a third-party service.
 */

export interface PassportMrzResult {
  passportNumber?: string;
  passportExpiryDate?: string; // ISO yyyy-mm-dd
  nationality?: string;
  dateOfBirth?: string; // ISO yyyy-mm-dd
  firstName?: string;
  lastName?: string;
  valid: boolean;
  errors: string[];
}

/** Convert an MRZ `YYMMDD` date into an ISO `yyyy-mm-dd` string. */
function mrzDateToIso(yymmdd: string | null | undefined, isExpiry: boolean): string | undefined {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Expiry dates are in the future window; birth dates in the past.
  const century = isExpiry ? 2000 : yy > 30 ? 1900 : 2000;
  const year = century + yy;
  return `${year}-${mm}-${dd}`;
}

/** Characters tesseract's LSTM model commonly confuses with the MRZ filler '<'. */
const MRZ_FILLER_CONFUSIONS = /[KLIOS01]/;

/**
 * Rebuild a TD3 line 1 (44 chars) from noisy OCR text.
 *
 * Line 1 is `P<CCC<<SURNAME<<GIVEN<<<...<` — the only OCR noise that matters
 * for parsing is length drift (tesseract inserts or drops filler chars and
 * reads '<' as K/L/I/S/O/0). We trim trailing filler-ish chars back down to
 * 44 and pad short lines with '<'.
 */
function repairTd3Line1(raw: string): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9<]/g, '');
  while (s.length > 44 && MRZ_FILLER_CONFUSIONS.test(s[s.length - 1] ?? '')) {
    s = s.slice(0, -1);
  }
  return s.slice(0, 44).padEnd(44, '<');
}

/**
 * Rebuild a TD3 line 2 (44 chars) from noisy OCR text.
 *
 * Line 2 is fixed-layout: positions 0..27 are the document number, nationality,
 * DOB (+check), sex, expiry (+check); positions 28..41 are the 14-char personal
 * number (padded with '<'); the final two chars are check digits. We keep the
 * first 28 chars verbatim, normalise the personal-number zone (filler
 * confusions back to '<', pad to 14) and preserve the trailing check digits.
 * Returns null if the input is too short to be a TD3 line 2.
 */
function repairTd3Line2(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9<]/g, '');
  if (s.length < 28) return null;
  const head = s.slice(0, 28);
  const tail = s.slice(28);
  const m = tail.match(/^(.*?)(\d{2})$/);
  const personal = (m?.[1] ?? tail).replace(/[KLIOS0]/g, '<').padEnd(14, '<');
  const checks = (m?.[2] ?? '').replace(/[KLIOS0]/g, '1');
  const rebuilt = head + personal + checks;
  return rebuilt.length === 44 ? rebuilt : null;
}

/**
 * Parse already-extracted MRZ text lines into passport fields.
 *
 * OCR sometimes picks up a stray line above/below the real block, so when more
 * than 2 lines are supplied we try the full set first and then fall back to the
 * last two lines (TD3 passports have exactly 2 MRZ lines). A throw is never
 * surfaced to callers — it degrades to an invalid result instead.
 */
export async function parseMrzLines(lines: string[]): Promise<PassportMrzResult> {
  const { parse } = await import('mrz');
  const cleaned = lines.map((l) => l.trim().toUpperCase()).filter(Boolean);
  const candidateSets = cleaned.length >= 3 ? [cleaned, cleaned.slice(-2)] : [cleaned];

  // OCR (tesseract LSTM) often drifts the fixed MRZ line length — it inserts or
  // drops the '<' fillers (reading them as K/L/I/S/O/0), which makes the mrz
  // parser throw on the line width. When the raw sets fail, rebuild the last
  // two lines to the exact TD3 layout and try that as a final candidate set.
  // Only trigger for TD3-ish lines (44 chars ± OCR drift) so TD1/TD2 input is
  // never padded into a nonsense 44-char set.
  const lastTwo = cleaned.slice(-2);
  if (lastTwo.length === 2 && (lastTwo[0] ?? '').length >= 40) {
    const repaired1 = repairTd3Line1(lastTwo[0] ?? '');
    const repaired2 = repairTd3Line2(lastTwo[1] ?? '');
    if (repaired1 && repaired2) candidateSets.push([repaired1, repaired2]);
  }

  // Prefer the first VALID result. If a set parses but is invalid (e.g. OCR
  // picked up a stray line and the parser interpreted it as a broken TD1), keep
  // it as the fallback result and still try the remaining candidate sets — the
  // last two lines might parse cleanly as a TD3. Errors are only surfaced when
  // no set parses validly.
  let fallbackResult: PassportMrzResult | null = null;

  for (const set of candidateSets) {
    try {
      const result = parse(set, { autocorrect: true });
      const f = result.fields;
      const errors = result.details
        .filter((d) => !d.valid && d.error)
        .map((d) => `${d.label}: ${d.error}`);

      const mapped: PassportMrzResult = {
        passportNumber: f.documentNumber ?? undefined,
        passportExpiryDate: mrzDateToIso(f.expirationDate, true),
        nationality: f.nationality ?? undefined,
        dateOfBirth: mrzDateToIso(f.birthDate, false),
        firstName: f.firstName ?? undefined,
        lastName: f.lastName ?? undefined,
        valid: result.valid,
        errors,
      };

      if (result.valid) return mapped;
      fallbackResult ??= mapped;
    } catch {
      // This line-set is unparsable — try the next candidate set.
    }
  }

  return fallbackResult ?? { valid: false, errors: ['Unable to parse MRZ lines'] };
}

/**
 * Heuristically extract MRZ lines from raw OCR text: the MRZ uses `<` fillers and
 * fixed-length lines (TD3 = 44 chars, TD1/TD2 = 30/36). OCR noise is normalised —
 * pipes (a classic confusion for `<` / tall letters) become `I`, everything else
 * outside the MRZ charset is dropped. Pick the trailing lines that look like MRZ.
 */
function extractMrzLines(rawText: string): string[] {
  const candidates = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').toUpperCase())
    .map((l) => l.replace(/\|/g, 'I').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 28 && /^[A-Z0-9<]+$/.test(l) && l.includes('<'));
  // TD3 has 2 lines, TD1 has 3. Return the last 2–3 candidates.
  return candidates.slice(-3);
}

/**
 * Fallback if an image never fires `load`/`error` (jsdom with the native `canvas`
 * binding, odd data URLs, etc.). Keep it under jest's default 5s test timeout so
 * a stuck image degrades to the original data URL instead of hanging the scan.
 */
const IMAGE_LOAD_TIMEOUT_MS = 4_000;

/** Load an image from a data URL, resolving with the decoded element. */
function loadImage(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(
      () => reject(new Error('Image load timed out')),
      IMAGE_LOAD_TIMEOUT_MS,
    );
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load image'));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Best-effort image preprocessing that makes the small MRZ text much easier to
 * OCR: 2x upscale + grayscale + slight contrast stretch. Runs on a canvas; if the
 * canvas API is unavailable (SSR / jsdom tests) the original image is returned.
 */
async function prepareImageForOcr(imageDataUrl: string): Promise<string> {
  try {
    if (typeof document === 'undefined') return imageDataUrl;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageDataUrl; // jsdom has no canvas implementation.

    const img = await loadImage(imageDataUrl);
    if (!img.naturalWidth || !img.naturalHeight) return imageDataUrl;
    // Uniform scale that preserves the aspect ratio (independent width/height caps
    // would distort the MRZ on large scans and hurt OCR). Upscale 2x, but never
    // exceed 4096px on the longest side.
    const MAX_DIM = 4096;
    const scale = Math.min(2, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    if (canvas.width === 0 || canvas.height === 0) return imageDataUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Luma grayscale + mild contrast stretch.
      // (?? 0 — noUncheckedIndexedAccess is on, typed access may be undefined)
      const lum = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
      const v = Math.max(0, Math.min(255, (lum - 128) * 1.2 + 128));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Preprocessing is best-effort — never fail the scan because of it.
    return imageDataUrl;
  }
}

/** MRZ character set — constraining Tesseract to it massively cuts misreads. */
const MRZ_CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/**
 * Run OCR on a passport image (data URL / base64) and parse the MRZ.
 * Returns null if no MRZ-like lines could be found.
 */
export async function scanPassportImage(imageDataUrl: string): Promise<PassportMrzResult | null> {
  const Tesseract = await import('tesseract.js');

  // OCR downloads the worker + traineddata from CDN on first use, which can be
  // slow or blocked by the network. Cap it so the UI never hangs on scanning.
  const OCR_TIMEOUT_MS = 45_000;
  const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('OCR timed out')), OCR_TIMEOUT_MS);
    });
    // Clear the timer when the race settles so tests don't hang on open handles.
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };

  // Preprocessing (upscale + grayscale) boosts accuracy on small MRZ text.
  const prepared = await prepareImageForOcr(imageDataUrl);

  // A dedicated worker constrained to the MRZ charset. Keep the creation promise
  // separate from the awaited worker: if createWorker itself times out, the
  // worker may still appear later — we must be able to terminate it then.
  const workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY);
  type TesseractWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>;
  let worker: TesseractWorker | undefined;
  let terminated = false;

  // Terminate at most once — from the finally block for the worker we actually
  // got, and from the promise chain for a worker that materialised after
  // createWorker timed out.
  const terminateWorker = async (w: TesseractWorker): Promise<void> => {
    if (terminated) return;
    terminated = true;
    try {
      await w.terminate();
    } catch {
      // Worker may already be gone — safe to ignore.
    }
  };

  try {
    worker = await withTimeout(workerPromise);
    await worker.setParameters({
      tessedit_char_whitelist: MRZ_CHAR_WHITELIST,
      preserve_interword_spaces: '0',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    });

    // The MRZ is a compact block of 2–3 fixed-width lines — SINGLE_BLOCK fits it
    // best; AUTO is a fallback for rotated / noisy scans.
    const psmFallbacks = [Tesseract.PSM.SINGLE_BLOCK, Tesseract.PSM.AUTO];
    let recognizedText = '';
    for (const psm of psmFallbacks) {
      if (psm !== Tesseract.PSM.SINGLE_BLOCK) {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
      }
      const { data } = await withTimeout(worker.recognize(prepared));
      if (extractMrzLines(data?.text ?? '').length >= 2) {
        recognizedText = data?.text ?? '';
        break;
      }
    }

    const lines = extractMrzLines(recognizedText);
    if (lines.length < 2) return null;
    return parseMrzLines(lines);
  } finally {
    // Always release the worker we got — this also aborts any recognize job
    // that is still running after its timeout fired, so it doesn't linger.
    if (worker) await terminateWorker(worker);
    // If createWorker itself timed out, `worker` stayed undefined but the
    // creation may still finish in the background — terminate the worker the
    // moment it resolves so it never hangs around.
    void workerPromise.then(terminateWorker).catch(() => {});
  }
}
