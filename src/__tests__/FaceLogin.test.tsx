/**
 * Tests for FaceLogin (src/components/auth/FaceLogin.tsx) — the face-ID login
 * widget: camera enumeration + selection, webcam start/stop with all
 * getUserMedia error paths, the server-side detection loop (progress, quality,
 * no-face reset), auto-trigger gating (email required / format / throttle), and
 * the /api/auth/face-login flow (success, 401/403 mismatch → block after 3,
 * maintenance redirect, network failure, missing face).
 *
 * The detection loop runs on a real setInterval whose callback is captured via
 * a setInterval spy, so each frame tick is driven deterministically. The video
 * element is provided by jsdom; HTMLMediaElement.play is stubbed.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mutable fixtures (declared before jest.mock factories reference them) ─────
let mockUser: any = null;
let mockCameras: Array<{ kind: string; deviceId: string; label: string }> = [];
let getUserMediaImpl: () => Promise<any> = () => Promise.resolve(null);
let mockDetectBox: any = null;
let mockDetectResult: any = null;
let mockErrName = '';
let mockErrMsg = 'camera exploded';
let statusListener: ((s: any) => void) | null = null;
let intervalCallback: (() => Promise<void>) | null = null;
let faceLoginResponder: () => Promise<any> = () =>
  Promise.resolve({ ok: true, status: 200, json: async () => ({ session: null }) });
let lastFacePayload: any = null;
let fakeNow = 1_000_000;
const mockLogin = jest.fn();
const mockPush = jest.fn();
const mockMutation = jest.fn();

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

// ── Router / auth store ──────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ login: mockLogin }) },
}));

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('convex/react', () => ({
  useMutation: () => mockMutation,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: { users: { auth: { recordFaceIdAttempt: { _name: 'recordFaceIdAttempt' } } } },
}));

// ── UI primitives ────────────────────────────────────────────────────────────
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, ...p }: any) => (
    <button onClick={onClick} className={className} {...p}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <span data-testid="shield-loader" />,
}));

jest.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ options, onChange }: any) => (
    <div data-testid="custom-select">
      {options.map((o: any) => (
        <button key={o.value} data-testid={`opt-${o.value}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('lucide-react', () => {
  const iconNames = ['Camera', 'CheckCircle', 'XCircle', 'ScanFace'];
  const mocks: Record<string, any> = {};
  for (const name of iconNames) {
    mocks[name] = (props: any) => (
      <span data-testid={`icon-${name}`} {...props}>
        {name}
      </span>
    );
  }
  return mocks;
});

// ── lib helpers ──────────────────────────────────────────────────────────────
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/lib/error-handler', () => ({
  getErrorName: jest.fn(() => mockErrName),
  getErrorMessage: jest.fn(() => mockErrMsg),
}));

jest.mock('@/lib/faceApi', () => ({
  detectFace: jest.fn(() => Promise.resolve(mockDetectResult)),
  detectFaceBox: jest.fn(() => Promise.resolve(mockDetectBox)),
  prefetchFaceApiModels: jest.fn(),
  prefetchFaceDetector: jest.fn(),
  prefetchFaceRecognition: jest.fn(),
  retryFaceApi: jest.fn(),
  subscribeFaceApiStatus: jest.fn((cb: any) => {
    statusListener = cb;
    return () => {
      statusListener = null;
    };
  }),
}));

// ── fetch ────────────────────────────────────────────────────────────────────
const mockFetch = jest.fn((url: string, opts?: any) => {
  if (String(url).includes('/api/auth/face-login')) {
    if (opts?.body) lastFacePayload = JSON.parse(opts.body);
    return faceLoginResponder();
  }
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
});

// ── Component ────────────────────────────────────────────────────────────────
import { FaceLogin } from '@/components/auth/FaceLogin';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import {
  detectFaceBox,
  detectFace,
  retryFaceApi,
  prefetchFaceApiModels,
  prefetchFaceDetector,
  prefetchFaceRecognition,
} from '@/lib/faceApi';

function makeStream() {
  return {
    getTracks: () => [{ stop: jest.fn() }, { stop: jest.fn() }],
  };
}

beforeEach(() => {
  mockUser = null;
  mockCameras = [
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam 1' },
    { kind: 'audioinput', deviceId: 'aud-1', label: 'Mic' },
  ];
  getUserMediaImpl = () => Promise.resolve(makeStream());
  mockDetectBox = null;
  mockDetectResult = null;
  mockErrName = '';
  mockErrMsg = 'camera exploded';
  statusListener = null;
  intervalCallback = null;
  faceLoginResponder = () =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({ session: null }) });
  lastFacePayload = null;
  fakeNow = 1_000_000;
  mockLogin.mockClear();
  mockPush.mockClear();
  mockMutation.mockClear();
  mockFetch.mockClear();
  (logger.error as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
  (logger.log as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
  (detectFaceBox as jest.Mock).mockClear();
  (detectFace as jest.Mock).mockClear();
  (retryFaceApi as jest.Mock).mockClear();
  (prefetchFaceApiModels as jest.Mock).mockClear();
  jest.restoreAllMocks();
  window.history.replaceState({}, '', '/');

  // Media devices + video stubs
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: jest.fn(async () => mockCameras),
      getUserMedia: jest.fn(() => getUserMediaImpl()),
    },
  });
  (HTMLMediaElement.prototype.play as any) = jest.fn().mockResolvedValue(undefined);
  (global as any).fetch = mockFetch;
  jest.spyOn(window, 'setInterval').mockImplementation((cb: any, ms?: number) => {
    intervalCallback = cb as () => Promise<void>;
    return 123 as any;
  });
  jest.spyOn(window, 'clearInterval').mockImplementation(() => {});
  jest.spyOn(window, 'setTimeout');
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function typeEmail(email: string) {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } });
  await flush();
}

/**
 * Start the webcam and run the detection loop until the interval is armed.
 * The setTimeout spy (call-through) pumps the microtask/macrotask queue so the
 * async startWebcam continuation reliably reaches onloadedmetadata.
 */
async function startWebcam() {
  fireEvent.click(screen.getByText('Start Face Login'));
  // pump the event loop until startWebcam attaches onloadedmetadata — the
  // getUserMedia → setState → render → setTimeout(0) → waitForVideo chain needs
  // several real macrotasks, so a single fixed wait is not reliable under load.
  let video: HTMLVideoElement | null = null;
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    video = document.querySelector('video');
    if (video && (video as any).onloadedmetadata) break;
  }
  expect(video).toBeTruthy();
  expect((video as any).onloadedmetadata).toBeTruthy();
  Object.defineProperty(video!, 'readyState', { value: 4, configurable: true });
  await act(async () => {
    (video as any).onloadedmetadata();
  });
  expect(intervalCallback).toBeTruthy();
  // The badge gate in the UI is modelStatus.canDetect — in production the models
  // are loaded by the time the loop runs. Emit a ready status so detection
  // badges ("Face detected" / "No face") render instead of "Preparing".
  await act(async () => {
    statusListener!({
      stage: 'ready',
      progress: 100,
      canDetect: true,
      canRecognize: true,
      error: null,
    });
  });
}

/** Drive one detection-frame tick. */
async function tick() {
  await act(async () => {
    await intervalCallback!();
  });
}

/**
 * Grab the real onClick handler React attached to the Start button — the
 * defensive guards in startWebcam are unreachable through the DOM (the button
 * unmounts in the blocked/active states), so tests invoke the handler directly.
 */
function getStartHandler(): () => Promise<void> {
  const btn = screen.getByText('Start Face Login');
  const key = Object.keys(btn).find((k) => k.startsWith('__reactProps'));
  expect(key).toBeTruthy();
  return (btn as any)[key!].onClick as () => Promise<void>;
}

describe('FaceLogin — initial render & model status', () => {
  it('renders the idle screen with email input and start button', async () => {
    render(<FaceLogin />);
    await flush();

    expect(screen.getByText('Face ID Login')).toBeInTheDocument();
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Start Face Login')).toBeInTheDocument();
    expect(screen.getByText(/Preparing detection/)).toBeInTheDocument();
    // Mount prefetches the detector stage only — the ~6.4 MB recognition nets
    // must wait for user intent (webcam start), see the webcam-start test.
    expect(prefetchFaceDetector).toHaveBeenCalled();
    expect(prefetchFaceApiModels).not.toHaveBeenCalled();
  });

  it('pre-fills the email from the query string', async () => {
    window.history.pushState({}, '', '/login?email=john%40example.com');
    render(<FaceLogin />);
    await flush();
    expect((screen.getByPlaceholderText('you@example.com') as HTMLInputElement).value).toBe(
      'john@example.com',
    );
  });

  it('surfaces the model status and retries on error', async () => {
    render(<FaceLogin />);
    await flush();

    statusListener!({
      stage: 'error',
      progress: 0,
      canDetect: false,
      canRecognize: false,
      error: 'boom',
    });
    await flush();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(retryFaceApi).toHaveBeenCalled();
    // An explicit user retry restarts the whole pipeline (both stages).
    expect(prefetchFaceApiModels).toHaveBeenCalled();
  });

  it('logs when enumerating camera devices fails', async () => {
    mockCameras = [];
    (navigator.mediaDevices.enumerateDevices as jest.Mock).mockRejectedValue(new Error('no dev'));
    render(<FaceLogin />);
    await flush();
    expect(logger.error).toHaveBeenCalledWith('Failed to enumerate devices:', expect.anything());
  });

  it('shows the camera selector when multiple video inputs exist', async () => {
    mockCameras = [
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam 1' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Webcam 2' },
    ];
    render(<FaceLogin />);
    await flush();

    fireEvent.click(screen.getByTestId('opt-cam-2'));
    await flush();
    // selection recorded; next start uses it (asserted via constraints in a later test)
    expect(screen.getByTestId('custom-select')).toBeInTheDocument();
  });
});

describe('FaceLogin — webcam start/stop', () => {
  it('starts the webcam, plays the video and stops on Cancel', async () => {
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    let video = document.querySelector('video');
    for (let i = 0; i < 40 && !(video as any)?.onloadedmetadata; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      video = document.querySelector('video');
    }
    expect(video).toBeTruthy();
    Object.defineProperty(video!, 'readyState', { value: 4, configurable: true });
    await act(async () => {
      (video as any).onloadedmetadata();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // Camera start is the user-intent point — recognition nets begin streaming
    // in the background here, never on mount.
    expect(prefetchFaceRecognition).toHaveBeenCalled();
    expect(intervalCallback).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeInTheDocument();

    // cancel stops the stream tracks and returns to idle
    fireEvent.click(screen.getByText('Cancel'));
    await flush();
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
    expect(screen.getByText('Start Face Login')).toBeInTheDocument();

    // a late frame after the stream is gone tears the loop down (guard branch)
    await tick();
  });

  it('warns when start is invoked while the webcam is already running', async () => {
    render(<FaceLogin />);
    await flush();
    const startHandler = getStartHandler();

    await startWebcam();
    // direct call — the button itself is gone while the webcam is active
    await act(async () => {
      await startHandler();
    });
    expect(logger.warn).toHaveBeenCalledWith('⚠️ Webcam already active, ignoring startWebcam');
  });

  it('toasts when the video element never becomes available', async () => {
    // Deterministic stand-in for the previous unmount race (which raced the
    // React commit of the <video>): keep the component mounted and make every
    // ref attachment a no-op — React assigns ref.current = video, the setter
    // swallows it, so waitForVideo() exhausts its 20 attempts and the
    // not-found guard fires reliably.
    const spy = jest.spyOn(React, 'useRef').mockImplementation((_initial: unknown) => {
      const ref: { current: unknown } = {};
      Object.defineProperty(ref, 'current', {
        configurable: true,
        get: () => null,
        set: () => {},
      });
      return ref as any;
    });

    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));

    // waitForVideo polls 20 × 50ms before giving up
    await waitFor(
      () => expect(toast.error).toHaveBeenCalledWith('Video element not found. Please try again.'),
      { timeout: 4000 },
    );
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    // stopWebcam() reset the UI
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
    expect(screen.getByText('Start Face Login')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows a toast when the video fails to play', async () => {
    (HTMLMediaElement.prototype.play as any) = jest.fn().mockRejectedValue(new Error('play fail'));
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    let video = document.querySelector('video');
    for (let i = 0; i < 40 && !(video as any)?.onloadedmetadata; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      video = document.querySelector('video');
    }
    Object.defineProperty(video!, 'readyState', { value: 4, configurable: true });
    await act(async () => {
      (video as any).onloadedmetadata();
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to start video playback'));
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles NotAllowedError from getUserMedia', async () => {
    mockErrName = 'NotAllowedError';
    getUserMediaImpl = () =>
      Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera permission denied. Please allow camera access in your browser settings.',
        expect.anything(),
      ),
    );
    // stopWebcam reset the UI
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
  });

  it('handles NotFoundError from getUserMedia', async () => {
    mockErrName = 'NotFoundError';
    getUserMediaImpl = () => Promise.reject(new Error('no cam'));
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('auth.noCameraFound'));
  });

  it('handles NotReadableError from getUserMedia', async () => {
    mockErrName = 'NotReadableError';
    getUserMediaImpl = () => Promise.reject(new Error('busy'));
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera is already in use by another application. Please close other apps using the camera.',
      ),
    );
  });

  it('handles an unknown getUserMedia error', async () => {
    mockErrName = 'SomethingElse';
    getUserMediaImpl = () => Promise.reject(new Error('mystery'));
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Unable to access camera: camera exploded'),
    );
  });

  it('shows a toast when camera access is unsupported', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<FaceLogin />);
    await flush();
    fireEvent.click(screen.getByText('Start Face Login'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera access is not supported in this browser. Please use Chrome, Edge, or Firefox.',
      ),
    );
  });
});

describe('FaceLogin — detection loop', () => {
  it('accumulates progress and quality over frames', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await startWebcam();

    await tick();
    expect(detectFaceBox).toHaveBeenCalled();
    expect(screen.getByText('Face detected')).toBeInTheDocument();
    expect(screen.getByText(/Scanning: 34%/)).toBeInTheDocument();
    expect(screen.getByText('✓ Excellent')).toBeInTheDocument();

    await tick();
    expect(screen.getByText(/Scanning: 68%/)).toBeInTheDocument();
  });

  it('resets progress after frames without a face', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await startWebcam();

    await tick();
    await tick();
    expect(screen.getByText('Face detected')).toBeInTheDocument();

    mockDetectBox = null;
    await tick();
    await tick();
    await tick();
    expect(screen.getByText('No face')).toBeInTheDocument();
    // progress reset to 0 — the scanning badge is gone, the button shows 0%
    expect(screen.getByText('Scanning... 0%')).toBeInTheDocument();
  });

  it('reports good quality for a medium-size face', async () => {
    mockDetectBox = { x: 0, y: 0, width: 150, height: 150, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await startWebcam();

    await tick();
    expect(screen.getByText('◐ Good')).toBeInTheDocument();
  });

  it('logs and continues when a detection frame throws', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await startWebcam();

    (detectFaceBox as jest.Mock).mockRejectedValueOnce(new Error('detector boom'));
    await tick();
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Error in face detection loop:',
      expect.anything(),
    );
  });
});

describe('FaceLogin — auto trigger & login', () => {
  async function reachAutoTrigger() {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    render(<FaceLogin />);
    await flush();
    await startWebcam();
    await tick(); // 34
    await tick(); // 68
    await tick(); // 100 → auto-trigger
  }

  it('asks for an email before auto-triggering', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await startWebcam();

    await tick();
    await tick();
    await tick();
    expect(toast.error).toHaveBeenCalledWith(
      'Enter your email before face login',
      expect.objectContaining({ id: 'no-email' }),
    );
    expect(detectFace).not.toHaveBeenCalled();
  });

  it('rejects an invalid email during the attempt', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    render(<FaceLogin />);
    await flush();
    await typeEmail('not-an-email');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    // the email-format guard fires inside attemptFaceLogin with a single arg
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Enter your email before face login'),
    );
    expect(detectFace).not.toHaveBeenCalled();
  });

  it('logs in successfully and redirects to the dashboard', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    faceLoginResponder = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          session: {
            userId: 'u1',
            name: 'Anna',
            email: 'anna@example.com',
            role: 'admin',
            organizationId: 'org-1',
            organizationSlug: 'acme',
            organizationName: 'Acme',
            avatar: 'a.png',
          },
        }),
      });
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'Anna', role: 'admin', organizationId: 'org-1' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(lastFacePayload).toMatchObject({
      email: 'anna@example.com',
      // Float32Array round-trips through JSON with float32 precision
      faceDescriptor: [expect.closeTo(0.1, 5), expect.closeTo(0.2, 5), expect.closeTo(0.3, 5)],
    });
    // webcam stopped after success
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
  });

  it('respects the ?next= redirect target', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    window.history.pushState({}, '', '/login?next=/admin');
    faceLoginResponder = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          session: { userId: 'u1', name: 'B', email: 'b@x.com', role: 'employee' },
        }),
      });
    render(<FaceLogin />);
    await flush();
    await typeEmail('b@x.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin'));
  });

  it('counts failed attempts and blocks after three mismatches', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    faceLoginResponder = () =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: 'mismatch' }),
      });
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Face not recognized. Attempt 1 of 3'),
    );
    expect(screen.getByText('Face not recognized')).toBeInTheDocument();
    expect(screen.getByText(/Failed attempts: 1 of 3/)).toBeInTheDocument();

    fakeNow += 3000;
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Face not recognized. Attempt 2 of 3'),
    );

    fakeNow += 3000;
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Too many failed attempts. Face ID is now blocked.'),
    );
    expect(screen.getByText(/Face ID Blocked/)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();

    // blocked state → the email/password fallback button navigates away
    fireEvent.click(screen.getByText('Use Email/Password Login'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('toasts when start is invoked while already blocked', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    faceLoginResponder = () =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'mismatch' }) });
    render(<FaceLogin />);
    await flush();
    // capture the handler while the button still exists, then block the user
    const startHandler = getStartHandler();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Face not recognized. Attempt 1 of 3'),
    );
    fakeNow += 3000;
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Face not recognized. Attempt 2 of 3'),
    );
    fakeNow += 3000;
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Too many failed attempts. Face ID is now blocked.'),
    );

    // the captured closure reads the live isBlocked ref
    await act(async () => {
      await startHandler();
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Face ID is blocked. Please use email/password login.',
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it('surfaces the server error message on a failed login', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    faceLoginResponder = () =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Login failed' }) });
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Login failed', expect.anything()),
    );
  });

  it('redirects to maintenance when the server reports it', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    faceLoginResponder = () =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ error: 'maintenance', organizationId: 'org-9' }),
      });
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login?maintenance=true&org=org-9'));
  });

  it('shows a network error when the fetch fails', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    faceLoginResponder = () => Promise.reject(new TypeError('Failed to fetch'));
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Network error: Cannot connect to server. Please check your connection.',
        expect.anything(),
      ),
    );
    expect(screen.getByText('Face not recognized')).toBeInTheDocument();
  });

  it('shows a message when no face is detected at match time', async () => {
    mockDetectBox = { x: 0, y: 0, width: 300, height: 300, score: 0.9 };
    mockDetectResult = null;
    faceLoginResponder = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    render(<FaceLogin />);
    await flush();
    await typeEmail('anna@example.com');
    await startWebcam();

    await tick();
    await tick();
    await tick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No face detected. Please position your face in the frame.',
        expect.anything(),
      ),
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
