import { toast } from "sonner";

export enum ErrorCode {
  PERMISSION_DENIED = "permission-denied",
  NOT_FOUND = "not-found",
  UNAVAILABLE = "unavailable",
  QUOTA_EXCEEDED = "quota-exceeded",
  NETWORK_ERROR = "network-error",
  AUTH_USER_NOT_FOUND = "auth/user-not-found",
  AUTH_WRONG_PASSWORD = "auth/wrong-password",
  AUTH_NETWORK_REQUEST_FAILED = "auth/network-request-failed",
  AUTH_EMAIL_ALREADY_IN_USE = "auth/email-already-in-use",
  AUTH_INVALID_EMAIL = "auth/invalid-email",
  AUTH_INVALID_CREDENTIAL = "auth/invalid-credential",
  AUTH_WEAK_PASSWORD = "auth/weak-password",
  AUTH_TOO_MANY_REQUESTS = "auth/too-many-requests",
  AUTH_POPUP_CLOSED = "auth/popup-closed-by-user",
  UNKNOWN = "unknown",
}

interface ErrorMessage {
  title: string;
  message: string;
  actionable?: string;
}

const ERROR_MAP: Record<string, ErrorMessage> = {
  [ErrorCode.PERMISSION_DENIED]: {
    title: "Access Restricted",
    message: "You don't have permission to perform this action.",
    actionable: "Please contact your church administrator if you believe this is an error.",
  },
  [ErrorCode.NOT_FOUND]: {
    title: "Not Found",
    message: "The requested information could not be found.",
    actionable: "Please check the link or try searching again.",
  },
  [ErrorCode.UNAVAILABLE]: {
    title: "Service Unavailable",
    message: "The service is temporarily offline.",
    actionable: "Please check your internet connection and try again in a moment.",
  },
  [ErrorCode.QUOTA_EXCEEDED]: {
    title: "System Busy",
    message: "We're experiencing high traffic right now.",
    actionable: "Please wait a minute and try your action again.",
  },
  [ErrorCode.NETWORK_ERROR]: {
    title: "Connection Issue",
    message: "We're having trouble reaching our servers.",
    actionable: "Ensure you are connected to the internet and try again.",
  },
  [ErrorCode.AUTH_USER_NOT_FOUND]: {
    title: "Invalid Credentials",
    message: "Invalid email or password. Please check your details and try again.",
    actionable: "Double-check your spelling or use the 'Forgot Password' link.",
  },
  [ErrorCode.AUTH_WRONG_PASSWORD]: {
    title: "Invalid Credentials",
    message: "Invalid email or password. Please check your details and try again.",
    actionable: "Please try again or use the 'Forgot Password' link to reset it.",
  },
  [ErrorCode.AUTH_NETWORK_REQUEST_FAILED]: {
    title: "Network Error",
    message: "A network error occurred while trying to sign in.",
    actionable: "Check your connection and try again.",
  },
  [ErrorCode.AUTH_EMAIL_ALREADY_IN_USE]: {
    title: "Email Already Registered",
    message: "This email address is already in use by another account.",
    actionable: "Try signing in instead, or use a different email address.",
  },
  [ErrorCode.AUTH_INVALID_EMAIL]: {
    title: "Invalid Credentials",
    message: "Invalid email or password. Please check your details and try again.",
    actionable: "Please enter a valid email address (e.g., name@example.com).",
  },
  [ErrorCode.AUTH_INVALID_CREDENTIAL]: {
    title: "Invalid Credentials",
    message: "Invalid email or password. Please check your details and try again.",
    actionable: "Please try again or use the 'Forgot Password' link to reset it.",
  },
  [ErrorCode.AUTH_WEAK_PASSWORD]: {
    title: "Weak Password",
    message: "The password you chose is too weak.",
    actionable: "Passwords must be at least 8 characters and include a mix of letters and numbers.",
  },
  [ErrorCode.AUTH_TOO_MANY_REQUESTS]: {
    title: "Too Many Attempts",
    message: "We've blocked all requests from this device due to unusual activity.",
    actionable: "Please try again later or reset your password.",
  },
  [ErrorCode.AUTH_POPUP_CLOSED]: {
    title: "Sign-in Cancelled",
    message: "The sign-in window was closed before it could complete.",
    actionable: "Please try signing in again and keep the window open.",
  },
  [ErrorCode.UNKNOWN]: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred.",
    actionable: "Please try again. If the problem persists, contact support.",
  },
};

export function getHumanReadableError(error: any): ErrorMessage {
  let code = ErrorCode.UNKNOWN;

  // 1. Handle Error object with JSON message (from firestore.ts)
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.humanTitle) {
        return {
          title: parsed.humanTitle,
          message: parsed.humanMessage,
          actionable: parsed.humanActionable
        };
      }
      if (parsed.error) {
        if (parsed.error.includes("permission-denied")) code = ErrorCode.PERMISSION_DENIED;
        else if (parsed.error.includes("not-found")) code = ErrorCode.NOT_FOUND;
        else if (parsed.error.includes("unavailable")) code = ErrorCode.UNAVAILABLE;
      }
    } catch (e) {
      // Not JSON, fall through to generic handling
    }
  }

  // 2. Handle Firebase/Firestore errors directly
  if (error?.code) {
    code = error.code;
  } 
  // 3. Handle raw string errors
  else if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      if (parsed.humanTitle) {
        return {
          title: parsed.humanTitle,
          message: parsed.humanMessage,
          actionable: parsed.humanActionable
        };
      }
      if (parsed.error) {
        if (parsed.error.includes("permission-denied")) code = ErrorCode.PERMISSION_DENIED;
        else if (parsed.error.includes("not-found")) code = ErrorCode.NOT_FOUND;
        else if (parsed.error.includes("unavailable")) code = ErrorCode.UNAVAILABLE;
      }
    } catch (e) {
      // Not JSON - return the string as the message
      return {
        title: "Action Failed",
        message: error,
        actionable: "Please review the message above and try again."
      };
    }
  }

  return ERROR_MAP[code] || ERROR_MAP[ErrorCode.UNKNOWN];
}

export function showErrorToast(error: any) {
  const { title, message, actionable } = getHumanReadableError(error);
  
  toast.error(title, {
    description: (
      <div className="mt-1">
        <p>{message}</p>
        {actionable && <p className="mt-2 text-xs opacity-80 font-medium">{actionable}</p>}
      </div>
    ),
    duration: 5000,
  });
}

export function showSuccessToast(title: string, message?: string) {
  toast.success(title, {
    description: message,
    duration: 3000,
  });
}

export function showInfoToast(title: string, message?: string) {
  toast.info(title, {
    description: message,
    duration: 4000,
  });
}
