import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getInvitationByToken } from "../lib/firestore";
import { Shield, Lock, User, Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  
  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("Invalid or missing invitation token.");
        setLoading(false);
        return;
      }

      try {
        const invite = await getInvitationByToken(token) as any;
        if (!invite) {
          setError("Invitation not found or already used.");
        } else if (new Date(invite.expiresAt) < new Date()) {
          setError("This invitation has expired.");
        } else {
          setInvitation(invite);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to validate invitation.");
      } finally {
        setLoading(false);
      }
    }

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showErrorToast("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      showErrorToast("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      // 2. Sign in the user automatically so they see the verification screen immediately
      await signInWithEmailAndPassword(auth, invitation.email, password);

      showSuccessToast("Account created!", "Please check your email to verify your account.");
      navigate("/login");
    } catch (err: any) {
      console.error(err);
      showErrorToast(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="text-gray-500 font-medium">Validating invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 text-center space-y-6">
        <div className="h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invalid Invitation</h2>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="w-full bg-gray-900 dark:bg-white dark:text-gray-900 text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
        >
          Back to Login
        </button>
      </div>
    );
  }

  // Check if user is already logged in as someone else
  if (auth.currentUser && invitation && auth.currentUser.email !== invitation.email) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 text-center space-y-6">
        <div className="h-16 w-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Session Conflict</h2>
          <p className="text-gray-500 dark:text-gray-400">
            You are currently logged in as <span className="font-bold text-gray-900 dark:text-white">{auth.currentUser.email}</span>. 
            To accept this invitation for <span className="font-bold text-gray-900 dark:text-white">{invitation.email}</span>, please logout first.
          </p>
        </div>
        <button 
          onClick={() => auth.signOut().then(() => window.location.reload())}
          className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-all"
        >
          Logout and Continue
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 space-y-8">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Welcome!</h2>
          <p className="text-gray-500 dark:text-gray-400">Complete your profile to join the community</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl space-y-3">
          <div className="flex items-center space-x-3 text-sm">
            <User className="h-4 w-4 text-primary" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {invitation.firstName} {invitation.lastName}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{invitation.email}</span>
          </div>
          <div className="flex items-center space-x-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">Role: {invitation.role}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">Create Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
