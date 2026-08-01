/* eslint-disable no-console -- this logger module intentionally wraps console methods */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  time: (label: string) => {
    if (isDev) console.time(label);
    return () => {
      if (isDev) console.timeEnd(label);
    };
  },
  api: {
    call: (method: string, endpoint: string, payload?: Record<string, unknown>) => {
      if (isDev) logger.log(`[API] ${method} ${endpoint}`, payload);
    },
    response: (
      method: string,
      endpoint: string,
      status: number,
      data?: Record<string, unknown>,
    ) => {
      if (isDev) console.log(`[API] ${method} ${endpoint} → ${status}`, data);
    },
  },
};

export const log = logger;
