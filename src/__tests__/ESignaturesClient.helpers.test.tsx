/**
 * Tests for the exported helpers and signature-capture components of
 * ESignaturesClient: localizedDocTitle, documentDisplayBody, buildActBody,
 * toRenderableDocument (packet + asset-act branches), normalizeSignatureImage
 * (canvas background removal + crop), SignaturePad (draw/clear/save), and
 * SignatureUpload (file validation, FileReader path, drag & drop).
 *
 * The main ESignaturesClient.test.tsx covers the dialogs and mutations; this
 * file isolates the pure logic and the canvas/file plumbing.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en' },
  }),
}));

// ── Document-building libs (mutable so each test picks its branch) ─────────
let mockParsed: any = null;
let mockPacket: any = null;
jest.mock('@/lib/bilingualDocument', () => ({
  parseDocumentContent: () => mockPacket,
  applySignaturesToBlocks: (blocks: any) => blocks,
}));

jest.mock('@/lib/hiringPacketDocument', () => ({
  parseHiringPacketContent: () => mockPacket,
  applySignaturesToBlocks: (blocks: any) => blocks,
  hiringPacketFileName: () => 'doc.docx',
}));

jest.mock('@/lib/assetFormDocument', () => ({
  parseAssetFormContent: () => mockParsed,
  assetFormTitle: (isReturn: boolean) => (isReturn ? 'Return Form' : 'Movement Form'),
  assetFormFileName: () => 'form.pdf',
  assetFormDocumentNumber: () => 'N-1',
  assetFormInputFromParsed: (parsed: any, _opts: any) => parsed,
  buildAssetFormBlocks: () => [{ text: 'asset block' }],
}));

jest.mock('@/lib/exportDocument', () => ({
  exportDocumentToPDF: jest.fn().mockResolvedValue(undefined),
  renderDocumentPdfBase64: jest.fn().mockResolvedValue('data:application/pdf;base64,AAA'),
  renderDocumentDocxBlob: jest.fn().mockResolvedValue(new Blob()),
  documentBodyToPlainText: (blocks: any) =>
    Array.isArray(blocks) ? blocks.map((b: any) => b.text || '').join('\n') : String(blocks ?? ''),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/tabs', () => {
  const ReactMod = require('react');
  const TabsCtx = ReactMod.createContext({ value: '', setValue: (_v: string) => {} });
  return {
    Tabs: ({ defaultValue, children }: any) => {
      const [value, setValue] = ReactMod.useState(defaultValue);
      return <TabsCtx.Provider value={{ value, setValue }}>{children}</TabsCtx.Provider>;
    },
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children }: any) => {
      const { setValue } = ReactMod.useContext(TabsCtx);
      return (
        <button type="button" onClick={() => setValue(value)}>
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const { value: active } = ReactMod.useContext(TabsCtx);
      return active === value ? <div data-testid={`tab-${value}`}>{children}</div> : null;
    },
  };
});

jest.mock('lucide-react', () => {
  const Icon = (props: any) => <span data-testid="icon" {...props} />;
  return new Proxy({}, { get: () => Icon });
});

import {
  localizedDocTitle,
  documentDisplayBody,
  buildActBody,
  toRenderableDocument,
  normalizeSignatureImage,
} from '@/components/ESignaturesClient';
import { SignaturePad } from '@/components/ESignaturesClient';
import { SignatureUpload } from '@/components/ESignaturesClient';

const t = ((key: string, fallback?: string) => fallback || key) as any;

// ── Canvas plumbing mocks ───────────────────────────────────────────────────
type MockCtx = Record<string, any> & {
  drawImage: jest.Mock;
  getImageData: jest.Mock;
  putImageData: jest.Mock;
};

function makeCtx(pixelData: Uint8ClampedArray | null = null): MockCtx {
  const ctx: MockCtx = {
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    putImageData: jest.fn(),
    getImageData: jest.fn(() => ({ data: pixelData ?? new Uint8ClampedArray(4) })),
    canvas: { width: 0, height: 0 },
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  };
  return ctx;
}

let mockCtx: MockCtx | null = null;
const nativeGetContext = HTMLCanvasElement.prototype.getContext;
const nativeCreateElement = document.createElement.bind(document);
const nativeImage = globalThis.Image;
const nativeFileReader = globalThis.FileReader;

beforeEach(() => {
  jest.clearAllMocks();
  mockParsed = null;
  mockPacket = null;
  mockCtx = null;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx as any);
  document.createElement = nativeCreateElement as any;
  globalThis.Image = nativeImage;
  globalThis.FileReader = nativeFileReader;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = nativeGetContext;
  document.createElement = nativeCreateElement as any;
  globalThis.Image = nativeImage;
  globalThis.FileReader = nativeFileReader;
});

describe('localizedDocTitle', () => {
  it('returns empty string for a missing document', () => {
    expect(localizedDocTitle(null, t)).toBe('');
    expect(localizedDocTitle(undefined, t)).toBe('');
  });

  it('prefers the frozen bilingual packet title', () => {
    mockPacket = { title: 'Employment Contract' };
    expect(localizedDocTitle({ title: 'EN Title', content: '__DOC__{}' }, t)).toBe(
      'Employment Contract',
    );
  });

  it('localizes asset act titles via assetFormTitle', () => {
    mockParsed = { type: 'return' };
    expect(localizedDocTitle({ title: 'Movement Form - PC', content: 'act' }, t)).toBe(
      'Return Form',
    );
  });

  it('falls back to the stored title for generic documents', () => {
    expect(localizedDocTitle({ title: 'Plain Doc' }, t)).toBe('Plain Doc');
    expect(localizedDocTitle({ title: 'No content' }, t)).toBe('No content');
  });
});

describe('documentDisplayBody', () => {
  it('renders act blocks when an act body is present', () => {
    expect(
      documentDisplayBody({ content: 'act' }, { blocks: [{ text: 'A1' }, { text: 'A2' }] }),
    ).toBe('A1\nA2');
  });

  it('renders frozen packet blocks when no act is present', () => {
    mockPacket = { blocks: [{ text: 'P1' }] };
    expect(documentDisplayBody({ content: '__DOC__{}' }, null)).toBe('P1');
  });

  it('falls back to the raw content for generic documents', () => {
    expect(documentDisplayBody({ content: 'raw body' }, null)).toBe('raw body');
    expect(documentDisplayBody(null, null)).toBe('');
    expect(documentDisplayBody({}, null)).toBe('');
  });
});

describe('buildActBody', () => {
  it('returns null for generic documents', () => {
    expect(buildActBody({ title: 'x' }, t, 'en')).toBeNull();
    expect(buildActBody(null, t, 'en')).toBeNull();
  });

  it('builds blocks and input for an asset act with a signature', () => {
    mockParsed = { assetName: 'PC-1', isReturn: false };
    const result = buildActBody({ content: 'act' }, t, 'hy', {
      image: 'data:png',
      signerName: 'Bob',
    });
    expect(result).not.toBeNull();
    expect(result!.blocks).toEqual([{ text: 'asset block' }]);
    expect(result!.input.assetName).toBe('PC-1');
  });
});

describe('toRenderableDocument', () => {
  const labels = {
    signature: 'S',
    name: 'N',
    position: 'P',
    date: 'D',
    generatedOn: 'G',
    integrity: 'I',
  };

  it('renders a frozen bilingual packet with collected signatures', () => {
    mockPacket = {
      title: 'Packet',
      documentNumber: 'DOC-7',
      blocks: [{ text: 'body' }],
      primaryLocale: 'hy',
      accent: 'green',
      orgName: 'Org',
      labels,
    };
    const doc = {
      _id: 'd1' as any,
      title: 'x',
      content: '__DOC__{}',
      status: 'completed',
      createdAt: 1000,
      completedAt: 2000,
      createdBy: 'u1' as any,
      requests: [
        {
          _id: 'r1' as any,
          status: 'signed',
          signatureData: 'data:png',
          order: 1,
          signerName: 'Bob',
          signedAt: 1500,
        },
        { _id: 'r2' as any, status: 'pending', order: 2, signerName: 'Ann' },
      ],
    };
    const r = toRenderableDocument(doc as any, labels);
    expect(r.title).toBe('Packet');
    expect(r.documentNumber).toBe('DOC-7');
    expect(r.signature).toBe(false);
    expect(r.orgName).toBe('Org');
    expect(r.now).toBe(2000);
    expect(r.lang).toBe('hy');
  });

  it('renders a generic document with a themed signature block', () => {
    const doc = {
      _id: 'd1' as any,
      title: 'NDA',
      content: 'raw',
      status: 'completed',
      createdAt: 1000,
      createdBy: 'u1' as any,
      requests: [
        {
          _id: 'r1' as any,
          status: 'signed',
          signatureData: 'data:png',
          order: 1,
          signerName: 'Bob',
          signedAt: 1500,
        },
      ],
    };
    const r = toRenderableDocument(doc as any, labels, t, 'ru');
    expect(r.title).toBe('NDA');
    expect(r.body).toBe('raw');
    expect(r.signature).toBe(true);
    expect(r.signed?.signerName).toBe('Bob');
    expect(r.accent).toBe('blue');
  });

  it('renders an asset act via buildActBody', () => {
    mockParsed = { assetName: 'PC-1', isReturn: true };
    const doc = {
      _id: 'd1' as any,
      title: 'Movement Form - PC',
      content: 'act',
      status: 'completed',
      createdAt: 1000,
      createdBy: 'u1' as any,
    };
    const r = toRenderableDocument(doc as any, labels, t, 'hy');
    expect(r.title).toBe('Return Form');
    expect(r.body).toEqual([{ text: 'asset block' }]);
    expect(r.signature).toBe(false);
  });
});

describe('normalizeSignatureImage', () => {
  function installImage(overrides: Partial<HTMLImageElement> = {}) {
    let onload: (() => void) | null = null;
    const img = {
      naturalWidth: 2,
      naturalHeight: 1,
      onload: null as any,
      onerror: null as any,
      src: '',
      ...overrides,
    };
    (global as any).Image = jest.fn(() => img) as any;
    return {
      img,
      fireLoad: () => {
        img.onload?.();
      },
      fireError: () => {
        img.onerror?.();
      },
    };
  }

  it('keeps the original data URL when the image fails to load', async () => {
    const { fireError } = installImage();
    const p = normalizeSignatureImage('data:img');
    fireError();
    await expect(p).resolves.toBe('data:img');
  });

  it('keeps the original when the canvas context is missing', async () => {
    const { fireLoad } = installImage();
    mockCtx = null;
    const p = normalizeSignatureImage('data:img');
    fireLoad();
    await expect(p).resolves.toBe('data:img');
  });

  it('keeps the original when no ink pixels are found', async () => {
    // All-transparent pixels → no ink bounds → original is returned.
    const pixelData = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
    const ctx = makeCtx(pixelData);
    ctx.canvas = { width: 2, height: 1 };
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx) as any;
    (document as any).createElement = jest.fn((tag: string) => {
      if (tag === 'canvas') {
        return { width: 2, height: 1, getContext: () => ctx, toDataURL: () => 'data:png' };
      }
      return nativeCreateElement(tag);
    });
    const { fireLoad } = installImage();
    const p = normalizeSignatureImage('data:img');
    fireLoad();
    await expect(p).resolves.toBe('data:img');
  });

  it('falls back to the source canvas when the crop context is missing', async () => {
    const pixelData = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const ctx = makeCtx(pixelData);
    ctx.canvas = { width: 2, height: 1 };
    const canvases: any[] = [];
    (document as any).createElement = jest.fn((tag: string) => {
      if (tag === 'canvas') {
        if (canvases.length === 0) {
          const c = { width: 2, height: 1, getContext: () => ctx, toDataURL: () => 'data:png-out' };
          canvases.push(c);
          return c;
        }
        const c2 = { width: 1, height: 1, getContext: () => null, toDataURL: () => 'data:png' };
        canvases.push(c2);
        return c2;
      }
      return nativeCreateElement(tag);
    });
    const { fireLoad } = installImage();
    const p = normalizeSignatureImage('data:img');
    fireLoad();
    await expect(p).resolves.toBe('data:png-out');
  });

  it('removes the white background, crops and returns a transparent PNG', async () => {
    // 2x1 pixels: [opaque black ink, opaque white background]
    const pixelData = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const ctx = makeCtx(pixelData);
    ctx.canvas = { width: 2, height: 1 };
    const outCtx = makeCtx(pixelData);
    outCtx.canvas = { width: 1, height: 1 };
    const canvases: any[] = [];
    (document as any).createElement = jest.fn((tag: string) => {
      if (tag === 'canvas') {
        const c = { width: 2, height: 1, getContext: () => ctx, toDataURL: () => 'data:png-out' };
        if (canvases.length === 1) {
          c.getContext = () => outCtx;
          c.width = 0;
          c.height = 0;
          c.toDataURL = () => 'data:png-cropped';
        }
        canvases.push(c);
        return c;
      }
      return nativeCreateElement(tag);
    });

    const { fireLoad } = installImage();
    const p = normalizeSignatureImage('data:img');
    fireLoad();
    await expect(p).resolves.toBe('data:png-cropped');
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 2, 1);
    // Ink pixel stays opaque; white background pixel is knocked out.
    expect(pixelData[7]).toBe(0);
    expect(pixelData[3]).toBe(255);
  });
});

describe('SignaturePad', () => {
  function setup() {
    const onSave = jest.fn();
    const ctx = makeCtx();
    ctx.canvas = { width: 400, height: 200 };
    mockCtx = ctx;
    render(<SignaturePad onSave={onSave} />);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
    return { onSave, ctx, canvas };
  }

  it('draws a stroke and clears it', () => {
    const { ctx, canvas } = setup();
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(canvas);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();

    // Clear becomes enabled once there is content.
    const clear = screen.getByText('Clear') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 200);
    expect(clear.disabled).toBe(true);
  });

  it('applies the signature once there is content', () => {
    const { onSave, ctx, canvas } = setup();
    const apply = screen.getByText('Apply Signature');
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
    canvas.toDataURL = () => 'data:png-sig';
    fireEvent.click(apply);
    expect(onSave).toHaveBeenCalledWith('data:png-sig');
    expect(ctx.lineWidth).toBe(2.5);
    expect(ctx.strokeStyle).toBe('#1a1a1a');
  });

  it('does not save without content', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByText('Apply Signature'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('handles touch input and ignores moves before drawing starts', () => {
    const { ctx, canvas } = setup();
    fireEvent.touchMove(canvas, { touches: [{ clientX: 30, clientY: 30 }] });
    expect(ctx.lineTo).not.toHaveBeenCalled();
    fireEvent.touchStart(canvas, { touches: [{ clientX: 30, clientY: 30 }] });
    fireEvent.touchMove(canvas, { touches: [{ clientX: 60, clientY: 60 }] });
    expect(ctx.lineTo).toHaveBeenCalled();
  });
});

describe('SignatureUpload', () => {
  function setup() {
    const onSave = jest.fn();
    render(<SignatureUpload onSave={onSave} />);
    return onSave;
  }

  function fileOf(type: string, size = 1024): File {
    return new File(['x'.repeat(size)], 'sig.png', { type });
  }

  it('rejects unsupported file types', () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf('image/gif')] } });
    expect(screen.getByText('Please upload a PNG, JPG, or WEBP image.')).toBeInTheDocument();
  });

  it('rejects oversized files', () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf('image/png', 3 * 1024 * 1024)] } });
    expect(screen.getByText('Image is too large (max 2 MB).')).toBeInTheDocument();
  });

  it('normalizes and saves a valid upload via FileReader', async () => {
    const onSave = setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    let onload: (() => void) | null = null;
    (global as any).FileReader = jest.fn(() => ({
      readAsDataURL: jest.fn(),
      set onload(fn: any) {
        onload = fn;
      },
      get onload() {
        return onload;
      },
      onerror: null as any,
      result: 'data:image/png;base64,AAAA',
    }));

    // normalizeSignatureImage must resolve. Give Image an auto-firing onload
    // once src is assigned so the async normalize chain completes.
    (global as any).Image = jest.fn(() => {
      const img: any = {
        naturalWidth: 1,
        naturalHeight: 1,
        onload: null,
        onerror: null,
        set src(_v: string) {
          setTimeout(() => img.onload?.(), 0);
        },
      };
      return img;
    }) as any;

    fireEvent.change(input, { target: { files: [fileOf('image/png')] } });
    expect(onload).not.toBeNull();
    onload!();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(String(onSave.mock.calls[0][0])).toContain('data:image/png');
  });

  it('shows an error when FileReader fails', async () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    let onerror: (() => void) | null = null;
    (global as any).FileReader = jest.fn(() => ({
      readAsDataURL: jest.fn(),
      onload: null as any,
      set onerror(fn: any) {
        onerror = fn;
      },
      get onerror() {
        return onerror;
      },
      result: null,
    }));
    fireEvent.change(input, { target: { files: [fileOf('image/png')] } });
    await act(async () => {
      onerror!();
    });
    expect(screen.getByText('Could not read the file. Try another image.')).toBeInTheDocument();
  });

  it('accepts a dropped file and ignores drops while processing', () => {
    const onSave = setup();
    const zone = screen.getByText('Click or drag an image to upload').closest('button')!;
    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('image/gif')] } });
    expect(screen.getByText('Please upload a PNG, JPG, or WEBP image.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('opens the file picker when the zone is clicked and prevents drag default', () => {
    setup();
    const zone = screen.getByText('Click or drag an image to upload').closest('button')!;
    const clickSpy = jest.fn();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.click = clickSpy;
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalled();
    fireEvent.dragOver(zone);
  });

  it('shows an error when the FileReader produces no result', async () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    let onload: (() => void) | null = null;
    (global as any).FileReader = jest.fn(() => ({
      readAsDataURL: jest.fn(),
      set onload(fn: any) {
        onload = fn;
      },
      get onload() {
        return onload;
      },
      onerror: null as any,
      result: null,
    }));
    fireEvent.change(input, { target: { files: [fileOf('image/png')] } });
    await act(async () => {
      onload!();
    });
    expect(screen.getByText('Could not read the file. Try another image.')).toBeInTheDocument();
  });
});
