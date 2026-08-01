'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { generateCSRFToken } from '@/lib/security';

interface CSRFContextType {
  token: string | null;
  refreshToken: () => void;
}

const CSRFContext = createContext<CSRFContextType>({
  token: null,
  refreshToken: () => {},
});

export function CSRFProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  const refreshToken = () => {
    const newToken = generateCSRFToken();
    setToken(newToken);
    // Сохраняем в sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('csrf_token', newToken);
    }
  };

  useEffect(() => {
    // Проверяем существующий токен
    if (typeof window !== 'undefined') {
      const existingToken = sessionStorage.getItem('csrf_token');
      if (existingToken) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate CSRF token from sessionStorage on mount
        setToken(existingToken);
      } else {
        refreshToken();
      }
    }
  }, []);

  return <CSRFContext.Provider value={{ token, refreshToken }}>{children}</CSRFContext.Provider>;
}

export function useCSRF() {
  return useContext(CSRFContext);
}

/**
 * Компонент скрытого поля CSRF для форм
 */
export function CSRFInput() {
  const { token } = useCSRF();

  if (!token) return null;

  return <input type="hidden" name="_csrf" value={token} />;
}

/**
 * Hook для добавления CSRF токена в fetch запросы
 */
export function useSecureFetch() {
  const { token } = useCSRF();

  const secureFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);

    if (token) {
      headers.set('X-CSRF-Token', token);
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  return secureFetch;
}
