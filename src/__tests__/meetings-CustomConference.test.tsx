/**
 * Tests for CustomConference — the in-call UI built on raw LiveKit primitives.
 *
 * Covers: the header (title, status chip, elapsed clock, mode, copy link,
 * recording indicator, avatar stack), the tiles (initials fallback, speaking
 * glow, mic/camera badges, connection quality, screen-share focus, pin/unpin,
 * grid ↔ speaker and the sticky active speaker), the dock (device toggles and
 * their rejection toasts, raise hand, reactions, chat, the participants panel,
 * settings with DeviceSettings + BackgroundPicker + the Krisp switch, captions,
 * keyboard shortcuts including hold-Space push-to-talk, fullscreen), host
 * controls (mute mic/camera, ask to unmute, mute everyone, remove — each
 * through its convex action) plus cloud recording (start/stop/pending/failure)
 * and inbound data-channel traffic (hands, host commands, reactions, captions
 * and malformed payloads).
 *
 * Mocks: every `@livekit/components-react` hook the component calls — with
 * stable object identities so the effects settle instead of looping — plus
 * `@livekit/components-react/krisp`, livekit-client, the two lazily imported
 * WASM packages, convex/react + the generated api, sonner and i18n.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';

// ── i18n ─────────────────────────────────────────────────────────────────────
// One stable `t` and one stable hook result: the presence-toast effect lists
// `t` in its dependencies, so a fresh function per render would re-run it.
const translate = (key: string, options?: unknown) => (typeof options === 'string' ? options : key);
const translation = { t: translate, i18n: { language: 'en' } };
jest.mock('react-i18next', () => ({ useTranslation: () => translation }));

// ── livekit-client ───────────────────────────────────────────────────────────
// Enum values are spelled out as strings so the test can set a quality without
// importing the real (numeric) enum.
jest.mock('livekit-client', () => ({
  ConnectionQuality: {
    Unknown: 'unknown',
    Excellent: 'excellent',
    Good: 'good',
    Poor: 'poor',
    Lost: 'lost',
  },
  Track: { Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screen_share' } },
  supportsAudioOutputSelection: () => true,
  createAudioAnalyser: () => ({ calculateVolume: () => 0, cleanup: async () => undefined }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
type FakeParticipant = {
  identity: string;
  sid: string;
  name?: string;
  metadata?: string;
  setMicrophoneEnabled: jest.Mock;
  setCameraEnabled: jest.Mock;
};
type FakeTrack = { attach: jest.Mock; detach: jest.Mock; getProcessor: () => undefined };
type TrackRef = {
  publication: { track?: FakeTrack; isMuted: boolean };
  participant?: FakeParticipant;
};
type ChatMsg = {
  id: string;
  message: string;
  timestamp: number;
  from?: { identity: string; name?: string };
};

const HOST_META = JSON.stringify({ role: 'host' });

function makeParticipant(identity: string, name?: string, metadata?: string): FakeParticipant {
  return {
    identity,
    sid: `sid-${identity}`,
    name,
    metadata,
    setMicrophoneEnabled: jest.fn(async () => undefined),
    setCameraEnabled: jest.fn(async () => undefined),
  };
}

function makeTrack(): FakeTrack {
  return { attach: jest.fn(), detach: jest.fn(), getProcessor: () => undefined };
}

function pub(track?: FakeTrack, isMuted = false, participant?: FakeParticipant): TrackRef {
  return { publication: { track, isMuted }, participant };
}

const NO_TRACKS: TrackRef[] = [];

// ── LiveKit hooks ────────────────────────────────────────────────────────────
// Every value lives in this one mutable object; tests reassign a field *before*
// rendering. Arrays and participant objects are only ever replaced wholesale, so
// the identities a render sees stay stable and the effects settle.
const lk = {
  localParticipant: undefined as FakeParticipant | undefined,
  cameraTrack: undefined as { track?: FakeTrack } | undefined,
  participants: [] as FakeParticipant[],
  speaking: [] as FakeParticipant[],
  connectionState: 'connected',
  isRecording: false,
  tracks: {} as Record<string, Record<string, TrackRef[]>>,
  screenShares: [] as TrackRef[],
  chatMessages: [] as ChatMsg[],
  quality: {} as Record<string, string>,
  toggles: {
    microphone: { enabled: true, toggle: jest.fn(async () => undefined) },
    camera: { enabled: true, toggle: jest.fn(async () => undefined) },
    screen_share: { enabled: false, toggle: jest.fn(async () => undefined) },
  } as Record<string, { enabled: boolean; toggle: jest.Mock }>,
};

/** Latest `useDataChannel` subscriber per topic, so tests can deliver a packet. */
const dataHandlers: Record<string, (msg: unknown) => void> = {};
/** One stable publisher per topic. */
const dataSends: Record<string, jest.Mock> = {};
const dataChannels: Record<string, { send: jest.Mock }> = {};
const mockChatSend = jest.fn(async (_text: string) => undefined);

jest.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => ({
    localParticipant: lk.localParticipant,
    cameraTrack: lk.cameraTrack,
  }),
  useParticipants: () => lk.participants,
  useSpeakingParticipants: () => lk.speaking,
  useConnectionState: () => lk.connectionState,
  useIsRecording: () => lk.isRecording,
  useParticipantTracks: (sources: unknown[], identity: string) => {
    // The real hook accepts `Track.Source.*` enum objects; the test stores
    // tracks under their string form (`"microphone"`, `"camera"`). The mock
    // enum has a single key whose value is the lowercase string, so pluck
    // the value out of the enum object directly.
    const source = sources[0] as { Microphone?: string; Camera?: string } | string | undefined;
    const sourceKey = typeof source === 'string' ? source : source?.Microphone ?? source?.Camera ?? '';
    return lk.tracks[identity]?.[sourceKey] ?? NO_TRACKS;
  },
  useTracks: () => lk.screenShares,
  useTrackToggle: ({ source }: { source: string }) => lk.toggles[source],
  useChat: () => ({ chatMessages: lk.chatMessages, send: mockChatSend }),
  useConnectionQualityIndicator: ({ participant }: { participant: FakeParticipant }) => ({
    quality: lk.quality[participant.identity] ?? 'excellent',
  }),
  useDataChannel: (topic: string, onMessage?: (msg: unknown) => void) => {
    if (onMessage) dataHandlers[topic] = onMessage;
    dataSends[topic] ??= jest.fn(async () => undefined);
    dataChannels[topic] ??= { send: dataSends[topic]! };
    return dataChannels[topic];
  },
}));

// ── Krisp / MediaPipe (never load WASM in jsdom) ──────────────────────────────
const krisp = {
  isNoiseFilterEnabled: false,
  isNoiseFilterPending: false,
  setNoiseFilterEnabled: jest.fn(async (_on: boolean) => undefined),
};
jest.mock('@livekit/components-react/krisp', () => ({ useKrispNoiseFilter: () => krisp }));
jest.mock('@livekit/krisp-noise-filter', () => ({ isKrispNoiseFilterSupported: () => true }));
// `processorsSupported` reads these two getters — false keeps every effect
// deterministic ("unsupported") without touching a canvas.
jest.mock('@livekit/track-processors', () => ({
  ProcessorWrapper: { isSupported: false },
  BackgroundTransformer: { isSupported: false },
  BackgroundBlur: jest.fn(),
  VirtualBackground: jest.fn(),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const queries: Record<string, unknown> = {};
const actions: Record<string, jest.Mock> = {
  removeParticipant: jest.fn(async () => undefined),
  muteParticipantTrack: jest.fn(async () => undefined),
  muteEveryone: jest.fn(async () => undefined),
  startRecording: jest.fn(async () => ({ configured: true, alreadyRunning: false })),
  stopRecording: jest.fn(async () => undefined),
  // Host rotation (Zoom-style). The tests do not exercise the rotation flow
  // directly, but CustomConference eagerly subscribes; the mocks just need to
  // exist so the queries/actions resolve.
  assignCohost: jest.fn(async () => ({ ok: true, cohostIds: [] })),
  reclaimHost: jest.fn(async () => ({ ok: true, demoted: 0 })),
  admitRegistration: jest.fn(async () => ({
    success: true,
    inviteToken: 'mock-token',
    inviteUrl: '/meetings/room-42?invite=mock-token',
    expiresAt: Date.now() + 30 * 60 * 1000,
    guestName: 'Guest',
  })),
};
const mutations: Record<string, jest.Mock> = {
  // New mutation powering the in-call settings panel; tests that toggle the
  // waiting room or registration form rely on this to resolve.
  updateLobbyAndRegistration: jest.fn(async () => ({ success: true })),
  removeRegistration: jest.fn(async () => ({ success: true })),
};
jest.mock('convex/react', () => ({
  useQuery: (ref: { _name: string }) => queries[ref._name],
  useAction: (ref: { _name: string }) => actions[ref._name],
  useMutation: (ref: { _name: string }) => mutations[ref._name],
}));
jest.mock('@/convex/_generated/api', () => ({
  api: {
    meetings: {
      recordingConfigured: { _name: 'recordingConfigured' },
      getByRoomName: { _name: 'getByRoomName' },
      listPending: { _name: 'listPending' },
      listRegistrations: { _name: 'listRegistrations' },
      updateLobbyAndRegistration: { _name: 'updateLobbyAndRegistration' },
      removeRegistration: { _name: 'removeRegistration' },
    },
    meetingsActions: {
      removeParticipant: { _name: 'removeParticipant' },
      muteParticipantTrack: { _name: 'muteParticipantTrack' },
      muteEveryone: { _name: 'muteEveryone' },
      startRecording: { _name: 'startRecording' },
      stopRecording: { _name: 'stopRecording' },
      assignCohost: { _name: 'assignCohost' },
      reclaimHost: { _name: 'reclaimHost' },
      admitRegistration: { _name: 'admitRegistration' },
    },
  },
}));

// ── Toasts ───────────────────────────────────────────────────────────────────
const mockToast = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => mockToast(...args), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}));

import { CustomConference, type ConferenceProps } from '@/components/meetings/CustomConference';

// ── Props / helpers ──────────────────────────────────────────────────────────
const onCopyLink = jest.fn();
const onLeave = jest.fn();
const onDeviceChange = jest.fn();

const baseProps: ConferenceProps = {
  roomName: 'room-42',
  title: 'Design sync',
  statusKey: 'live',
  elapsed: 65,
  mode: 'meeting',
  linkCopied: false,
  onCopyLink,
  onLeave,
  deviceChoices: {},
  onDeviceChange,
  // Host-rotation + lobby props are read by the conference unconditionally
  // even when the local user is a regular participant.
  isOriginalHost: false,
  cohostIds: [] as readonly string[],
  waitingRoomEnabled: false,
};

function renderConference(overrides: Partial<ConferenceProps> = {}) {
  return render(<CustomConference {...baseProps} {...overrides} />);
}

function encode(data: unknown) {
  return new TextEncoder().encode(JSON.stringify(data));
}

/** Delivers a data-channel packet to the component's current subscriber. */
function emit(topic: string, msg: { from?: unknown; payload: Uint8Array }) {
  act(() => {
    dataHandlers[topic]?.(msg);
  });
}

/** Decodes what the component published on `topic`. */
function sentOn(topic: string, call = 0) {
  const payload = dataSends[topic]?.mock.calls[call]?.[0] as Uint8Array;
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}

/** Clicks a dock button and lets any probe it kicked off settle. */
async function clickButton(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { kind, deviceId, label, groupId: 'g', toJSON: () => ({}) } as MediaDeviceInfo;
}

let local: FakeParticipant;
let bob: FakeParticipant;
let cara: FakeParticipant;

beforeEach(() => {
  jest.clearAllMocks();
  local = makeParticipant('ada', 'Ada Lovelace');
  bob = makeParticipant('bob', 'Bob Stone');
  cara = makeParticipant('cara', 'Cara Diaz');

  lk.localParticipant = local;
  lk.cameraTrack = undefined;
  lk.participants = [local];
  lk.speaking = [];
  lk.connectionState = 'connected';
  lk.isRecording = false;
  lk.tracks = {};
  lk.screenShares = [];
  lk.chatMessages = [];
  lk.quality = {};
  lk.toggles.microphone!.enabled = true;
  lk.toggles.camera!.enabled = true;
  lk.toggles.screen_share!.enabled = false;
  for (const toggle of Object.values(lk.toggles)) {
    toggle.toggle.mockImplementation(async () => undefined);
  }

  krisp.isNoiseFilterEnabled = false;
  krisp.isNoiseFilterPending = false;
  krisp.setNoiseFilterEnabled.mockImplementation(async () => undefined);
  mockChatSend.mockImplementation(async () => undefined);

  queries.recordingConfigured = { configured: true, livekit: true };
  queries.getByRoomName = { egressId: undefined };
  actions.removeParticipant!.mockImplementation(async () => undefined);
  actions.muteParticipantTrack!.mockImplementation(async () => undefined);
  actions.muteEveryone!.mockImplementation(async () => undefined);
  actions.startRecording!.mockImplementation(async () => ({
    configured: true,
    alreadyRunning: false,
  }));
  actions.stopRecording!.mockImplementation(async () => undefined);
  for (const send of Object.values(dataSends)) send.mockImplementation(async () => undefined);

  window.localStorage.clear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: async () => [
        device('audioinput', 'mic-1', 'Headset mic'),
        device('videoinput', 'cam-1', 'FaceTime HD'),
        device('audiooutput', 'out-1', 'Speakers'),
      ],
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
  // jsdom implements neither of these, and the component calls both.
  Element.prototype.scrollIntoView = jest.fn();
  document.documentElement.requestFullscreen = jest.fn(async () => undefined);
  document.exitFullscreen = jest.fn(async () => undefined);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

describe('CustomConference — header', () => {
  it('names the meeting and shows the status, clock and mode', () => {
    renderConference();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Design sync');
    expect(screen.getByText('meetings.status.live')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByText('meetings.meeting')).toBeInTheDocument();
  });

  it('grows the clock past an hour and labels a webinar', () => {
    renderConference({ elapsed: 3725, mode: 'webinar', statusKey: 'scheduled' });

    expect(screen.getByText('1:02:05')).toBeInTheDocument();
    expect(screen.getByText('meetings.webinar')).toBeInTheDocument();
    expect(screen.getByText('meetings.status.scheduled')).toBeInTheDocument();
  });

  it('copies the room link', () => {
    renderConference();

    fireEvent.click(screen.getByTitle('meetings.copyLink'));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('confirms a link that was just copied', () => {
    renderConference({ linkCopied: true });

    expect(screen.getByTitle('meetings.copied')).toBeInTheDocument();
    expect(screen.queryByTitle('meetings.copyLink')).not.toBeInTheDocument();
  });

  it('leaves the call', () => {
    renderConference();

    fireEvent.click(screen.getByRole('button', { name: 'meetings.leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('flags a recording the SFU reports', () => {
    lk.isRecording = true;
    renderConference();

    expect(screen.getByText('meetings.recording')).toBeInTheDocument();
  });

  it('flags a cloud recording from the shared meeting row', () => {
    queries.getByRoomName = { egressId: 'EG_1' };
    renderConference();

    expect(screen.getByText('meetings.recording')).toBeInTheDocument();
  });

  it('stacks four other participants and counts the overflow', () => {
    lk.participants = [
      local,
      bob,
      cara,
      makeParticipant('dan', 'Dan Ray'),
      makeParticipant('eve', 'Eve Kim'),
      makeParticipant('fay', 'Fay Lin'),
      makeParticipant('gus', 'Gus Ito'),
    ];
    renderConference();

    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getAllByTitle('meetings.pin')).toHaveLength(7);
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CustomConference — tiles', () => {
  it('falls back to initials and marks which tile is yours', () => {
    renderConference();

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('meetings.you')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('attaches a camera track instead of the initials', () => {
    const camera = makeTrack();
    lk.tracks = { ada: { camera: [pub(camera)] } };
    const { container } = renderConference();

    expect(camera.attach).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  it('marks a muted microphone and lights up a speaker', () => {
    lk.participants = [local, bob];
    lk.tracks = { bob: { microphone: [pub(makeTrack())] } };
    lk.speaking = [bob];
    const { container } = renderConference();

    // Local publishes nothing, so its badge reads as muted; Bob is speaking.
    expect(container.querySelectorAll('svg.text-red-400')).toHaveLength(1);
    expect(container.querySelectorAll('svg.text-emerald-400')).toHaveLength(1);
    expect(container.querySelectorAll('.meeting-speaking-bar')).toHaveLength(3);
  });

  it('shows a connection-quality badge only when it is worth knowing', () => {
    lk.participants = [local, bob, cara];
    lk.quality = { bob: 'poor', cara: 'unknown' };
    renderConference();

    expect(screen.getByTitle('meetings.quality.poor')).toBeInTheDocument();
    expect(screen.queryByTitle('meetings.quality.excellent')).not.toBeInTheDocument();
    expect(screen.queryByTitle('meetings.quality.good')).not.toBeInTheDocument();
  });

  it('names a degraded and a lost connection', () => {
    lk.participants = [local, bob];
    lk.quality = { ada: 'lost', bob: 'good' };
    renderConference();

    expect(screen.getByTitle('meetings.quality.lost')).toBeInTheDocument();
    expect(screen.getByTitle('meetings.quality.good')).toBeInTheDocument();
  });

  it('gives the stage to a screen share and everyone else a filmstrip', () => {
    lk.participants = [local, bob];
    lk.screenShares = [pub(makeTrack(), false, bob)];
    const { container } = renderConference();

    expect(container.querySelector('video.object-contain')).toBeInTheDocument();
    // Once for the share label, once for Bob's own tile.
    expect(screen.getAllByText('Bob Stone')).toHaveLength(2);
    expect(screen.getAllByTitle('meetings.pin')).toHaveLength(2);
    // A share takes over the layout toggle and the "waiting alone" card.
    expect(screen.queryByTitle('meetings.speakerView')).not.toBeInTheDocument();
    expect(screen.queryByText('meetings.alone')).not.toBeInTheDocument();
  });

  it('ignores a muted screen-share publication', () => {
    lk.screenShares = [pub(makeTrack(), true, bob)];
    const { container } = renderConference();

    expect(container.querySelector('video.object-contain')).not.toBeInTheDocument();
    expect(screen.getByText('meetings.alone')).toBeInTheDocument();
  });

  it('offers the link while waiting alone, with nothing to pin', () => {
    renderConference();

    expect(screen.getByText('meetings.aloneHint')).toBeInTheDocument();
    expect(screen.queryByTitle('meetings.pin')).not.toBeInTheDocument();

    const card = screen.getByText('meetings.alone').closest('div') as HTMLElement;
    fireEvent.click(within(card).getByRole('button'));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('pins a tile to the stage and unpins it from the header', () => {
    lk.participants = [local, bob];
    const { container } = renderConference();

    fireEvent.click(screen.getAllByTitle('meetings.pin')[1]!);

    const stage = container.querySelector('[class="relative min-h-0 flex-1"]') as HTMLElement;
    expect(within(stage).getByText('Bob Stone')).toBeInTheDocument();
    expect(screen.queryByTitle('meetings.speakerView')).not.toBeInTheDocument();

    // The header unpin comes first in the DOM; the tile has one too.
    fireEvent.click(screen.getAllByTitle('meetings.unpin')[0]!);
    expect(screen.getAllByTitle('meetings.pin')).toHaveLength(2);
    expect(screen.getByTitle('meetings.speakerView')).toBeInTheDocument();
  });

  it('switches between the grid and the speaker stage', () => {
    lk.participants = [local, bob];
    const { container } = renderConference();

    fireEvent.click(screen.getByTitle('meetings.speakerView'));

    const stage = container.querySelector('[class="relative min-h-0 flex-1"]') as HTMLElement;
    // Nobody has held the floor yet, so the first remote takes the stage.
    expect(within(stage).getByText('Bob Stone')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('meetings.gridView'));
    expect(container.querySelector('[class="relative min-h-0 flex-1"]')).toBeNull();
  });

  it('follows the active speaker only once they have held the floor', () => {
    jest.useFakeTimers();
    lk.participants = [local, bob, cara];
    lk.speaking = [cara];
    const { container } = renderConference();
    fireEvent.click(screen.getByTitle('meetings.speakerView'));

    const before = container.querySelector('[class="relative min-h-0 flex-1"]') as HTMLElement;
    expect(within(before).getByText('Bob Stone')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(700);
    });

    const after = container.querySelector('[class="relative min-h-0 flex-1"]') as HTMLElement;
    expect(within(after).getByText('Cara Diaz')).toBeInTheDocument();
  });
});

describe('CustomConference — dock', () => {
  it('toggles the microphone, camera and screen share', () => {
    renderConference();

    fireEvent.click(screen.getByTitle('meetings.micOn · M'));
    fireEvent.click(screen.getByTitle('meetings.camOn · V'));
    fireEvent.click(screen.getByTitle('meetings.share · S'));

    expect(lk.toggles.microphone!.toggle).toHaveBeenCalledTimes(1);
    expect(lk.toggles.camera!.toggle).toHaveBeenCalledTimes(1);
    expect(lk.toggles.screen_share!.toggle).toHaveBeenCalledTimes(1);
  });

  it('shows the off state of a muted microphone and camera', () => {
    lk.toggles.microphone!.enabled = false;
    lk.toggles.camera!.enabled = false;
    renderConference();

    expect(screen.getByTitle('meetings.micOff · M')).toBeInTheDocument();
    expect(screen.getByTitle('meetings.camOff · V')).toBeInTheDocument();
  });

  it('explains a denied device and any other toggle failure', async () => {
    lk.toggles.microphone!.toggle.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    lk.toggles.screen_share!.toggle.mockRejectedValueOnce(new Error('boom'));
    renderConference();

    fireEvent.click(screen.getByTitle('meetings.micOn · M'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('meetings.micDenied'));

    fireEvent.click(screen.getByTitle('meetings.share · S'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('meetings.trackError'));
  });

  it('broadcasts a raised hand, then lowers it again', () => {
    renderConference();

    fireEvent.click(screen.getByTitle('meetings.raiseHand · H'));

    expect(sentOn('raiseHand')).toEqual({ on: true });
    expect(dataSends.raiseHand!.mock.calls[0]![1]).toEqual({ reliable: true });
    expect(screen.getByTitle('meetings.lowerHand · H')).toBeInTheDocument();
    // The header chip counts the hand, and so does the badge on the
    // participants toggle — that badge is what makes the panel worth opening.
    expect(screen.getByTitle('meetings.handsRaised')).toHaveTextContent('1');
    expect(
      within(screen.getByRole('button', { name: 'meetings.participants · P' })).getByText('1'),
    ).toBeInTheDocument();

    // The header chip is a shortcut into the participants panel.
    fireEvent.click(screen.getByTitle('meetings.handsRaised'));
    expect(screen.getByText('meetings.inMeeting')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('meetings.lowerHand · H'));
    expect(sentOn('raiseHand', 1)).toEqual({ on: false });
    expect(screen.queryByTitle('meetings.handsRaised')).not.toBeInTheDocument();
  });

  it('sends a reaction, floats it, and lets it expire', () => {
    jest.useFakeTimers();
    renderConference();

    fireEvent.click(screen.getByRole('button', { name: 'meetings.reactions' }));
    for (const emoji of ['👍', '❤️', '😂', '🎉', '👏']) {
      expect(screen.getByText(emoji)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByText('🎉'));

    expect(sentOn('reactions')).toEqual({ emoji: '🎉', identity: 'ada' });
    // The popover closed; what is left is the tile reaction and the cascade.
    expect(screen.getAllByText('🎉')).toHaveLength(2);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('🎉')).not.toBeInTheDocument();
  });

  it('opens the chat, sends a message and clears the draft', async () => {
    const { container } = renderConference();

    await clickButton('meetings.chat · C');
    expect(screen.getByText('meetings.chatEmpty')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('meetings.chatPlaceholder');
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(mockChatSend).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('');
  });

  it('ignores an empty draft and keeps one that could not be sent', async () => {
    mockChatSend.mockRejectedValueOnce(new Error('offline'));
    const { container } = renderConference();
    await clickButton('meetings.chat · C');

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(mockChatSend).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText('meetings.chatPlaceholder');
    fireEvent.change(input, { target: { value: 'keep me' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(input).toHaveValue('keep me');
  });

  it('groups the chat history by sender and day', async () => {
    const now = Date.now();
    lk.chatMessages = [
      {
        id: 'm1',
        message: 'Yesterday hi',
        timestamp: now - 26 * 3600 * 1000,
        from: { identity: 'bob', name: 'Bob Stone' },
      },
      { id: 'm2', message: 'Morning all', timestamp: now - 5000, from: { identity: 'bob' } },
      { id: 'm3', message: 'Mine', timestamp: now, from: { identity: 'ada', name: 'Ada' } },
    ];
    renderConference();
    await clickButton('meetings.chat · C');

    expect(screen.getByText('Yesterday hi')).toBeInTheDocument();
    expect(screen.getByText('Morning all')).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    // A divider per day, and a fresh group header after the long gap.
    expect(screen.getByText('meetings.today')).toBeInTheDocument();
    expect(screen.getByText('Bob Stone')).toBeInTheDocument();
    expect(screen.getAllByText('B')).toHaveLength(1);
  });

  it('counts unread messages until the chat is opened', async () => {
    const now = Date.now();
    lk.chatMessages = [
      { id: 'm1', message: 'One', timestamp: now, from: { identity: 'bob' } },
      { id: 'm2', message: 'Two', timestamp: now, from: { identity: 'bob' } },
    ];
    renderConference();

    const chat = screen.getByRole('button', { name: 'meetings.chat · C' });
    expect(within(chat).getByText('2')).toBeInTheDocument();

    await clickButton('meetings.chat · C');
    expect(within(chat).queryByText('2')).not.toBeInTheDocument();
  });

  it('closes the chat panel from its own header', async () => {
    renderConference();
    await clickButton('meetings.chat · C');
    expect(screen.getByText('meetings.chatToAll')).toBeInTheDocument();

    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('meetings.chatToAll')).not.toBeInTheDocument();
  });
});

describe('CustomConference — participants panel', () => {
  /** The panel, not the stage — a name appears on both. */
  function panel() {
    return screen.getByText('meetings.inMeeting').closest('section') as HTMLElement;
  }

  it('lists everyone with a count and closes again', async () => {
    lk.participants = [local, bob];
    renderConference();

    await clickButton('meetings.participants · P');
    expect(screen.getByText(/meetings\.participants \(2\)/)).toBeInTheDocument();
    expect(within(panel()).getByText('Bob Stone')).toBeInTheDocument();
    expect(within(panel()).getByText('(meetings.you)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('meetings.inMeeting')).not.toBeInTheDocument();
  });

  it('marks a raised hand on the row it belongs to', async () => {
    lk.participants = [local, bob];
    renderConference();
    await clickButton('meetings.participants · P');

    emit('raiseHand', { from: { identity: 'bob' }, payload: encode({ on: true }) });

    const rows = within(panel()).getAllByText(/Lovelace|Stone/);
    const bobRow = rows.find((el) => el.textContent?.includes('Bob Stone'))!.closest('div')!
      .parentElement as HTMLElement;
    expect(within(bobRow).getByText('meetings.raiseHand')).toBeInTheDocument();
    // Ada's row stays clean.
    const adaRow = rows.find((el) => el.textContent?.includes('Ada Lovelace'))!.closest('div')!
      .parentElement as HTMLElement;
    expect(within(adaRow).queryByText('meetings.raiseHand')).not.toBeInTheDocument();
  });

  it('lets you toggle your own devices from your row', async () => {
    lk.tracks = { ada: { microphone: [pub(makeTrack())], camera: [pub(makeTrack())] } };
    renderConference();
    await clickButton('meetings.participants · P');

    fireEvent.click(screen.getByTitle('meetings.micOff'));
    fireEvent.click(screen.getByTitle('meetings.camOff'));

    expect(lk.toggles.microphone!.toggle).toHaveBeenCalledTimes(1);
    expect(lk.toggles.camera!.toggle).toHaveBeenCalledTimes(1);
  });

  it('keeps host controls away from a guest', async () => {
    lk.participants = [local, bob];
    renderConference();
    await clickButton('meetings.participants · P');

    // `muteAll` is host-only and must not appear for a guest.
    expect(screen.queryByText('meetings.muteAll')).not.toBeInTheDocument();
    // The per-row mic/cam icons are now visible to everyone (so the local
    // user can mute themselves), but the host moderation buttons (the
    // dedicated `meetings.muteMic`/`meetings.remove` actions) are not.
    expect(screen.queryByTitle('meetings.remove')).not.toBeInTheDocument();
    // The remove X must also be hidden — `disabled` rows do not get it.
    expect(screen.queryAllByTitle('meetings.remove')).toHaveLength(0);
  });
});

describe('CustomConference — host controls', () => {
  /** A host sees the extra row buttons; the mutes run server-side. */
  async function openPanelAsHost() {
    local = makeParticipant('ada', 'Ada Lovelace', HOST_META);
    lk.localParticipant = local;
    lk.participants = [local, bob];
    renderConference();
    await clickButton('meetings.participants · P');
  }

  it('mutes a microphone through the server and explains it on the channel', async () => {
    await openPanelAsHost();

    await clickButton('meetings.muteMic');

    expect(actions.muteParticipantTrack).toHaveBeenCalledWith({
      roomName: 'room-42',
      identity: 'bob',
      source: 'microphone',
      muted: true,
    });
    expect(sentOn('hostCtrl')).toEqual({ cmd: 'muteMic', target: 'bob' });
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.participantMuted');
  });

  it('stops a camera the same way', async () => {
    await openPanelAsHost();

    await clickButton('meetings.muteCam');

    expect(actions.muteParticipantTrack).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'camera', identity: 'bob' }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.participantCamStopped');
  });

  it('surfaces the reason a server-side mute was refused', async () => {
    actions.muteParticipantTrack!.mockRejectedValueOnce(new Error('not the host'));
    await openPanelAsHost();

    await clickButton('meetings.muteMic');

    expect(mockToastError).toHaveBeenCalledWith('not the host');
  });

  it('asks a participant to unmute without touching their tracks', async () => {
    // Force bob's mic to render as muted so the row icon shows the
    // `meetings.askUnmute` tooltip (click = ask-to-unmute, not force-mute).
    lk.tracks.bob = {
      microphone: [{ publication: { isMuted: true } }],
    };
    await openPanelAsHost();

    await clickButton('meetings.askUnmute');

    expect(sentOn('hostCtrl')).toEqual({ cmd: 'askUnmute', target: 'bob' });
    expect(actions.muteParticipantTrack).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.askUnmuteSent');
  });

  it('mutes everyone at once', async () => {
    await openPanelAsHost();

    await clickButton('meetings.muteAll');

    expect(actions.muteEveryone).toHaveBeenCalledWith({ roomName: 'room-42' });
    expect(sentOn('hostCtrl')).toEqual({ cmd: 'muteMic', target: '*' });
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.muteAllDone');
  });

  it('reports a mute-everyone that the server rejected', async () => {
    actions.muteEveryone!.mockRejectedValueOnce(new Error('room closed'));
    await openPanelAsHost();

    await clickButton('meetings.muteAll');
    expect(mockToastError).toHaveBeenCalledWith('room closed');
  });

  it('removes a participant, and says so when it fails', async () => {
    await openPanelAsHost();

    await clickButton('meetings.remove');
    expect(actions.removeParticipant).toHaveBeenCalledWith({
      roomName: 'room-42',
      identity: 'bob',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.removed');

    actions.removeParticipant!.mockRejectedValueOnce(new Error('gone'));
    await clickButton('meetings.remove');
    expect(mockToastError).toHaveBeenCalledWith('meetings.removedFailed');
  });
});

describe('CustomConference — cloud recording', () => {
  function renderAsHost(overrides: Partial<ConferenceProps> = {}) {
    local = makeParticipant('ada', 'Ada Lovelace', HOST_META);
    lk.localParticipant = local;
    return renderConference(overrides);
  }

  it('is not offered to a guest', () => {
    renderConference();
    expect(screen.queryByTitle('meetings.recordStart')).not.toBeInTheDocument();
  });

  it('is offered to the host', () => {
    renderAsHost();
    expect(screen.getByTitle('meetings.recordStart')).toBeInTheDocument();
  });

  it('starts a recording', async () => {
    renderAsHost();

    await clickButton('meetings.recordStart');

    expect(actions.startRecording).toHaveBeenCalledWith({ roomName: 'room-42' });
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.recordStarted');
  });

  it('says when one was already running, and when storage is missing', async () => {
    actions.startRecording!.mockResolvedValueOnce({ configured: true, alreadyRunning: true });
    renderAsHost();
    await clickButton('meetings.recordStart');
    expect(mockToast).toHaveBeenCalledWith('meetings.recordAlready');

    actions.startRecording!.mockResolvedValueOnce({ configured: false, alreadyRunning: false });
    await clickButton('meetings.recordStart');
    expect(mockToastError).toHaveBeenCalledWith('meetings.recordNoStorage');
  });

  it('stops the recording the meeting row says is running', async () => {
    queries.getByRoomName = { egressId: 'EG_1' };
    renderAsHost();

    expect(screen.getByTitle('meetings.recordStop')).toHaveAttribute('aria-pressed', 'true');
    await clickButton('meetings.recordStop');

    expect(actions.stopRecording).toHaveBeenCalledWith({ roomName: 'room-42' });
    expect(mockToastSuccess).toHaveBeenCalledWith('meetings.recordStopped');
  });

  it('refuses to start when egress is not configured', async () => {
    queries.recordingConfigured = { configured: false, livekit: true };
    renderAsHost();

    await clickButton('meetings.recordUnavailable');

    expect(actions.startRecording).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('meetings.recordNoStorage');
  });

  it('names LiveKit as the missing piece when even that is unset', async () => {
    queries.recordingConfigured = { configured: false, livekit: false };
    renderAsHost();

    await clickButton('meetings.recordUnavailable');
    expect(mockToastError).toHaveBeenCalledWith('meetings.recordNoLivekit');
  });

  it('reports a failure from the egress service', async () => {
    actions.startRecording!.mockRejectedValueOnce(new Error('egress quota'));
    renderAsHost();

    await clickButton('meetings.recordStart');
    expect(mockToastError).toHaveBeenCalledWith('egress quota');
  });
});

describe('CustomConference — settings, captions and shortcuts', () => {
  it('shows the device pickers, the noise filter and the background picker', async () => {
    renderConference();

    await clickButton('meetings.settings');

    expect(screen.getByText('meetings.settings')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByText('meetings.noiseFilter.title')).toBeInTheDocument();
    expect(screen.getByText('meetings.noiseFilter.hint')).toBeInTheDocument();
    // No local camera track, so the effect tiles explain themselves instead.
    expect(screen.getByText('meetings.effects.needsCamera')).toBeInTheDocument();
  });

  it('forwards a device change to the page', async () => {
    renderConference();
    await clickButton('meetings.settings');

    const [mic] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(mic!, { target: { value: 'mic-1' } });

    expect(onDeviceChange).toHaveBeenCalledWith('audioinput', 'mic-1');
  });

  it('switches Krisp on through the kit hook', async () => {
    renderConference();
    await clickButton('meetings.settings');

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });

    expect(krisp.setNoiseFilterEnabled).toHaveBeenCalledWith(true);
  });

  it('offers the background effects once a camera track exists', async () => {
    lk.cameraTrack = { track: makeTrack() };
    renderConference();

    await clickButton('meetings.settings');

    // Support is only probed when an effect is actually asked for, so the
    // picker starts on its neutral hint.
    expect(screen.getByText('meetings.effects.hint')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'meetings.effects.blurLight' }));
    });

    // The mocked processors report no support, so the picker says so — and the
    // camera keeps running unprocessed.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('meetings.effects.unsupported'),
    );
    expect(screen.getByRole('button', { name: 'meetings.effects.bokehWarm' })).toBeDisabled();
  });

  it('closes the settings popover on Escape', async () => {
    renderConference();
    await clickButton('meetings.settings');
    expect(screen.getByText('meetings.noiseFilter.title')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('meetings.noiseFilter.title')).not.toBeInTheDocument();
  });

  it('lists the keyboard shortcuts', async () => {
    renderConference();

    await clickButton('meetings.shortcuts · ?');

    expect(screen.getByText('meetings.pushToTalk')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
  });
});

describe('CustomConference — captions', () => {
  it('opens the caption strip and explains an unsupported browser', async () => {
    renderConference();

    await clickButton('meetings.cc.title · T');

    const strip = screen.getByText('meetings.cc.notice').parentElement as HTMLElement;
    expect(strip).toHaveAttribute('aria-live', 'polite');
    // jsdom ships no SpeechRecognition, which is exactly the unsupported case.
    expect(screen.getByText('meetings.cc.unsupported')).toBeInTheDocument();
  });

  it('waits for the microphone before listening', async () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = class {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 0;
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      start() {}
      stop() {}
      abort() {}
    };
    try {
      lk.toggles.microphone!.enabled = false;
      renderConference();

      await clickButton('meetings.cc.title · T');
      expect(screen.getByText('meetings.cc.muted')).toBeInTheDocument();
    } finally {
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    }
  });

  it('closes the strip again', async () => {
    renderConference();
    await clickButton('meetings.cc.title · T');

    await clickButton('meetings.cc.title · T');
    expect(screen.queryByText('meetings.cc.notice')).not.toBeInTheDocument();
  });
});

describe('CustomConference — keyboard and fullscreen', () => {
  it('drives the dock from the keyboard', () => {
    renderConference();

    fireEvent.keyDown(document.body, { key: 'm' });
    fireEvent.keyDown(document.body, { key: 'v' });
    fireEvent.keyDown(document.body, { key: 's' });
    expect(lk.toggles.microphone!.toggle).toHaveBeenCalledTimes(1);
    expect(lk.toggles.camera!.toggle).toHaveBeenCalledTimes(1);
    expect(lk.toggles.screen_share!.toggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.getByText('meetings.chatToAll')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'p' });
    expect(screen.getByText('meetings.inMeeting')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'h' });
    expect(screen.getByTitle('meetings.lowerHand · H')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 't' });
    expect(screen.getByText('meetings.cc.notice')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByText('meetings.pushToTalk')).toBeInTheDocument();
  });

  it('ignores shortcuts while typing and with a modifier held', async () => {
    renderConference();
    await clickButton('meetings.chat · C');

    const input = screen.getByPlaceholderText('meetings.chatPlaceholder');
    fireEvent.keyDown(input, { key: 'm' });
    fireEvent.keyDown(document.body, { key: 'm', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'q' });

    expect(lk.toggles.microphone!.toggle).not.toHaveBeenCalled();
  });

  it('holds Space to talk and drops the mic on release', () => {
    lk.toggles.microphone!.enabled = false;
    renderConference();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    // A repeat while held must not re-arm it.
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ', repeat: true });
    expect(local.setMicrophoneEnabled).toHaveBeenCalledTimes(1);

    fireEvent.keyUp(document.body, { code: 'Space', key: ' ' });
    expect(local.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
  });

  it('leaves an already-live microphone alone on Space', () => {
    renderConference();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it('goes fullscreen and back', () => {
    renderConference();

    fireEvent.click(screen.getByTitle('meetings.fullscreen'));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    fireEvent.click(screen.getByTitle('meetings.exitFullscreen'));
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('CustomConference — inbound data channel', () => {
  const HOST_FROM = { identity: 'zoe', name: 'Zoe Host', metadata: HOST_META };

  it('drops the microphone when the host says so', () => {
    renderConference();

    emit('hostCtrl', { from: HOST_FROM, payload: encode({ cmd: 'muteMic', target: 'ada' }) });

    expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith('meetings.mutedByHost', expect.anything());
  });

  it('stops the camera when the host says so', () => {
    renderConference();

    emit('hostCtrl', { from: HOST_FROM, payload: encode({ cmd: 'muteCam', target: 'ada' }) });

    expect(local.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith('meetings.camStoppedByHost', expect.anything());
  });

  it('accepts the broadcast mute aimed at everyone', () => {
    renderConference();

    emit('hostCtrl', { from: HOST_FROM, payload: encode({ cmd: 'muteMic', target: '*' }) });

    expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('offers an unmute button when the host asks', () => {
    renderConference();

    emit('hostCtrl', { from: HOST_FROM, payload: encode({ cmd: 'askUnmute', target: 'ada' }) });

    const options = mockToast.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(mockToast).toHaveBeenCalledWith('meetings.unmuteRequest', expect.anything());
    expect(options.action.label).toBe('meetings.unmute');
    options.action.onClick();
    expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('refuses commands from a guest, for someone else, or unparseable', () => {
    renderConference();

    // Right topic, wrong role — this is the spoofing case.
    emit('hostCtrl', {
      from: { identity: 'bob', metadata: undefined },
      payload: encode({ cmd: 'muteMic' }),
    });
    // Host, but addressed to a different participant.
    emit('hostCtrl', { from: HOST_FROM, payload: encode({ cmd: 'muteMic', target: 'bob' }) });
    // Host, but no command and then not even JSON.
    emit('hostCtrl', { from: HOST_FROM, payload: encode({ target: 'ada' }) });
    emit('hostCtrl', { from: HOST_FROM, payload: new TextEncoder().encode('{oops') });

    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('raises and lowers a remote hand, ignoring junk', async () => {
    lk.participants = [local, bob];
    renderConference();
    await clickButton('meetings.participants · P');

    emit('raiseHand', { payload: encode({ on: true }) }); // no sender
    emit('raiseHand', { from: { identity: 'bob' }, payload: encode({ on: 'yes' }) });
    emit('raiseHand', { from: { identity: 'bob' }, payload: new TextEncoder().encode('nope') });
    expect(screen.queryByTitle('meetings.handsRaised')).not.toBeInTheDocument();

    emit('raiseHand', { from: { identity: 'bob' }, payload: encode({ on: true }) });
    expect(screen.getByTitle('meetings.handsRaised')).toHaveTextContent('1');

    emit('raiseHand', { from: { identity: 'bob' }, payload: encode({ on: false }) });
    expect(screen.queryByTitle('meetings.handsRaised')).not.toBeInTheDocument();
  });

  it('floats a remote reaction and ignores a malformed one', () => {
    lk.participants = [local, bob];
    renderConference();

    emit('reactions', { from: { identity: 'bob' }, payload: new TextEncoder().encode('{') });
    emit('reactions', { from: { identity: 'bob' }, payload: encode({ identity: 'bob' }) });
    expect(screen.queryByText('👏')).not.toBeInTheDocument();

    // Sender taken from the packet …
    emit('reactions', { from: { identity: 'bob' }, payload: encode({ emoji: '👏' }) });
    expect(screen.getAllByText('👏').length).toBeGreaterThan(0);
  });

  it('shows what other people say and skips its own echo', async () => {
    lk.participants = [local, bob];
    renderConference();
    await clickButton('meetings.cc.title · T');

    emit('captions', {
      from: { identity: 'bob', name: 'Bob Stone' },
      payload: encode({ text: 'ship it on friday', final: true, name: 'Bob Stone' }),
    });
    const strip = screen.getByText('meetings.cc.notice').parentElement as HTMLElement;
    expect(within(strip).getByText('ship it on friday')).toBeInTheDocument();
    expect(within(strip).getByText('Bob Stone')).toBeInTheDocument();

    // Our own recognizer already rendered locally, so the echo is dropped …
    emit('captions', {
      from: { identity: 'ada' },
      payload: encode({ text: 'my own words', final: true }),
    });
    // … as are an empty line and a broken packet.
    emit('captions', { from: { identity: 'bob' }, payload: encode({ text: '' }) });
    emit('captions', { from: { identity: 'bob' }, payload: new TextEncoder().encode('{') });

    expect(within(strip).queryByText('my own words')).not.toBeInTheDocument();
    expect(within(strip).getAllByRole('listitem')).toHaveLength(1);
  });
});
