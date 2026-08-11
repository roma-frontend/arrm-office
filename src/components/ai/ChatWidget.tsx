'use client';

import { useState } from 'react';
import { ChatWidgetButton } from './ChatWidgetButton';
import { ChatWidgetWindow } from './ChatWidgetWindow';
import { useChatWidgetAI } from './useChatWidgetAI';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

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
