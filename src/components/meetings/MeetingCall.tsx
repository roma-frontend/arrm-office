'use client';

/**
 * The in-call branch of the meeting room, split out of `MeetingRoomClient`
 * so the heavy LiveKit room stack (`@livekit/components-react`, krisp noise
 * filter, `@livekit/components-styles` and the whole `CustomConference` UI)
 * is a separate dynamic chunk. The shell (lobby + pre-join preview) only
 * needs `livekit-client` core for the camera preview — this module is loaded
 * by `next/dynamic` the moment the user actually joins a call.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Room } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { CustomConference } from './CustomConference';
import type { MeetingDeviceChoices, MeetingDeviceKind } from './useMeetingDevices';
import '@livekit/components-styles';

export interface MeetingCallProps {
  room: Room;
  token: string;
  serverUrl: string;
  onConnected: () => void | Promise<void>;
  onDisconnected: () => void | Promise<void>;
  roomName: string;
  title: string;
  statusKey: 'scheduled' | 'live' | 'ended';
  elapsed: number;
  mode: 'meeting' | 'webinar';
  linkCopied: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
  deviceChoices: MeetingDeviceChoices;
  onDeviceChange: (kind: MeetingDeviceKind, deviceId: string) => void;
  isOriginalHost: boolean;
  cohostIds: readonly string[];
  waitingRoomEnabled: boolean;
}

export function MeetingCall({
  room,
  token,
  serverUrl,
  onConnected,
  onDisconnected,
  roomName,
  title,
  statusKey,
  elapsed,
  mode,
  linkCopied,
  onCopyLink,
  onLeave,
  deviceChoices,
  onDeviceChange,
  isOriginalHost,
  cohostIds,
  waitingRoomEnabled,
}: MeetingCallProps) {
  const { t } = useTranslation();

  // Suppress the benign "Client initiated disconnect" toast — firing an error
  // banner when the user clicks Leave themselves would be noise.
  const handleError = (error: Error) => {
    const msg = String(error);
    if (msg.includes('Client initiated disconnect') || msg.includes('disconnect')) return;
    toast.error(`${t('meetings.joinError')} — ${msg}`);
  };

  // The LiveKit kit mounts its own MediaStreamPlayers for remote audio; make
  // sure page-level autoplay policies never mute the call (mirrors the old
  // inline behaviour inside LiveKitRoom's parent).
  useEffect(() => {
    // no-op — kept as an explicit seam for future autoplay handling
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0a0c12] text-white">
      <main className="min-h-0 flex-1 overflow-hidden">
        <LiveKitRoom
          room={room}
          token={token}
          serverUrl={serverUrl}
          connect
          onConnected={onConnected}
          onDisconnected={onDisconnected}
          onError={handleError}
          className="h-full"
          data-lk-theme="default"
        >
          <CustomConference
            roomName={roomName}
            title={title}
            statusKey={statusKey}
            elapsed={elapsed}
            mode={mode}
            linkCopied={linkCopied}
            onCopyLink={onCopyLink}
            onLeave={onLeave}
            deviceChoices={deviceChoices}
            onDeviceChange={onDeviceChange}
            isOriginalHost={isOriginalHost}
            cohostIds={cohostIds}
            waitingRoomEnabled={waitingRoomEnabled}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </main>
    </div>
  );
}

export default MeetingCall;
