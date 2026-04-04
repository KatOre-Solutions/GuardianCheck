import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAuthErrorMessage(error: any): string {
  if (!error) return "An unknown error occurred";
  
  const code = error.code || error.message || "";
  
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Please sign in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/user-not-found":
      return "Email address incorrect.";
    case "auth/wrong-password":
      return "Password incorrect.";
    case "auth/weak-password":
      return "Password is too weak. It must be at least 6 characters.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled. Please contact support.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completion.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    case "auth/requires-recent-login":
      return "This action requires you to sign in again for security.";
    default:
      // Handle cases where the message contains the code
      if (typeof code === 'string') {
        if (code.includes("email-already-in-use")) return "This email is already registered. Please sign in instead.";
        if (code.includes("network-request-failed")) return "Network error. Please check your internet connection and try again.";
        if (code.includes("invalid-credential")) return "Email address or password incorrect.";
      }
      return error.message || "An error occurred during authentication";
  }
}
