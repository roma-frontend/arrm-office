/**
 * Tests for passportMrz.ts — Client-side passport MRZ extraction + parsing
 *
 * Tests: parseMrzLines (TD3 format with autocorrect + fallback), scanPassportImage
 * (Tesseract worker OCR + MRZ extraction), null/error paths.
 */

import { parseMrzLines, scanPassportImage } from '@/lib/passportMrz';

// ── Mock mrz library ─────────────────────────────────────────────────────────
const mockParse = jest.fn();

jest.mock(
  'mrz',
  () => ({
    parse: mockParse,
  }),
  { virtual: true },
);

// ── Mock tesseract.js (worker-based API) ────────────────────────────────────
const mockCreateWorker = jest.fn();
const mockSetParameters = jest.fn();
const mockRecognize = jest.fn();
const mockTerminate = jest.fn();

jest.mock(
  'tesseract.js',
  () => ({
    createWorker: mockCreateWorker,
    OEM: { LSTM_ONLY: 1 },
    PSM: { SINGLE_BLOCK: '6', AUTO: '3' },
  }),
  { virtual: true },
);

// ── Mock Image (deterministic load across environments) ─────────────────────
// jsdom never fires `load`/`error` for data-URL images, and when the native
// `canvas` binding is present (Linux CI), prepareImageForOcr() takes the real
// canvas path where loadImage() awaits img.onload — which never fires. Stub the
// Image constructor so assigning `src` fires onload on the next microtask. This
// keeps the scanPassportImage tests environment-agnostic and fast.
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  // 0 dimensions short-circuit prepareImageForOcr() at its naturalWidth guard,
  // before any canvas operation — tests stay deterministic with or without the
  // native canvas binding.
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    // Fire synchronously: loadImage() assigns onload BEFORE src, so this
    // resolves the promise (and clears its timeout) on the same tick. Using
    // queueMicrotask would queue into jest's FAKE microtask queue under
    // jest.useFakeTimers(), whose drain order vs the loadImage 4s timer is
    // racy — firing onload synchronously removes that race entirely.
    this.onload?.();
  }
}
(globalThis as { Image?: unknown }).Image = MockImage;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateWorker.mockResolvedValue({
    setParameters: mockSetParameters,
    recognize: mockRecognize,
    terminate: mockTerminate,
  });
  mockSetParameters.mockResolvedValue(undefined);
  mockTerminate.mockResolvedValue(undefined);
});

// ── Constants ────────────────────────────────────────────────────────────────
const TD3_LINE_1 = 'P<UTOSTEVENSON<<PETER<<<<<<<<<<<<<<<<<<<<<<<';
const TD3_LINE_2 = 'L898902C<3UTO6908061F9406236ZE184226B<<<<<14';

const validParseResult = {
  fields: {
    documentNumber: 'L898902C',
    expirationDate: '940623',
    nationality: 'UTO',
    birthDate: '690806',
    firstName: 'PETER',
    lastName: 'STEVENSON',
  },
  details: [{ valid: true, label: 'format' }],
  valid: true,
};

describe('parseMrzLines', () => {
  it('parses TD3 MRZ lines correctly', async () => {
    mockParse.mockReturnValue(validParseResult);

    const result = await parseMrzLines([TD3_LINE_1, TD3_LINE_2]);

    expect(result.valid).toBe(true);
    expect(result.passportNumber).toBe('L898902C');
    expect(result.passportExpiryDate).toBe('2094-06-23');
    expect(result.nationality).toBe('UTO');
    expect(result.dateOfBirth).toBe('1969-08-06');
    expect(result.firstName).toBe('PETER');
    expect(result.lastName).toBe('STEVENSON');
    expect(result.errors).toHaveLength(0);
    expect(mockParse).toHaveBeenCalledWith([TD3_LINE_1.toUpperCase(), TD3_LINE_2.toUpperCase()], {
      autocorrect: true,
    });
  });

  it('collects errors from invalid fields', async () => {
    mockParse.mockReturnValue({
      fields: {
        documentNumber: 'L898902C',
        expirationDate: '940623',
        nationality: 'UTO',
        birthDate: '690806',
        firstName: 'PETER',
        lastName: 'STEVENSON',
      },
      details: [
        { valid: false, label: 'check digit', error: 'Invalid check digit' },
        { valid: true, label: 'format' },
      ],
      valid: false,
    });

    const result = await parseMrzLines([TD3_LINE_1, TD3_LINE_2]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('check digit');
  });

  it('trims and uppercases input lines', async () => {
    mockParse.mockReturnValue(validParseResult);
    await parseMrzLines(['  ' + TD3_LINE_1.toLowerCase() + '  ', TD3_LINE_2]);

    expect(mockParse).toHaveBeenCalledWith([TD3_LINE_1, TD3_LINE_2], { autocorrect: true });
  });

  it('filters out empty lines', async () => {
    mockParse.mockReturnValue(validParseResult);
    await parseMrzLines([TD3_LINE_1, '', TD3_LINE_2, '  ']);

    expect(mockParse).toHaveBeenCalledWith([TD3_LINE_1, TD3_LINE_2], { autocorrect: true });
  });

  it('handles missing optional fields', async () => {
    mockParse.mockReturnValue({
      fields: {
        documentNumber: 'ABC123',
        expirationDate: undefined,
        nationality: undefined,
        birthDate: null,
        firstName: null,
        lastName: 'DOE',
      },
      details: [],
      valid: true,
    });

    const result = await parseMrzLines(['SOME<<LINE', 'ANOTHER<<LINE']);
    expect(result.passportNumber).toBe('ABC123');
    expect(result.passportExpiryDate).toBeUndefined();
    expect(result.dateOfBirth).toBeUndefined();
    expect(result.firstName).toBeUndefined();
    expect(result.lastName).toBe('DOE');
  });

  it('falls back to the last two lines when a stray third line breaks parsing', async () => {
    mockParse
      .mockImplementationOnce(() => {
        throw new Error('Invalid MRZ length');
      })
      .mockReturnValueOnce(validParseResult);

    const result = await parseMrzLines([
      'GARBAGE<<<<<<<<<<<<<<<<<<<<<<<<<<',
      TD3_LINE_1,
      TD3_LINE_2,
    ]);
    expect(result?.valid).toBe(true);
    expect(mockParse).toHaveBeenNthCalledWith(2, [TD3_LINE_1, TD3_LINE_2], { autocorrect: true });
  });

  it('returns an invalid result instead of throwing when every set fails', async () => {
    mockParse.mockImplementation(() => {
      throw new Error('Invalid MRZ');
    });

    const result = await parseMrzLines([TD3_LINE_1, TD3_LINE_2]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('repairs OCR length drift: long line 1 (filler read as K/L) + short line 2', async () => {
    // Realistic tesseract LSTM output on a scan: '<' misread as K/L, 1 as L,
    // and line lengths drifted to 55 / 42 instead of the fixed TD3 width 44.
    const noisyL1 = 'P<ARMSTEVENSON<K<KPETER<<K<K<KLLLLLLLLLLLLLLLLLLLLLLL';
    const noisyL2 = 'L898902C<3ARM6908061F9406236ZE184226B<<<14';

    mockParse
      .mockImplementationOnce(() => {
        throw new Error('Invalid number of characters for line 2: 42. Must be 44 for TD3');
      })
      .mockReturnValueOnce(validParseResult);

    const result = await parseMrzLines([noisyL1, noisyL2]);
    expect(result?.valid).toBe(true);
    expect(result?.passportNumber).toBe('L898902C');

    // Second attempt must use the rebuilt 44/44 TD3 lines.
    const repairedL1 = 'P<ARMSTEVENSON<K<KPETER<<K<K<KLLLLLLLLLLLLLL';
    const repairedL2 = 'L898902C<3ARM6908061F9406236ZE184226B<<<<<14';
    expect(mockParse).toHaveBeenNthCalledWith(2, [repairedL1, repairedL2], {
      autocorrect: true,
    });
  });

  it('does not append a repaired set when line 2 is too short to be TD3', async () => {
    mockParse.mockImplementation(() => {
      throw new Error('Invalid MRZ');
    });

    // Line 2 has < 28 chars — repairTd3Line2 returns null, so only the raw set
    // is attempted.
    await parseMrzLines(['P<ARMSTEVENSON<<PETER<<<<<<<<<<<<<<<<<<<<<<<', 'SHORT']);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('prefers a valid raw set over the repaired fallback (no double-parse on success)', async () => {
    mockParse.mockReturnValue(validParseResult);

    await parseMrzLines([TD3_LINE_1, TD3_LINE_2]);
    // Raw set already parses validly — the repaired fallback is never attempted.
    expect(mockParse).toHaveBeenCalledTimes(1);
  });
});

describe('scanPassportImage', () => {
  // Safety net: if a test times out mid-flight, jest aborts the async fn BEFORE
  // its finally block runs, leaking fake timers into the next test. Always
  // restore real timers between tests so a timeout can't poison the suite.
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a whitelisted worker and returns parsed result when OCR finds MRZ', async () => {
    mockRecognize.mockResolvedValue({
      data: {
        text: `Some garbage text\nP<UTOSTEVENSON<<PETER<<<<<<<<<<<<<<<<<<<<<<<\nL898902C<3UTO6908061F9406236ZE184226B<<<<<14`,
      },
    });
    mockParse.mockReturnValue(validParseResult);

    const result = await scanPassportImage('data:image/jpeg;base64,abc123');
    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.passportNumber).toBe('L898902C');
    expect(mockCreateWorker).toHaveBeenCalledWith('eng', 1);
    expect(mockSetParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      }),
    );
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('returns null when no MRZ-like lines are found', async () => {
    mockRecognize.mockResolvedValue({
      data: { text: 'Just some random text without any MRZ patterns' },
    });

    const result = await scanPassportImage('data:image/jpeg;base64,xyz');
    expect(result).toBeNull();
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('returns null when fewer than 2 MRZ lines found', async () => {
    mockRecognize.mockResolvedValue({
      data: {
        text: 'P<UTOSTEVENSON<<PETER<<<<<<<<<<<<<<<<<<<<<<<\n',
      },
    });

    const result = await scanPassportImage('data:image/jpeg;base64,xyz');
    expect(result).toBeNull();
  });

  it('terminates the worker even when OCR fails', async () => {
    mockRecognize.mockRejectedValue(new Error('OCR worker crashed'));

    await expect(scanPassportImage('data:image/jpeg;base64,abc')).rejects.toThrow(
      'OCR worker crashed',
    );
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('terminates a worker that appears after createWorker timed out', async () => {
    jest.useFakeTimers();
    try {
      // createWorker never resolves within the 45s timeout — the worker is
      // created only AFTER the timeout already fired.
      const lateWorker = {
        setParameters: jest.fn().mockResolvedValue(undefined),
        recognize: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
      };
      let resolveLate!: (w: unknown) => void;
      mockCreateWorker.mockReturnValue(
        new Promise((res) => {
          resolveLate = res;
        }),
      );

      const pending = scanPassportImage('data:image/jpeg;base64,abc');

      // Fire the 45s OCR timeout.
      await jest.advanceTimersByTimeAsync(46_000);
      await expect(pending).rejects.toThrow('OCR timed out');

      // The worker materialises late — it must be terminated, not left hanging.
      resolveLate(lateWorker);
      // Flush the promise chain deterministically before asserting.
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(lateWorker.terminate).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not terminate twice when the worker is already terminated', async () => {
    mockCreateWorker.mockResolvedValue({
      setParameters: mockSetParameters,
      recognize: mockRecognize,
      terminate: mockTerminate,
    });
    mockRecognize.mockResolvedValue({
      data: {
        text: 'P<UTOSTEVENSON<<PETER<<<<<<<<<<<<<<<<<<<<<<<\nL898902C<3UTO6908061F9406236ZE184226B<<<<<14',
      },
    });
    mockParse.mockReturnValue(validParseResult);

    await scanPassportImage('data:image/jpeg;base64,abc');

    // The finally block terminates the worker we got, and the promise-chain
    // guard must not double-terminate the same worker.
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
