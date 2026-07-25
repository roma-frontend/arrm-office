/**
 * Tests for passportMrz.ts — Client-side passport MRZ extraction + parsing
 *
 * Tests: parseMrzLines (TD3 format with autocorrect), scanPassportImage
 * (Tesseract OCR + MRZ extraction), null/error paths.
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

// Mock tesseract.js
const mockRecognize = jest.fn();
jest.mock(
  'tesseract.js',
  () => ({
    recognize: mockRecognize,
  }),
  { virtual: true },
);

beforeEach(() => {
  jest.clearAllMocks();
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
});

describe('scanPassportImage', () => {
  it('returns parsed result when OCR finds MRZ lines', async () => {
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
    expect(mockRecognize).toHaveBeenCalledWith('data:image/jpeg;base64,abc123', 'eng');
  });

  it('returns null when no MRZ-like lines are found', async () => {
    mockRecognize.mockResolvedValue({
      data: { text: 'Just some random text without any MRZ patterns' },
    });

    const result = await scanPassportImage('data:image/jpeg;base64,xyz');
    expect(result).toBeNull();
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
});
