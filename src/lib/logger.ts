/**
 * Logger utility for consistent logging across the application
 * In production, only errors are logged to avoid cluttering the console
 */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
  
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

