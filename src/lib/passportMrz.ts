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

/** Parse already-extracted MRZ text lines into passport fields. */
export async function parseMrzLines(lines: string[]): Promise<PassportMrzResult> {
  const { parse } = await import('mrz');
  const cleaned = lines.map((l) => l.trim().toUpperCase()).filter(Boolean);
  const result = parse(cleaned, { autocorrect: true });

  const f = result.fields;
  const errors = result.details
    .filter((d) => !d.valid && d.error)
    .map((d) => `${d.label}: ${d.error}`);

  return {
    passportNumber: f.documentNumber ?? undefined,
    passportExpiryDate: mrzDateToIso(f.expirationDate, true),
    nationality: f.nationality ?? undefined,
    dateOfBirth: mrzDateToIso(f.birthDate, false),
    firstName: f.firstName ?? undefined,
    lastName: f.lastName ?? undefined,
    valid: result.valid,
    errors,
  };
}

/**
 * Heuristically extract MRZ lines from raw OCR text: the MRZ uses `<` fillers and
 * fixed-length lines (TD3 = 44 chars, TD1/TD2 = 30/36). Pick the trailing lines that
 * look like MRZ.
 */
function extractMrzLines(rawText: string): string[] {
  const candidates = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').toUpperCase())
    .filter((l) => l.length >= 28 && /^[A-Z0-9<]+$/.test(l) && l.includes('<'));
  // TD3 has 2 lines, TD1 has 3. Return the last 2–3 candidates.
  return candidates.slice(-3);
}

/**
 * Run OCR on a passport image (data URL / base64) and parse the MRZ.
 * Returns null if no MRZ-like lines could be found.
 */
export async function scanPassportImage(imageDataUrl: string): Promise<PassportMrzResult | null> {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(imageDataUrl, 'eng');
  const lines = extractMrzLines(data.text ?? '');
  if (lines.length < 2) return null;
  return parseMrzLines(lines);
}
