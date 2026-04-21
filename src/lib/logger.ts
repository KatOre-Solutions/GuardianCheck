/**
 * Global Logger Utility
 * Controls console output based on VITE_DEV_MODE environment variable.
 */

const isDev = String(import.meta.env.VITE_DEV_MODE).toLowerCase() === "true";

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: any[]) => {
    // We allow errors to be logged but optionally we could sanitize them
    if (isDev) console.error(...args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  },
  // Explicit check for when logic needs to branch
  isDevEnabled: () => isDev
};

export default logger;
