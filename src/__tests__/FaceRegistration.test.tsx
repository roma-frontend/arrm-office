/**
 * Tests for FaceRegistration (src/components/auth/FaceRegistration.tsx) — the
 * face-ID registration widget: model loading on mount, camera enumeration and
 * selection, webcam start with all getUserMedia error paths (unsupported,
 * permission denied, no camera, in-use, generic), the video-wait fallback,
 * stop webcam, the detection loop driving the "Face Detected" badge, and the
 * capture flow (no face, upload + register success, registration failure).
 *
 * The video element is provided by jsdom; HTMLMediaElement.play is stubbed.
 * The webcam start chain runs on real timers and is pumped with real
 * macrotasks until onloadedmetadata is attached; the detection interval is
 * captured via a setInterval spy and driven deterministically.
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mutable fixtures (declared before jest.mock factories reference them) ─────
let mockCameras: Array<{ kind: string; deviceId: string; label: string }> = [];
let getUserMediaImpl: () => Promise<any> = () => Promise.resolve(null);
let mockDetectBox: any = null;
let mockDetectResult: any = null;
let mockErrName = '';
let mockErrMsg = 'camera exploded';
let mockModelsReject = false;
let mockUploadUrl = 'https://cdn.example/face.jpg';
let mockUploadReject = false;
let intervalCallback: (() => Promise<void>) | null = null;
const mockMutation = jest.fn();

// ── i18n ─────────────────────────────────────────────────────────────────────
// The component puts `t` in a useEffect dependency array, so the t function
// must be referentially stable — a fresh arrow per render would re-run the
// mount effect forever (loadFaceApiModels + enumerateDevices on every render).
jest.mock('react-i18next', () => {
  const stableT = (key: string, fallback?: string, options?: { message?: string }) => {
    let text = typeof fallback === 'string' ? fallback : key;
    if (options?.message) text = text.replace('{{message}}', options.message);
    return text;
  };
  return {
    useTranslation: () => ({ t: stableT, i18n: { language: 'en' } }),
  };
});

// ── Convex ───────────────────────────────────────────────────────────────────
jest.mock('convex/react', () => ({
  useMutation: () => mockMutation,
}));

jest.mock('../../convex/_generated/api', () => ({
  api: { faceRecognition: { registerFace: { _name: 'registerFace' } } },
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
  const iconNames = ['Camera', 'CheckCircle', 'XCircle'];
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

jest.mock('next/image', () => {
  const ReactMod = require('react');
  return {
    __esModule: true,
    default: (props: any) => ReactMod.createElement('img', { ...props, alt: props.alt ?? '' }),
  };
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
  loadFaceApiModels: jest.fn(() =>
    mockModelsReject ? Promise.reject(new Error('model boom')) : Promise.resolve(),
  ),
  createCanvasFromVideo: jest.fn(() => ({
    toDataURL: jest.fn(() => 'data:image/jpeg;base64,AAAA'),
  })),
}));

jest.mock('@/actions/cloudinary', () => ({
  uploadAvatarToCloudinary: jest.fn(() =>
    mockUploadReject ? Promise.reject(new Error('upload boom')) : Promise.resolve(mockUploadUrl),
  ),
}));

// ── Component ────────────────────────────────────────────────────────────────
import { FaceRegistration } from '@/components/auth/FaceRegistration';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { detectFaceBox, detectFace, loadFaceApiModels } from '@/lib/faceApi';
import { uploadAvatarToCloudinary } from '@/actions/cloudinary';

function makeStream() {
  return {
    getTracks: () => [{ stop: jest.fn() }, { stop: jest.fn() }],
  };
}

beforeEach(() => {
  mockCameras = [
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam 1' },
    { kind: 'audioinput', deviceId: 'aud-1', label: 'Mic' },
  ];
  getUserMediaImpl = () => Promise.resolve(makeStream());
  mockDetectBox = null;
  mockDetectResult = null;
  mockErrName = '';
  mockErrMsg = 'camera exploded';
  mockModelsReject = false;
  mockUploadUrl = 'https://cdn.example/face.jpg';
  mockUploadReject = false;
  intervalCallback = null;
  mockMutation.mockReset();
  (logger.error as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
  (logger.log as jest.Mock).mockClear();
  (toast.error as jest.Mock).mockClear();
  (toast.success as jest.Mock).mockClear();
  (detectFaceBox as jest.Mock).mockClear();
  (detectFace as jest.Mock).mockClear();
  (loadFaceApiModels as jest.Mock).mockClear();
  (uploadAvatarToCloudinary as jest.Mock).mockClear();
  jest.restoreAllMocks();

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: jest.fn(async () => mockCameras),
      getUserMedia: jest.fn(() => getUserMediaImpl()),
    },
  });
  (HTMLMediaElement.prototype.play as any) = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(window, 'setInterval').mockImplementation((cb: any, ms?: number) => {
    intervalCallback = cb as () => Promise<void>;
    return 123 as any;
  });
  jest.spyOn(window, 'clearInterval').mockImplementation(() => {});
  jest.spyOn(window, 'setTimeout'); // call-through real timers
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderComponent(onSuccess?: () => void, onCancel?: () => void) {
  return render(<FaceRegistration userId="user-1" onSuccess={onSuccess} onCancel={onCancel} />);
}

/**
 * Start the webcam and pump the event loop until onloadedmetadata is attached,
 * then fire it so the detection interval arms.
 */
async function startWebcam(options: { ready?: boolean } = {}) {
  const { ready = true } = options;
  fireEvent.click(screen.getByText('Start Camera'));
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
  if (ready) {
    Object.defineProperty(video!, 'readyState', { value: 4, configurable: true });
    await act(async () => {
      (video as any).onloadedmetadata();
    });
  }
  return video;
}

/** Drive one detection-frame tick. */
async function tick() {
  await act(async () => {
    await intervalCallback!();
  });
}

/** Grab the real onClick handler React attached to a button. */
function getClickHandler(text: string) {
  const btn = screen.getByText(text);
  const key = Object.keys(btn).find((k) => k.startsWith('__reactProps'));
  expect(key).toBeTruthy();
  return (btn as any)[key!].onClick as () => void;
}

describe('FaceRegistration — mount and models', () => {
  it('renders the title, subtitle and instructions', async () => {
    renderComponent();
    await flush();
    expect(screen.getByText('Register Face ID')).toBeInTheDocument();
    expect(
      screen.getByText('Position your face in the camera frame to register Face ID login'),
    ).toBeInTheDocument();
    expect(screen.getByText('Camera not active')).toBeInTheDocument();
    expect(screen.getByText('Start Camera')).toBeInTheDocument();
    expect(loadFaceApiModels).toHaveBeenCalled();
  });

  it('reports when face models fail to load', async () => {
    mockModelsReject = true;
    renderComponent();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load face recognition models'),
    );
  });

  it('enumerates cameras and hides the selector for one video device', async () => {
    renderComponent();
    await waitFor(() =>
      expect(logger.log).toHaveBeenCalledWith('Available cameras:', expect.anything()),
    );
    expect(screen.queryByTestId('custom-select')).toBeNull();
  });

  it('shows the camera selector when several video devices exist', async () => {
    mockCameras = [
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam 1' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Webcam 2' },
    ];
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('custom-select')).toBeInTheDocument());
    expect(screen.getByText('Webcam 1')).toBeInTheDocument();
    expect(screen.getByText('Webcam 2')).toBeInTheDocument();
  });

  it('logs and swallows enumeration failures', async () => {
    (navigator.mediaDevices.enumerateDevices as jest.Mock).mockRejectedValueOnce(
      new Error('no perms'),
    );
    renderComponent();
    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('Failed to enumerate devices:', expect.anything()),
    );
  });
});

describe('FaceRegistration — webcam start and stop', () => {
  it('starts the webcam and shows the live controls', async () => {
    renderComponent();
    await startWebcam();
    expect(screen.getByText('Capture & Register')).toBeInTheDocument();
    expect(screen.getByText('No Face')).toBeInTheDocument();
  });

  it('uses the selected camera id in the constraints', async () => {
    mockCameras = [
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam 1' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Webcam 2' },
    ];
    renderComponent();
    await waitFor(() => screen.getByTestId('opt-cam-2'));
    fireEvent.click(screen.getByTestId('opt-cam-2'));
    await startWebcam();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: 'cam-2' } }),
      }),
    );
  });

  it('uses the default user-facing constraints without a selection', async () => {
    mockCameras = [];
    renderComponent();
    await startWebcam();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) }),
    );
  });

  it('reports when video playback fails', async () => {
    (HTMLMediaElement.prototype.play as any).mockRejectedValueOnce(new Error('play boom'));
    renderComponent();
    await startWebcam();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to start video playback'));
  });

  it('stops the webcam on demand', async () => {
    renderComponent();
    await startWebcam();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Start Camera')).toBeInTheDocument();
    expect(screen.queryByText('Capture & Register')).toBeNull();
  });

  it('reports unsupported browsers', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera access is not supported in this browser. Please use Chrome, Edge, or Firefox.',
      ),
    );
  });

  it('reports permission denial', async () => {
    mockErrName = 'NotAllowedError';
    getUserMediaImpl = () => Promise.reject(new Error('denied'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera permission denied. Please allow camera access in your browser settings.',
      ),
    );
  });

  it('reports permission denial under the legacy name', async () => {
    mockErrName = 'PermissionDeniedError';
    getUserMediaImpl = () => Promise.reject(new Error('denied'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Camera permission denied. Please allow camera access in your browser settings.',
      ),
    );
  });

  it('reports when no camera is found', async () => {
    mockErrName = 'NotFoundError';
    getUserMediaImpl = () => Promise.reject(new Error('not found'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No camera found. Please connect a camera and try again.',
      ),
    );
  });

  it('reports when the camera is in use', async () => {
    mockErrName = 'NotReadableError';
    getUserMediaImpl = () => Promise.reject(new Error('busy'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Camera is already in use by another application.'),
    );
  });

  it('reports a generic camera error with the message', async () => {
    mockErrName = 'SomethingElseError';
    mockErrMsg = 'very broken';
    getUserMediaImpl = () => Promise.reject(new Error('broken'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Unable to access camera: very broken'),
    );
  });

  it('resets the webcam state after a generic error', async () => {
    mockErrName = 'Generic';
    getUserMediaImpl = () => Promise.reject(new Error('boom'));
    renderComponent();
    fireEvent.click(screen.getByText('Start Camera'));
    await waitFor(() => expect(screen.getByText('Start Camera')).toBeInTheDocument());
  });

  it('resets state when the video element never appears', async () => {
    // Force the video element to render without a ref by detaching it from the
    // DOM the moment it appears — the waitForVideoElement loop checks
    // videoRef.current, so a plain querySelector stub would not exercise it.
    const originalQuery = document.querySelector.bind(document);
    jest.spyOn(document, 'querySelector').mockImplementation((sel: string) => {
      const found = originalQuery(sel);
      if (sel === 'video' && found) {
        found.remove();
        return null;
      }
      return found;
    });
    renderComponent();
    const handler = getClickHandler('Start Camera');
    await act(async () => {
      await handler();
    });
    // Stream is stopped, the toast fired and the idle screen is back.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Video element not found. Please try again.'),
    );
    expect(screen.getByText('Start Camera')).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith('❌ Video element ref is null after waiting!');
  });
});

describe('FaceRegistration — detection loop', () => {
  it('shows the Face Detected badge when a face is found', async () => {
    mockDetectBox = { x: 1, y: 1 };
    renderComponent();
    await startWebcam();
    await tick();
    expect(screen.getByText('Face Detected')).toBeInTheDocument();
    expect(screen.queryByText('No Face')).toBeNull();
  });

  it('keeps No Face when the detector finds nothing', async () => {
    renderComponent();
    await startWebcam();
    await tick();
    expect(screen.getByText('No Face')).toBeInTheDocument();
  });

  it('waits for the video to be ready before detecting', async () => {
    renderComponent();
    const video = await startWebcam({ ready: true });
    // Reset readyState below 2 → the interval guard logs and skips.
    Object.defineProperty(video!, 'readyState', { value: 0, configurable: true });
    await tick();
    expect(logger.log).toHaveBeenCalledWith(
      '⏳ Video not ready yet, readyState:',
      expect.anything(),
    );
    expect(detectFaceBox).not.toHaveBeenCalled();
  });

  it('stops the loop when the video ref disappears mid-run', async () => {
    const view = renderComponent();
    await startWebcam();
    // Unmounting nulls the ref; the interval keeps its captured callback.
    view.unmount();
    await tick();
    expect(logger.log).toHaveBeenCalledWith('🛑 Stopping face detection loop - videoRef is null');
  });

  it('logs a detection-loop error without crashing', async () => {
    (detectFaceBox as jest.Mock).mockRejectedValueOnce(new Error('detector crash'));
    renderComponent();
    await startWebcam();
    await tick();
    expect(logger.error).toHaveBeenCalledWith('Error in face detection loop:', expect.anything());
  });
});

describe('FaceRegistration — capture and register', () => {
  it('warns when no face is detected on capture', async () => {
    renderComponent();
    await startWebcam();
    // The button is disabled while no face is detected — invoke the handler
    // directly to reach the defensive no-face path.
    const handler = getClickHandler('Capture & Register');
    await act(async () => {
      await handler();
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No face detected. Please position your face in the frame.',
      ),
    );
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it('captures, uploads and registers a face', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1, 0.2, 0.3]) };
    const onSuccess = jest.fn();
    renderComponent(onSuccess);
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
    expect(uploadAvatarToCloudinary).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      'face-user-1',
    );
    const arg = mockMutation.mock.calls[0][0] as any;
    expect(arg.userId).toBe('user-1');
    // Float32Array round-trips through Array.from with float32 rounding.
    expect(Array.from(arg.faceDescriptor as Float32Array).map((n) => Number(n.toFixed(1)))).toEqual(
      [0.1, 0.2, 0.3],
    );
    expect(arg.faceImageUrl).toBe('https://cdn.example/face.jpg');
    expect(toast.success).toHaveBeenCalledWith(
      'Face registered successfully! You can now use Face ID to login.',
    );
    expect(onSuccess).toHaveBeenCalled();
    // Webcam stopped and the captured image replaces the live view.
    await waitFor(() => expect(screen.getByAltText('Captured face')).toBeInTheDocument());
  });

  it('shows the captured image after registration', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1]) };
    renderComponent();
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await waitFor(() => expect(screen.getByAltText('Captured face')).toBeInTheDocument());
  });

  it('calls onCancel from the Close button after capture', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1]) };
    const onCancel = jest.fn();
    renderComponent(undefined, onCancel);
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await waitFor(() => screen.getByText('Close'));
    fireEvent.click(screen.getByText('Close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('reports a registration failure and keeps the webcam state', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1]) };
    mockMutation.mockRejectedValueOnce(new Error('db boom'));
    renderComponent();
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to register face. Please try again.'),
    );
    expect(logger.error).toHaveBeenCalledWith('Error capturing face:', expect.anything());
  });

  it('reports an upload failure', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1]) };
    mockUploadReject = true;
    renderComponent();
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to register face. Please try again.'),
    );
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it('shows the processing state while capturing', async () => {
    mockDetectBox = { x: 1, y: 1 };
    mockDetectResult = { descriptor: new Float32Array([0.1]) };
    (detectFace as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(mockDetectResult), 100)),
    );
    renderComponent();
    await startWebcam();
    await tick();
    fireEvent.click(screen.getByText('Capture & Register'));
    await flush();
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
  });
});
