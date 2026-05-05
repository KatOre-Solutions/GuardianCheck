/**
 * Global Logger Utility
 * Controls console output and remote reporting for client/server errors.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'critical';

interface LogContext {
  [key: string]: any;
}

const getDevMode = () => {
  const envVal = import.meta.env.VITE_DEV_MODE;
  if (typeof envVal === 'boolean') return envVal;
  return String(envVal).toLowerCase() === "true";
};

const isDev = getDevMode();

// Sensitive keys to redact
const REDACTED_KEYS = ['password', 'token', 'pin', 'api_key', 'passphrase', 'secret', 'auth', 'credential'];

const redact = (data: any): any => {
  if (!data) return data;
  if (typeof data !== 'object') return data;
  
  const copy = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in copy) {
    if (REDACTED_KEYS.some(k => key.toLowerCase().includes(k))) {
      copy[key] = '[REDACTED]';
    } else if (typeof copy[key] === 'object') {
      copy[key] = redact(copy[key]);
    }
  }
  
  return copy;
};

const sendRemoteLog = async (level: LogLevel, message: string, context?: LogContext) => {
  try {
    // We only send error/critical to server to avoid flood
    if (level !== 'error' && level !== 'critical') return;

    const payload = {
      level,
      message,
      context: redact(context),
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      source: typeof window !== 'undefined' ? 'client' : 'server'
    };

    // Use beacon for client-side to ensure it sends even if page is closing
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/log-client-error', blob);
    } else {
      fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {}); // Fire and forget
    }
  } catch (e) {
    // Fail silently to avoid recursion
  }
};

export const logger = {
  log: (message: string, context?: LogContext) => {
    if (isDev) console.log("%c[LOG]", "color: #3b82f6; font-weight: bold", message, redact(context));
  },
  info: (message: string, context?: LogContext) => {
    if (isDev) console.info("%c[INFO]", "color: #10b981; font-weight: bold", message, redact(context));
  },
  warn: (message: string, context?: LogContext) => {
    if (isDev) console.warn("%c[WARN]", "color: #f59e0b; font-weight: bold", message, redact(context));
  },
  error: (message: string, context?: LogContext) => {
    console.error("%c[ERROR]", "color: #ef4444; font-weight: bold", message, redact(context));
    sendRemoteLog('error', message, context);
  },
  critical: (message: string, context?: LogContext) => {
    console.error("%c[CRITICAL]", "color: #7f1d1d; background: #fee2e2; font-weight: bold", message, redact(context));
    sendRemoteLog('critical', message, context);
  },
  debug: (message: string, context?: LogContext) => {
    if (isDev) console.debug("%c[DEBUG]", "color: #8b5cf6; font-weight: bold", message, redact(context));
  },
  isDevEnabled: () => isDev
};

export default logger;
