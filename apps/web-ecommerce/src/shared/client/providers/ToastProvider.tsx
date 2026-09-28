'use client';

import { useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import { Events, eventEmitter } from '@/shared/client/utils/eventEmitter';

interface ToastProviderProps {
  children: React.ReactNode;
}

interface ValidationMessagesEvent {
  title?: string;
  validationMessages?: string[];
}

export default function ToastProvider({ children }: ToastProviderProps) {
  // Validation messages returned by the API (ApiResponse.userValidationMessages) are shown as an error toast.
  useEffect(() => {
    eventEmitter.subscribe(Events.OPEN_MODAL_MESSAGES_ERRORS, ({ title, validationMessages }: ValidationMessagesEvent) => {
      const lines = [title, ...(validationMessages || []).map((message) => `• ${message}`)].filter(Boolean);
      toast.error(lines.join('\n'), { style: { whiteSpace: 'pre-line' } });
    });
    return () => eventEmitter.unsubscribe(Events.OPEN_MODAL_MESSAGES_ERRORS);
  }, []);

  return (
    <>
      {children}
      <ToastContainer position="top-center" />
    </>
  );
}
