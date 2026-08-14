'use client';

import { useState } from 'react';
import { ChatWidgetButton } from './ChatWidgetButton';
import { ChatWidgetWindow } from './ChatWidgetWindow';
import { useChatWidgetAI } from './useChatWidgetAI';
import { useGlobalShortcut } from '@/hooks/useGlobalShortcut';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  // ⌘J / Ctrl+J opens or closes the floating AI assistant from anywhere in the
  // dashboard — the brief's persistent assistant with a keyboard shortcut.
  // ⌘K is already taken by the command palette, so the assistant gets J.
  useGlobalShortcut({ key: 'j', meta: true }, () => setIsOpen((open) => !open));

  // Drag-to-dock state
  const [docked, setDocked] = useState(false);
  const [dockedSide, setDockedSide] = useState<'right' | 'left'>('right');
  const [dockedY, setDockedY] = useState(50);

  const {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    error,
    isListening,
    wakeWordActive,
    inputRef,
    user,
    sendMessage,
    handleAction,
    startVoiceInput,
    stopGeneration,
    t,
    i18n,
    router,
  } = useChatWidgetAI();

  return (
    <>
      <ChatWidgetButton
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        wakeWordActive={wakeWordActive}
        docked={docked}
        setDocked={setDocked}
        dockedSide={dockedSide}
        setDockedSide={setDockedSide}
        dockedY={dockedY}
        setDockedY={setDockedY}
      />

      <ChatWidgetWindow
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        docked={docked}
        dockedSide={dockedSide}
        dockedY={dockedY}
        messages={messages}
        setMessages={setMessages}
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        error={error}
        isListening={isListening}
        inputRef={inputRef}
        user={user}
        sendMessage={sendMessage}
        handleAction={handleAction}
        startVoiceInput={startVoiceInput}
        stopGeneration={stopGeneration}
        router={router}
        t={t}
        i18n={i18n}
      />
    </>
  );
}

export default ChatWidget;
