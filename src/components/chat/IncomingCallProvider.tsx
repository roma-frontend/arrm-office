'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { CallModal } from './CallModal';
import type { ActiveCall } from './ChatClient';
import { Phone, Video, PhoneOff } from 'lucide-react';
import { playChatMessageSound } from '@/lib/notificationSound';
import { useTranslation } from 'react-i18next';

export function IncomingCallProvider() {
  const { user } = useAuthStore();
  const { selectedOrgId } = useOrgSelectorStore();
  const { t } = useTranslation();

  const uid = user?.id as Id<'users'> | undefined;
  const orgId = user?.organizationId as Id<'organizations'> | undefined;
  const effectiveOrgId = selectedOrgId ? (selectedOrgId as Id<'organizations'>) : orgId;

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCall | null>(null);

  const conversations = useQuery(
    api.chat.queries.getMyConversations,
    uid ? { userId: uid, organizationId: effectiveOrgId } : 'skip',
  );

  const incomingCallData = useQuery(
    api.chat.calls.getIncomingCalls,
    uid && effectiveOrgId ? { userId: uid, organizationId: effectiveOrgId } : 'skip',
  );

  const answerCallMutation = useMutation(api.chat.calls.answerCall);
  const declineCallMutation = useMutation(api.chat.calls.declineCall);

  // Detect incoming calls globally
  useEffect(() => {
    if (!uid) return;

    if (incomingCallData && incomingCallData.status === 'ringing') {
      let initiatorName = 'Someone';

      if (conversations) {
        const conv = conversations.find((c) => c && c._id === incomingCallData.conversationId);
        if (conv) {
          const initiatorMember = (conv as any).members?.find(
            (m: { userId: Id<'users'> }) => m.userId === incomingCallData.initiatorId,
          );
          initiatorName = initiatorMember?.user?.name ?? (conv as any).otherUser?.name ?? 'Someone';
        }
      }

      setIncomingCall({
        callId: incomingCallData._id,
        conversationId: incomingCallData.conversationId,
        type: incomingCallData.type,
        isInitiator: false,
        remoteUserId: incomingCallData.initiatorId,
        remoteUserName: initiatorName,
      });

      if (!activeCall) {
        playChatMessageSound();
      }
    } else {
      if (!activeCall) {
        setIncomingCall(null);
      }
    }
  }, [incomingCallData, conversations, uid, activeCall]);

  const handleEndCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  if (!uid || !effectiveOrgId) return null;

  return (
    <>
      {/* Active Call Modal */}
      {activeCall && (
        <CallModal
          call={activeCall}
          currentUserId={uid}
          currentUserName={user?.name ?? ''}
          currentUserAvatar={user?.avatar}
          onEnd={handleEndCall}
        />
      )}

      {/* Incoming Call Modal — shown globally on any page */}
      {incomingCall && !activeCall && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
          <div
            className="relative w-80 rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
          >
            {/* Animated ring */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-linear-to-br from-purple-600 to-blue-600">
                <span className="text-white text-2xl font-bold">
                  {incomingCall.remoteUserName?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
              <span className="absolute inset-0 rounded-full ring-4 ring-green-500/40 animate-ping" />
              <span
                className="absolute inset-0 rounded-full ring-4 ring-green-500/20 animate-ping"
                style={{ animationDelay: '0.5s' }}
              />
            </div>

            <div className="text-center">
              <p className="text-white font-semibold text-lg">{incomingCall.remoteUserName}</p>
              <p className="text-white/60 text-sm flex items-center justify-center gap-1 mt-1">
                {incomingCall.type === 'video' ? (
                  <>
                    <Video className="w-3.5 h-3.5" /> {t('chat.call.incomingVideo')}
                  </>
                ) : (
                  <>
                    <Phone className="w-3.5 h-3.5" /> {t('chat.call.incomingAudio')}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-6 mt-2">
              {/* Decline */}
              <button
                onClick={async () => {
                  try {
                    await declineCallMutation({ callId: incomingCall.callId, userId: uid });
                  } catch {}
                  setIncomingCall(null);
                }}
                className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-all hover:scale-110 shadow-lg shadow-red-500/30"
                title={t('chat.call.decline')}
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>

              {/* Accept */}
              <button
                onClick={async () => {
                  try {
                    await answerCallMutation({ callId: incomingCall.callId, userId: uid });
                  } catch (e) {
                    console.error('[IncomingCallProvider] Error answering call:', e);
                  }
                  setActiveCall(incomingCall);
                  setIncomingCall(null);
                }}
                className="w-14 h-14 rounded-full flex items-center justify-center bg-green-500 hover:bg-green-600 transition-all hover:scale-110 shadow-lg shadow-green-500/30"
                title={t('chat.call.accept')}
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
