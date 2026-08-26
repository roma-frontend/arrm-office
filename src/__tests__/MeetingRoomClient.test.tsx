/**
 * Tests for MeetingRoomClient — the pre-join screen and the hand-off into a
 * real LiveKit room.
 *
 * Covers: the loading gate, the "meeting not found" card, the pre-join card
 * (name prefill, mic/camera toggles, back button releasing the camera), joining
 * with and without video (including the Room capture defaults built from the
 * remembered devices), a failed token mint, the in-call phase (status flips that
 * only a host may make, remembered speaker, in-call device switching, copy link,
 * leave) and the elapsed clock.
 *
 * Mocks: convex/react + generated api, next/navigation, the auth store, the
 * LiveKit kit (LiveKitRoom/usePreviewTracks), livekit-client's Room, the
 * CustomConference prefab, sonner, i18n and the two CSS side-effect imports.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));
jest.mock('@/i18n/config', () => ({ ensureAppNamespaces: jest.fn() }));

// ── Styles (side-effect imports jsdom cannot parse) ──────────────────────────
jest.mock('@livekit/components-styles', () => ({}));
jest.mock('@/components/meetings/meetings.css', () => ({}));

// ── Convex ───────────────────────────────────────────────────────────────────
const mockGetJoinToken = jest.fn(async (_args: { roomName: string }) => ({
  token: 'jwt-token',
  url: 'wss://livekit.example',
}));
const mockSetStatus = jest.fn(async (_args: { roomName: string; status: string }) => undefined);
let mockMeeting: unknown;

jest.mock('convex/react', () => ({
  useQuery: () => mockMeeting,
  useMutation: () => mockSetStatus,
  useAction: () => mockGetJoinToken,
}));
jest.mock('@/convex/_generated/api', () => ({
  api: {
    meetings: { getByRoomName: { _name: 'getByRoomName' }, setStatus: { _name: 'setStatus' } },
    meetingsActions: { getJoinToken: { _name: 'getJoinToken' } },
  },
}));

// ── Routing ──────────────────────────────────────────────────────────────────
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'room-42' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
  // The lobby reads `?invite=...` from the URL; tests run with no query.
  useSearchParams: () => new URLSearchParams(),
}));

// ── Auth ─────────────────────────────────────────────────────────────────────
let mockUser: { name?: string } | null = { name: 'Ada Lovelace' };
jest.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

// ── Toasts / motion ──────────────────────────────────────────────────────────
const mockToastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (msg: string) => mockToastError(msg) } }));
jest.mock('@/lib/cssMotion', () => ({
  motion: {
    div: ({ children, ...rest }: React.ComponentProps<'div'>) => <div {...rest}>{children}</div>,
  },
}));

// ── livekit-client (Room + the two helpers the child hooks call) ─────────────
const mockSwitchActiveDevice = jest.fn(async (_kind: string, _deviceId: string) => true);
const mockDisconnect = jest.fn();
const mockSetCameraEnabled = jest.fn();
const mockSetMicrophoneEnabled = jest.fn();
const roomOptions: unknown[] = [];
let mockRoomMetadata: string | undefined;

class MockRoom {
  localParticipant = {
    get metadata() {
      return mockRoomMetadata;
    },
    setCameraEnabled: mockSetCameraEnabled,
    setMicrophoneEnabled: mockSetMicrophoneEnabled,
  };
  switchActiveDevice = mockSwitchActiveDevice;
  disconnect = mockDisconnect;
  constructor(options: unknown) {
    roomOptions.push(options);
  }
}

jest.mock('livekit-client', () => ({
  Room: class {
    constructor(options: unknown) {
      return new MockRoom(options);
    }
  },
  supportsAudioOutputSelection: () => true,
  createAudioAnalyser: () => ({ calculateVolume: () => 0, cleanup: async () => undefined }),
}));

// ── LiveKit kit ──────────────────────────────────────────────────────────────
interface RoomProps {
  onConnected?: () => void | Promise<void>;
  onDisconnected?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  token?: string;
  serverUrl?: string;
  children?: React.ReactNode;
}
let lkProps: RoomProps = {};

type PreviewTrack = {
  kind: string;
  attach: jest.Mock;
  detach: jest.Mock;
  stop: jest.Mock;
  mute: jest.Mock;
  unmute: jest.Mock;
  getProcessor: () => undefined;
};

function makeTrack(kind: 'audio' | 'video'): PreviewTrack {
  return {
    kind,
    attach: jest.fn(),
    detach: jest.fn(),
    stop: jest.fn(),
    mute: jest.fn(),
    unmute: jest.fn(),
    getProcessor: () => undefined,
  };
}

// Stable identities: `usePreviewTracks` returning a fresh array (or fresh
// tracks) on every render would re-run the component's preview effects forever.
const previewAudioTrack = makeTrack('audio');
const previewVideoTrack = makeTrack('video');
const previewTracks: PreviewTrack[] = [previewAudioTrack, previewVideoTrack];
let mockPreviewTracks: PreviewTrack[] | undefined = previewTracks;

jest.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: RoomProps) => {
    lkProps = props;
    return <div data-testid="livekit-room">{props.children}</div>;
  },
  RoomAudioRenderer: () => <div data-testid="audio-renderer" />,
  usePreviewTracks: () => mockPreviewTracks,
}));

// ── The in-call prefab (its own suite covers the internals) ──────────────────
interface ConferenceProps {
  title: string;
  statusKey: string;
  elapsed: number;
  mode?: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
  onDeviceChange: (kind: string, deviceId: string) => void;
}
jest.mock('@/components/meetings/CustomConference', () => ({
  CustomConference: (props: ConferenceProps) => (
    <div data-testid="conference">
      <span data-testid="conf-title">{props.title}</span>
      <span data-testid="conf-status">{props.statusKey}</span>
      <span data-testid="conf-elapsed">{props.elapsed}</span>
      <span data-testid="conf-copied">{String(props.linkCopied)}</span>
      <button type="button" onClick={() => props.onCopyLink()}>
        copy
      </button>
      <button type="button" onClick={() => props.onLeave()}>
        leave
      </button>
      <button type="button" onClick={() => props.onDeviceChange('audioinput', 'mic-2')}>
        switch
      </button>
    </div>
  ),
}));

// Never load MediaPipe in jsdom: the picker only needs a support answer.
jest.mock('@livekit/track-processors', () => ({
  ProcessorWrapper: { isSupported: false },
  BackgroundTransformer: { isSupported: false },
  BackgroundBlur: jest.fn(),
  VirtualBackground: jest.fn(),
}));

import { MeetingRoomClient } from '@/components/meetings/MeetingRoomClient';

const MEETING = {
  _id: 'm1',
  roomName: 'room-42',
  status: 'scheduled',
  mode: 'meeting',
  event: { title: 'Design sync', description: 'Weekly design review' },
};

const mockWriteText = jest.fn(async (_text: string) => undefined);

function renderRoom() {
  return act(async () => {
    render(<MeetingRoomClient />);
  });
}

/** Clicks a join button and lets the token promise settle. */
function clickJoin(name = 'meetings.joinNow') {
  return act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMeeting = MEETING;
  mockUser = { name: 'Ada Lovelace' };
  mockRoomMetadata = undefined;
  mockPreviewTracks = previewTracks;
  roomOptions.length = 0;
  lkProps = {};
  window.localStorage.clear();
  mockGetJoinToken.mockImplementation(async () => ({
    token: 'jwt-token',
    url: 'wss://livekit.example',
  }));
  mockSwitchActiveDevice.mockImplementation(async () => true);
  mockWriteText.mockImplementation(async () => undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: async () => [],
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  });
});

describe('MeetingRoomClient — loading and missing room', () => {
  it('shows a skeleton while the room is still being fetched', async () => {
    mockMeeting = undefined;
    const { container } = render(<MeetingRoomClient />);

    expect(container.querySelector('.h-64')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'meetings.joinNow' })).not.toBeInTheDocument();
  });

  it('explains an unknown room and offers a way back', async () => {
    mockMeeting = null;
    await renderRoom();

    expect(screen.getByText('meetings.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByText('meetings.notFoundDesc')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /meetings.backToDashboard/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});

describe('MeetingRoomClient — pre-join', () => {
  it('prefills the name from the signed-in user and shows the event', async () => {
    await renderRoom();

    expect(screen.getByPlaceholderText('meetings.namePlaceholder')).toHaveValue('Ada Lovelace');
    expect(screen.getByText('Design sync')).toBeInTheDocument();
    expect(screen.getByText('Weekly design review')).toBeInTheDocument();
    expect(screen.getByText('meetings.meeting')).toBeInTheDocument();
    expect(screen.getByText('meetings.secureNote')).toBeInTheDocument();
  });

  it('leaves the name empty for a signed-out visitor and accepts typing', async () => {
    mockUser = null;
    await renderRoom();

    const input = screen.getByPlaceholderText('meetings.namePlaceholder');
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'Guest' } });
    expect(input).toHaveValue('Guest');
  });

  it('labels a webinar as such', async () => {
    mockMeeting = { ...MEETING, mode: 'webinar' };
    await renderRoom();
    expect(screen.getByText('meetings.webinar')).toBeInTheDocument();
  });
});

describe('MeetingRoomClient — preview controls', () => {
  it('attaches the camera track to the preview element', async () => {
    await renderRoom();
    expect(previewVideoTrack.attach).toHaveBeenCalledTimes(1);
  });

  it('mutes and unmutes the preview microphone with the toggle', async () => {
    await renderRoom();

    const mic = screen.getByTitle('meetings.micOn');
    expect(mic).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(mic);
    expect(previewAudioTrack.mute).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('meetings.micOff')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTitle('meetings.micOff'));
    expect(previewAudioTrack.unmute).toHaveBeenCalled();
  });

  it('covers the preview when the camera is switched off', async () => {
    await renderRoom();

    fireEvent.click(screen.getByTitle('meetings.camOn'));
    expect(screen.getByTitle('meetings.camOff')).toHaveAttribute('aria-pressed', 'false');
  });

  it('survives a preview that never produced any track', async () => {
    mockPreviewTracks = undefined;
    await renderRoom();

    expect(screen.getByRole('button', { name: 'meetings.joinNow' })).toBeEnabled();
    // No camera → the background picker says so instead of offering tiles.
    expect(screen.getByText('meetings.effects.needsCamera')).toBeInTheDocument();
  });

  it('releases the camera before navigating back', async () => {
    await renderRoom();

    fireEvent.click(screen.getByTitle('Back'));
    expect(previewVideoTrack.stop).toHaveBeenCalledTimes(1);
    expect(previewAudioTrack.stop).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('MeetingRoomClient — joining', () => {
  it('mints a token and hands the remembered devices to the Room', async () => {
    window.localStorage.setItem(
      'hr-meeting-devices',
      JSON.stringify({ audioinput: 'mic-1', videoinput: 'cam-1', audiooutput: 'out-1' }),
    );
    await renderRoom();
    await clickJoin();

    expect(mockGetJoinToken).toHaveBeenCalledWith({ roomName: 'room-42' });
    expect(roomOptions[0]).toMatchObject({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        deviceId: 'mic-1',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        deviceId: 'cam-1',
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
    });
    expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
    expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    // The preview must let go of the camera before the Room asks for it.
    expect(previewVideoTrack.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('conference')).toBeInTheDocument();
    expect(screen.getByTestId('conf-title')).toHaveTextContent('Design sync');
    expect(lkProps.token).toBe('jwt-token');
    expect(lkProps.serverUrl).toBe('wss://livekit.example');
  });

  it('leaves the device defaults undefined when nothing was remembered', async () => {
    await renderRoom();
    await clickJoin();

    expect(roomOptions[0]).toMatchObject({
      audioCaptureDefaults: { deviceId: undefined },
      videoCaptureDefaults: { deviceId: undefined },
    });
  });

  it('joins without video on request', async () => {
    await renderRoom();
    await clickJoin('meetings.joinWithoutVideo');

    expect(mockSetCameraEnabled).toHaveBeenCalledWith(false);
    expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('respects the pre-join toggles', async () => {
    await renderRoom();
    fireEvent.click(screen.getByTitle('meetings.camOn'));
    fireEvent.click(screen.getByTitle('meetings.micOn'));
    await clickJoin();

    expect(mockSetCameraEnabled).toHaveBeenCalledWith(false);
    expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('shows why the token could not be minted and stays on the pre-join card', async () => {
    mockGetJoinToken.mockRejectedValueOnce(new Error('not a member of this organization'));
    await renderRoom();
    await clickJoin();

    expect(screen.getByText(/not a member of this organization/)).toBeInTheDocument();
    expect(screen.queryByTestId('conference')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'meetings.joinNow' })).toBeEnabled();
  });

  it('reports a rejection that is not an Error', async () => {
    mockGetJoinToken.mockRejectedValueOnce('room is full');
    await renderRoom();
    await clickJoin();

    expect(screen.getByText(/room is full/)).toBeInTheDocument();
  });
});

describe('MeetingRoomClient — in call', () => {
  async function enterCall(metadata?: string) {
    mockRoomMetadata = metadata;
    await renderRoom();
    await clickJoin();
  }

  const HOST = JSON.stringify({ role: 'host' });

  it('applies the remembered speaker and marks the meeting live for a host', async () => {
    window.localStorage.setItem('hr-meeting-devices', JSON.stringify({ audiooutput: 'out-1' }));
    await enterCall(HOST);

    await act(async () => {
      await lkProps.onConnected?.();
    });

    expect(mockSwitchActiveDevice).toHaveBeenCalledWith('audiooutput', 'out-1');
    expect(mockSetStatus).toHaveBeenCalledWith({ roomName: 'room-42', status: 'live' });
  });

  it('does not let a guest flip the status', async () => {
    await enterCall(JSON.stringify({ role: 'viewer' }));

    await act(async () => {
      await lkProps.onConnected?.();
    });

    expect(mockSwitchActiveDevice).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('treats unreadable participant metadata as "not a host"', async () => {
    await enterCall('{not json');

    await act(async () => {
      await lkProps.onConnected?.();
      await lkProps.onDisconnected?.();
    });

    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('keeps going when the speaker is gone and the status write fails', async () => {
    window.localStorage.setItem('hr-meeting-devices', JSON.stringify({ audiooutput: 'out-1' }));
    mockSwitchActiveDevice.mockRejectedValueOnce(new Error('device unplugged'));
    mockSetStatus.mockRejectedValueOnce(new Error('offline'));
    await enterCall(HOST);

    await act(async () => {
      await lkProps.onConnected?.();
    });

    expect(screen.getByTestId('conference')).toBeInTheDocument();
  });

  it('ends the meeting and returns to the pre-join card on disconnect', async () => {
    await enterCall(HOST);

    await act(async () => {
      await lkProps.onDisconnected?.();
    });

    expect(mockSetStatus).toHaveBeenCalledWith({ roomName: 'room-42', status: 'ended' });
    expect(screen.queryByTestId('conference')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'meetings.joinNow' })).toBeInTheDocument();
  });

  it('surfaces a room error but ignores a deliberate hang-up', async () => {
    await enterCall();

    act(() => {
      lkProps.onError?.(new Error('Client initiated disconnect'));
    });
    expect(mockToastError).not.toHaveBeenCalled();

    act(() => {
      lkProps.onError?.(new Error('signal connection failed'));
    });
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('signal connection failed'),
    );
  });
});

describe('MeetingRoomClient — in-call actions', () => {
  async function enterCall() {
    await renderRoom();
    await clickJoin();
  }

  it('remembers an in-call device switch and moves the live track over', async () => {
    await enterCall();

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(mockSwitchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-2');
    expect(window.localStorage.getItem('hr-meeting-devices')).toContain('mic-2');
  });

  it('warns when the live track refuses to move', async () => {
    mockSwitchActiveDevice.mockRejectedValueOnce(new Error('NotReadableError'));
    await enterCall();

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('meetings.actionFailed'));
  });

  it('copies the room link', async () => {
    await enterCall();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    });

    expect(mockWriteText).toHaveBeenCalledWith(`${window.location.origin}/meetings/room-42`);
    expect(screen.getByTestId('conf-copied')).toHaveTextContent('true');
  });

  it('warns when the clipboard is unavailable', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('denied'));
    await enterCall();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    });

    expect(mockToastError).toHaveBeenCalledWith('meetings.copyFailed');
    expect(screen.getByTestId('conf-copied')).toHaveTextContent('false');
  });

  it('disconnects and navigates away on leave', async () => {
    await enterCall();

    fireEvent.click(screen.getByRole('button', { name: 'leave' }));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/calendar');
  });

  it('passes a live status through and falls back for an unknown one', async () => {
    mockMeeting = { ...MEETING, status: 'live' };
    await enterCall();
    expect(screen.getByTestId('conf-status')).toHaveTextContent('live');
  });

  it('falls back to "scheduled" for a status it does not publish', async () => {
    mockMeeting = { ...MEETING, status: 'archived' };
    await enterCall();
    expect(screen.getByTestId('conf-status')).toHaveTextContent('scheduled');
  });

  it('names an event-less room', async () => {
    mockMeeting = { ...MEETING, event: undefined };
    await renderRoom();
    expect(screen.getAllByText('meetings.untitled').length).toBeGreaterThan(0);
  });
});

describe('MeetingRoomClient — elapsed clock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts seconds from the join, not from the epoch', async () => {
    await renderRoom();
    await clickJoin();

    expect(screen.getByTestId('conf-elapsed')).toHaveTextContent('0');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('conf-elapsed')).toHaveTextContent('2');
  });

  it('clears the copied badge a moment later', async () => {
    await renderRoom();
    await clickJoin();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    });
    expect(screen.getByTestId('conf-copied')).toHaveTextContent('true');

    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(screen.getByTestId('conf-copied')).toHaveTextContent('false');
  });

  it('resets the clock when the call ends', async () => {
    await renderRoom();
    await clickJoin();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('conf-elapsed')).toHaveTextContent('3');

    await act(async () => {
      await lkProps.onDisconnected?.();
    });
    // Back on the pre-join card, and re-joining starts from zero again.
    await clickJoin();
    expect(screen.getByTestId('conf-elapsed')).toHaveTextContent('0');
  });
});
