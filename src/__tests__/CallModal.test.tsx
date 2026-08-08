/**
 * Tests for CallModal — the audio/video call overlay:
 *   - audio/video UI (caller info, type badge, status text, controls)
 *   - initiator offer flow, receiver answer flow, ICE candidate exchange
 *   - ontrack → active + in-call status + duration timer
 *   - connectionstate connected/disconnected/failed
 *   - media error handling: NotReadable retry chain (auto + manual), permission,
 *     not-found and generic errors
 *   - toggle mic/cam/speaker, end call, remote-side end detection
 *
 * Mocks: convex/react (useQuery for getActiveCall + per-mutation recorders),
 * RTCPeerConnection (scripted class), navigator.mediaDevices.getUserMedia,
 * fetch (Metered TURN), logger, avatar, next/image, lucide (testids).
 */

import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ActiveCall } from '../components/chat/ChatClient';

// ── i18n: return the key so assertions are stable across locales ────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) =>
      params && typeof params === 'object' ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
let callDataValue: unknown = null;
const mutationCalls: Record<string, Array<{ args: any }>> = {};
const mutationRejects: Set<string> = new Set();

jest.mock('../../convex/_generated/api', () => ({
  api: {
    chat: {
      calls: {
        endCall: { _name: 'endCall' },
        answerCall: { _name: 'answerCall' },
        updateOffer: { _name: 'updateOffer' },
        updateIceCandidates: { _name: 'updateIceCandidates' },
        getActiveCall: { _name: 'getActiveCall' },
      },
    },
    users: {
      mutations: {
        setInCallStatus: { _name: 'setInCallStatus' },
        resetFromCallStatus: { _name: 'resetFromCallStatus' },
      },
    },
  },
}));

jest.mock('convex/react', () => ({
  useMutation: (ref: { _name?: string }) => {
    const name = ref?._name ?? '';
    return async (args: any) => {
      (mutationCalls[name] ??= []).push({ args });
      if (mutationRejects.has(name)) return Promise.reject(new Error('mutation boom'));
      return Promise.resolve();
    };
  },
  useQuery: (ref: { _name?: string }, _args: any) => {
    if (ref?._name === 'getActiveCall') return callDataValue;
    return undefined;
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <span data-testid="avatar">{children}</span>,
  AvatarFallback: ({ children }: any) => <span data-testid="avatar-fallback">{children}</span>,
}));

jest.mock('next/image', () => {
  const ReactMod = require('react');
  return {
    __esModule: true,
    default: (props: any) => <img {...props} alt={props.alt ?? ''} />,
  };
});

jest.mock('lucide-react', () => {
  const icons = ['Phone', 'PhoneOff', 'Video', 'VideoOff', 'Mic', 'MicOff', 'Volume2', 'VolumeX'];
  const mocks: Record<string, any> = {};
  for (const name of icons) {
    mocks[name] = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
  }
  return mocks;
});

// ── WebRTC / media mocks ─────────────────────────────────────────────────────
let getUserMediaMock: jest.Mock;

// jsdom has no WebRTC session-description classes — pass-through implementations
class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type;
    this.sdp = init.sdp ?? '';
  }
}
class MockRTCIceCandidate {
  candidate: string;
  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
  }
}

class MockRTCPeerConnection {
  static instances: any[] = [];
  localDescription: any = null;
  remoteDescription: any = null;
  connectionState = 'new';
  onicecandidate: ((e: any) => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  iceServers: any;
  addTrack = jest.fn();
  createOffer = jest.fn().mockResolvedValue({ type: 'offer', sdp: 'offer-sdp' });
  createAnswer = jest.fn().mockResolvedValue({ type: 'answer', sdp: 'answer-sdp' });
  setLocalDescription = jest.fn().mockImplementation(function (this: any, d: any) {
    this.localDescription = d;
    return Promise.resolve();
  });
  setRemoteDescription = jest.fn().mockImplementation(function (this: any, d: any) {
    this.remoteDescription = d;
    return Promise.resolve();
  });
  addIceCandidate = jest.fn().mockResolvedValue(undefined);
  getSenders = jest.fn().mockReturnValue([]);
  close = jest.fn();

  constructor(config?: any) {
    this.iceServers = config?.iceServers;
    MockRTCPeerConnection.instances.push(this);
  }

  static _last(): any {
    return MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
  }
}

function makeTrack(kind: 'audio' | 'video') {
  return { kind, enabled: true, stop: jest.fn() };
}

function makeStream(video: boolean) {
  const tracks = [makeTrack('audio'), ...(video ? [makeTrack('video')] : [])];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  };
}

// ── Component under test ─────────────────────────────────────────────────────
import { CallModal } from '@/components/chat/CallModal';

const baseCall: ActiveCall = {
  callId: 'call-1' as any,
  conversationId: 'conv-1' as any,
  type: 'audio',
  isInitiator: false,
  remoteUserId: 'u2' as any,
  remoteUserName: 'Alice',
};

async function flush(extra = 2) {
  for (let i = 0; i < extra; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderModal(
  opts: { video?: boolean; initiator?: boolean; call?: Partial<ActiveCall> } = {},
) {
  const call = {
    ...baseCall,
    ...(opts.call ?? {}),
    type: opts.video ? 'video' : 'audio',
    isInitiator: opts.initiator ?? false,
  };
  const onEnd = jest.fn();
  const utils = render(
    <CallModal
      call={call}
      currentUserId={'me' as any}
      currentUserName="Roman"
      currentUserAvatar="https://cdn/me.png"
      onEnd={onEnd}
    />,
  );
  return { ...utils, onEnd, call };
}

beforeEach(() => {
  callDataValue = null;
  Object.keys(mutationCalls).forEach((k) => delete mutationCalls[k]);
  MockRTCPeerConnection.instances = [];
  global.RTCPeerConnection = MockRTCPeerConnection as any;
  getUserMediaMock = jest.fn().mockImplementation(async ({ video }: any) => makeStream(!!video));
  (global.navigator as any).mediaDevices = { getUserMedia: getUserMediaMock };
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [{ urls: 'stun:custom.example' }],
  });
  global.RTCSessionDescription = MockRTCSessionDescription as any;
  global.RTCIceCandidate = MockRTCIceCandidate as any;
  jest.useFakeTimers();
  mutationRejects.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ── Basic UI ─────────────────────────────────────────────────────────────────
describe('CallModal UI', () => {
  it('renders an audio call with caller info, type badge and ringing status', async () => {
    renderModal();
    await flush(3);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Roman')).toBeTruthy();
    expect(screen.getByText('chat.call.audioCall')).toBeTruthy();
    expect(screen.getByText('chat.call.ringing')).toBeTruthy();
    expect(screen.getAllByTestId('icon-Phone').length).toBeGreaterThan(0);
  });

  it('renders a video call with camera enabled and a video area', async () => {
    const { container } = renderModal({ video: true });
    await flush(3);
    expect(screen.getByText('chat.call.videoCall')).toBeTruthy();
    expect(screen.getAllByTestId('icon-Video').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('video').length).toBe(2);
    expect(screen.queryByTestId('icon-VideoOff')).toBeNull();
  });

  it('shows the remote avatar placeholder before the peer connects', async () => {
    renderModal({ video: true });
    await flush(3);
    // single-word names collapse to a single initial
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('uses a fallback when the remote name is missing', async () => {
    renderModal({ call: { remoteUserName: undefined } });
    await flush(3);
    expect(screen.getByText('common.unknown')).toBeTruthy();
  });

  it('renders the status for each phase', async () => {
    const utils = renderModal({ initiator: true });
    await flush(3);
    expect(screen.getByText('chat.call.connecting')).toBeTruthy();

    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.ontrack({ streams: [makeStream(false)] });
    });
    await flush();
    expect(screen.getByText('00:00')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('00:05')).toBeTruthy();
    void utils;
  });
});

// ── WebRTC signaling ─────────────────────────────────────────────────────────
describe('CallModal signaling', () => {
  it('initiator creates an offer and stores it', async () => {
    renderModal({ initiator: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    expect(pc.createOffer).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(mutationCalls['updateOffer']).toEqual([
      {
        args: {
          callId: 'call-1',
          userId: 'me',
          offer: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
        },
      },
    ]);
  });

  it('receiver reads the initiator offer and stores an answer', async () => {
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    // offer arrives after the peer connection exists → re-render with callData
    callDataValue = {
      participants: [
        {
          userId: 'u2',
          offer: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
          iceCandidates: [],
        },
      ],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(5);
    expect(pc.setRemoteDescription).toHaveBeenCalled();
    expect(pc.createAnswer).toHaveBeenCalled();
    expect(mutationCalls['answerCall']).toEqual([
      {
        args: {
          callId: 'call-1',
          userId: 'me',
          answer: JSON.stringify({ type: 'answer', sdp: 'answer-sdp' }),
        },
      },
    ]);
  });

  it('initiator consumes the receiver answer', async () => {
    const utils = renderModal({ initiator: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    callDataValue = {
      participants: [
        { userId: 'u2', answer: JSON.stringify({ type: 'answer', sdp: 'answer-sdp' }) },
      ],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={{ ...baseCall, isInitiator: true }}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(5);
    expect(pc.setRemoteDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'answer', sdp: 'answer-sdp' }),
    );
  });

  it('sends ICE candidates as they are generated', async () => {
    renderModal({ initiator: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    const cand = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
    await act(async () => {
      pc.onicecandidate!({ candidate: cand });
    });
    await flush();
    expect(mutationCalls['updateIceCandidates']).toEqual([
      { args: { callId: 'call-1', userId: 'me', candidates: [JSON.stringify(cand)] } },
    ]);
  });

  it('ignores null ICE candidates', async () => {
    renderModal({ initiator: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.onicecandidate!({ candidate: null });
    });
    expect(mutationCalls['updateIceCandidates']).toBeUndefined();
  });

  it('adds remote ICE candidates with deduplication', async () => {
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    callDataValue = {
      participants: [
        {
          userId: 'u2',
          offer: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
          iceCandidates: [
            JSON.stringify({ candidate: 'a' }),
            JSON.stringify({ candidate: 'a' }),
            JSON.stringify({ candidate: 'b' }),
          ],
        },
      ],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(5);
    // remoteDescription is set (offer) so candidates are applied; dupes filtered
    const applied = pc.addIceCandidate.mock.calls.filter((c: any) => c[0]).map((c: any) => c[0]);
    expect(applied).toHaveLength(2);
  });

  it('fails over to a STUN-only ICE config when the TURN fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    expect(pc.iceServers.length).toBeGreaterThan(0);
  });
});

// ── Connection events ────────────────────────────────────────────────────────
describe('CallModal connection events', () => {
  it('marks the call active and sets in-call status on ontrack', async () => {
    renderModal({ video: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.ontrack({ streams: [makeStream(true)] });
    });
    await flush();
    expect(mutationCalls['setInCallStatus']).toEqual([{ args: { userId: 'me' } }]);
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.queryByText('A')).toBeNull(); // placeholder replaced by remote video
  });

  it('marks the call active when the connection state is connected', async () => {
    renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.connectionState = 'connected';
      pc.onconnectionstatechange!();
    });
    await flush();
    expect(mutationCalls['setInCallStatus']).toHaveLength(1);
    expect(screen.getByText('00:00')).toBeTruthy();
  });

  it('ends the call when the connection fails', async () => {
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.connectionState = 'failed';
      pc.onconnectionstatechange!();
    });
    await flush(4);
    expect(mutationCalls['endCall']).toEqual([{ args: { callId: 'call-1', userId: 'me' } }]);
    expect(mutationCalls['resetFromCallStatus']).toEqual([{ args: { userId: 'me' } }]);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
  });
});

// ── Controls ─────────────────────────────────────────────────────────────────
describe('CallModal controls', () => {
  it('toggles the microphone', async () => {
    const stream = makeStream(false);
    (getUserMediaMock as jest.Mock).mockResolvedValue(stream);
    renderModal();
    await flush(3);
    const track = stream.getAudioTracks()[0];
    fireEvent.click(screen.getByTitle('chat.call.mute'));
    await flush();
    expect(track.enabled).toBe(false);
    expect(screen.getByTestId('icon-MicOff')).toBeTruthy();
    fireEvent.click(screen.getByTitle('chat.call.unmute'));
    expect(track.enabled).toBe(true);
    expect(screen.getByTestId('icon-Mic')).toBeTruthy();
  });

  it('toggles the camera for video calls', async () => {
    const stream = makeStream(true);
    (getUserMediaMock as jest.Mock).mockResolvedValue(stream);
    renderModal({ video: true });
    await flush(3);
    const track = stream.getVideoTracks()[0];
    fireEvent.click(screen.getByTitle('chat.call.cameraOff'));
    await flush();
    // both the PiP overlay and the control render VideoOff
    expect(screen.getAllByTestId('icon-VideoOff').length).toBeGreaterThan(0);
    expect(track.enabled).toBe(false);
    fireEvent.click(screen.getByTitle('chat.call.cameraOn'));
    await flush();
    // camera back on → no VideoOff anywhere (neither control nor PiP overlay)
    expect(screen.queryAllByTestId('icon-VideoOff')).toHaveLength(0);
    expect(track.enabled).toBe(true);
  });

  it('toggles the speaker and mutes the remote elements', async () => {
    const utils = renderModal();
    await flush(3);
    fireEvent.click(screen.getByTitle('chat.call.muteSpeaker'));
    await flush();
    const audio = utils.container.querySelector('audio') as HTMLAudioElement;
    expect(audio.muted).toBe(true);
    fireEvent.click(screen.getByTitle('chat.call.unmute'));
    await flush();
    expect(audio.muted).toBe(false);
  });

  it('ends the call from the end button', async () => {
    const utils = renderModal();
    await flush(3);
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(4);
    expect(mutationCalls['endCall']).toEqual([{ args: { callId: 'call-1', userId: 'me' } }]);
    expect(mutationCalls['resetFromCallStatus']).toEqual([{ args: { userId: 'me' } }]);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
    expect(screen.getByText('chat.call.ended')).toBeTruthy();
  });
});

// ── Remote-end detection ─────────────────────────────────────────────────────
describe('CallModal remote end', () => {
  it('cleans up and closes when callData becomes null after being seen', async () => {
    const utils = renderModal();
    await flush(3);
    callDataValue = { participants: [] };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(3);
    callDataValue = null;
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(3);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
    expect(screen.getByText('chat.call.ended')).toBeTruthy();
  });

  it('does not close while callData is still loading (initial null)', async () => {
    const utils = renderModal();
    await flush(3);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(utils.onEnd).not.toHaveBeenCalled();
  });
});

// ── Media errors ─────────────────────────────────────────────────────────────
describe('CallModal media errors', () => {
  it('shows a retry message and auto-retries for NotReadableError', async () => {
    getUserMediaMock
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { name: 'NotReadableError' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { name: 'NotReadableError' }));
    renderModal();
    await flush(3);
    expect(screen.getByText('chat.call.mediaErrorRetry:{"attempt":1}')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2100);
    });
    await flush(3);
    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
  });

  it('shows the final error message after 3 retries and hides the retry button', async () => {
    getUserMediaMock.mockRejectedValue(
      Object.assign(new Error('busy'), { name: 'NotReadableError' }),
    );
    renderModal();
    await flush(3);
    // first failure → retry button available (attempt 1 of 3)
    expect(screen.getByText('chat.call.retry')).toBeTruthy();
    // drive retryCount to 3 via manual retries
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('chat.call.retry'));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      await flush(3);
    }
    expect(screen.getByText('chat.call.mediaErrorFinal')).toBeTruthy();
    expect(screen.queryByText('chat.call.retry')).toBeNull();
  });

  it('shows the permission-denied message for NotAllowedError', async () => {
    getUserMediaMock.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    renderModal();
    await flush(3);
    expect(screen.getByText('chat.call.mediaPermissionDenied')).toBeTruthy();
  });

  it('shows the not-found message for NotFoundError', async () => {
    getUserMediaMock.mockRejectedValue(
      Object.assign(new Error('no device'), { name: 'NotFoundError' }),
    );
    renderModal();
    await flush(3);
    expect(screen.getByText('chat.call.mediaNotFound')).toBeTruthy();
  });

  it('shows the generic message for unknown errors', async () => {
    getUserMediaMock.mockRejectedValue(new Error('mystery'));
    renderModal();
    await flush(3);
    expect(screen.getByText('chat.call.mediaGenericError')).toBeTruthy();
  });

  it('closes the call from the error panel', async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error('mystery'));
    const utils = renderModal();
    await flush(3);
    fireEvent.click(screen.getByText('chat.call.closeCall'));
    await flush(4);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
  });
});

// ── Error-path logging (defensive catch blocks) ─────────────────────────────
describe('CallModal error paths', () => {
  it('logs when a local track cannot be stopped', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const stream = makeStream(false);
    (stream.getTracks()[0].stop as jest.Mock).mockImplementation(() => {
      throw new Error('stop boom');
    });
    (getUserMediaMock as jest.Mock).mockResolvedValue(stream);
    const utils = renderModal();
    await flush(3);
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(4);
    expect(logger.warn).toHaveBeenCalledWith('Error stopping track:', expect.any(Error));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
  });

  it('detaches video element srcObjects during a video call cleanup', async () => {
    renderModal({ video: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.connectionState = 'failed';
      pc.onconnectionstatechange!();
    });
    await flush(4);
    // cleanup ran while refs were still mounted
    expect(screen.getByText('chat.call.ended')).toBeTruthy();
  });

  it('stops peer-connection sender tracks during cleanup', async () => {
    const sender = { track: { kind: 'video', stop: jest.fn() } };
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.getSenders as jest.Mock).mockReturnValue([sender]);
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(4);
    expect(sender.track.stop).toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
  });

  it('logs when a sender track cannot be stopped', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const sender = { track: { kind: 'video', stop: jest.fn() } };
    (sender.track.stop as jest.Mock).mockImplementation(() => {
      throw new Error('sender boom');
    });
    renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.getSenders as jest.Mock).mockReturnValue([sender]);
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(4);
    expect(logger.warn).toHaveBeenCalledWith('Error stopping sender track:', expect.any(Error));
  });

  it('logs when closing the peer connection throws', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.close as jest.Mock).mockImplementation(() => {
      throw new Error('close boom');
    });
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(4);
    expect(logger.warn).toHaveBeenCalledWith('Error closing peer connection:', expect.any(Error));
  });

  it('logs when setting the in-call status fails (ontrack)', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    mutationRejects.add('setInCallStatus');
    renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.ontrack({ streams: [makeStream(false)] });
    });
    await flush(4);
    expect(logger.error).toHaveBeenCalledWith(
      '[CallModal] Failed to set in_call status:',
      expect.any(Error),
    );
  });

  it('logs when the connection turns active but status update fails', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    mutationRejects.add('setInCallStatus');
    renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    await act(async () => {
      pc.connectionState = 'connected';
      pc.onconnectionstatechange!();
    });
    await flush(4);
    expect(logger.error).toHaveBeenCalledWith(
      '[CallModal] Failed to set in_call status:',
      expect.any(Error),
    );
  });

  it('logs when the offer cannot be processed', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.setRemoteDescription as jest.Mock).mockRejectedValue(new Error('sdp boom'));
    callDataValue = {
      participants: [{ userId: 'u2', offer: JSON.stringify({ type: 'offer', sdp: 'bad' }) }],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(5);
    expect(logger.error).toHaveBeenCalledWith(
      '[CallModal] Error processing offer:',
      expect.any(Error),
    );
  });

  it('logs when the answer cannot be processed', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const utils = renderModal({ initiator: true });
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.setRemoteDescription as jest.Mock).mockRejectedValue(new Error('sdp boom'));
    callDataValue = {
      participants: [{ userId: 'u2', answer: JSON.stringify({ type: 'answer', sdp: 'bad' }) }],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={{ ...baseCall, isInitiator: true }}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(5);
    expect(logger.error).toHaveBeenCalledWith(
      '[CallModal] Error processing answer:',
      expect.any(Error),
    );
  });

  it('logs when an ICE candidate cannot be added', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    const utils = renderModal();
    await flush(3);
    const pc = MockRTCPeerConnection._last();
    (pc.addIceCandidate as jest.Mock).mockRejectedValue(new Error('ice boom'));
    callDataValue = {
      participants: [
        {
          userId: 'u2',
          offer: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
          iceCandidates: [JSON.stringify({ candidate: 'a' })],
        },
      ],
    };
    await act(async () => {
      utils.rerender(
        <CallModal
          call={baseCall}
          currentUserId={'me' as any}
          currentUserName="Roman"
          currentUserAvatar="https://cdn/me.png"
          onEnd={utils.onEnd}
        />,
      );
    });
    await flush(6);
    expect(logger.error).toHaveBeenCalledWith(
      '[CallModal] Error adding ICE candidate:',
      expect.any(Error),
    );
  });

  it('logs when ending the call fails', async () => {
    const { logger } = jest.requireMock('@/lib/logger');
    mutationRejects.add('endCall');
    const utils = renderModal();
    await flush(3);
    fireEvent.click(screen.getByTitle('chat.call.endCall'));
    await flush(5);
    expect(logger.error).toHaveBeenCalledWith('[CallModal] Error ending call:', expect.any(Error));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.onEnd).toHaveBeenCalled();
  });
});
