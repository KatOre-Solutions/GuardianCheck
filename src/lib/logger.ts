/**
 * Global Logger Utility
 * Controls console output based on VITE_DEV_MODE environment variable.
 */

const getDevMode = () => {
  const envVal = import.meta.env.VITE_DEV_MODE;
  if (typeof envVal === 'boolean') return envVal;
  return String(envVal).toLowerCase() === "true";
};

const isDev = getDevMode();

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log("%c[LOG]", "color: #3b82f6; font-weight: bold", ...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info("%c[INFO]", "color: #10b981; font-weight: bold", ...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn("%c[WARN]", "color: #f59e0b; font-weight: bold", ...args);
  },
  error: (...args: any[]) => {
    if (isDev) console.error("%c[ERROR]", "color: #ef4444; font-weight: bold", ...args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug("%c[DEBUG]", "color: #8b5cf6; font-weight: bold", ...args);
  },
  isDevEnabled: () => isDev
};

export default logger;
