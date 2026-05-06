import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updatePassword,
  updateProfile
} from "firebase/auth";
import { Shield, Mail, Lock, ArrowRight, User, CheckCircle2, AlertCircle, Key, Loader2, Eye, EyeOff } from "lucide-react";
import { auth } from "../lib/firebase";
import { getDocument, setDocument, updateDocument, logAudit } from "../lib/firestore";
import { showErrorToast, showSuccessToast, getHumanReadableError } from "../lib/error-handler";
import { sendCustomVerificationEmail } from "../lib/api";
import { useTenant } from "../contexts/TenantContext";
import { ChurchLogo } from "../components/ChurchLogo";

type AuthMode = "signin" | "signup" | "forgot" | "verify" | "must-change";

export default function Login() {
  const { church } = useTenant();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const navigate = useNavigate();
  const namesRef = React.useRef({ firstName, lastName });

  useEffect(() => {
    namesRef.current = { firstName, lastName };
  }, [firstName, lastName]);

  const performAuthCheck = React.useCallback(async (user: any, manual = false, retryCount = 0): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      // Force reload to get latest verification status
      await user.reload();
      
      const updatedUser = auth.currentUser;
      if (!updatedUser) return;

      // Check verification for password provider
      const isPasswordProvider = updatedUser.providerData.some(p => p.providerId === "password");
      if (!updatedUser.emailVerified && isPasswordProvider) {
        setMode("verify");
        if (manual) {
          showErrorToast("Email not yet verified. Please check your inbox.");
        }
        setLoading(false);
        return;
      }

      // GET user document 
      let userDoc = await getDocument("users", updatedUser.uid) as any;
      
      if (!userDoc && updatedUser.email) {
        const isMasterAdmin = updatedUser.email === "oreutlwilediutlwileng@gmail.com";
        const [fName, ...lNameParts] = (updatedUser.displayName || "").split(" ");
        
        const churchId = church?.id || null;
        const churchSlug = church?.slug || null;

        userDoc = {
          uid: updatedUser.uid,
          email: updatedUser.email,
          firstName: namesRef.current.firstName || fName || "",
          lastName: namesRef.current.lastName || lNameParts.join(" ") || "",
          role: isMasterAdmin ? "master_admin" : "parent",
          roles: isMasterAdmin ? ["master_admin", "admin", "volunteer"] : ["parent"],
          churchId,
          churchSlug,
          status: isMasterAdmin ? "approved" : "incomplete_profile",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDocument("users", updatedUser.uid, userDoc);
        
        // Update Firebase Auth profile if names are available
        if (userDoc.firstName && userDoc.lastName) {
          await updateProfile(updatedUser, {
            displayName: `${userDoc.firstName} ${userDoc.lastName}`
          });
        }
        
        await logAudit({
          action: "user_signup_auto_create",
          category: "security",
          details: { email: updatedUser.email, role: userDoc.role },
          userId: updatedUser.uid,
          churchId: church?.id
        });
      }

      if (userDoc) {
        if (updatedUser.emailVerified && mode === "verify") {
          showSuccessToast("Email verified!", "Logging you in...");
        }
        const churchPrefix = userDoc.churchSlug ? `/${userDoc.churchSlug}` : "";
        if (userDoc.status === "incomplete_profile") navigate("/complete-profile");
        else if (userDoc.status === "rejected") navigate("/rejected");
        else if (userDoc.role === "master_admin") navigate("/master-admin");
        else if (userDoc.role === "admin") navigate(`${churchPrefix}/admin`);
        else if (userDoc.role === "volunteer") navigate(`${churchPrefix}/volunteer`);
        else if (userDoc.role === "parent") navigate(`${churchPrefix}/parent`);
        else navigate("/");
      }
    } catch (err: any) {
      if (retryCount < 2 && (err.code === "auth/network-request-failed" || err.message?.includes("network"))) {
        console.warn(`Auth check failed, retrying... (${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return performAuthCheck(user, manual, retryCount + 1);
      }
      console.error("Auth state change error:", err);
      const { message } = getHumanReadableError(err);
      setError(message);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  }, [church, navigate]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        performAuthCheck(user);
      }
    });
    return () => unsubscribe();
  }, [performAuthCheck]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDocument("users", user.uid) as any;
      
      // Extract name parts
      const displayName = user.displayName || "";
      const nameParts = displayName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const photoUrl = user.photoURL || "";
      const phone = user.phoneNumber || "";

      if (!userDoc) {
        const isMasterAdmin = user.email === "oreutlwilediutlwileng@gmail.com";
        
        // Determine church from context if available
        const churchId = church?.id || null;
        const churchSlug = church?.slug || null;

        await setDocument("users", user.uid, {
          uid: user.uid,
          email: user.email,
          firstName,
          lastName,
          photoUrl,
          phone,
          role: isMasterAdmin ? "master_admin" : "parent",
          roles: isMasterAdmin ? ["master_admin", "admin", "volunteer"] : ["parent"],
          churchId,
          churchSlug,
          status: isMasterAdmin ? "approved" : "incomplete_profile",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await logAudit({
          action: "google_signup",
          category: "security",
          details: { email: user.email },
          userId: user.uid,
          churchId: church?.id
        });
      } else {
        // Update missing info
        const updates: any = {};
        if (!userDoc.photoUrl && photoUrl) updates.photoUrl = photoUrl;
        if (!userDoc.firstName && firstName) updates.firstName = firstName;
        if (!userDoc.lastName && lastName) updates.lastName = lastName;
        if (!userDoc.phone && phone) updates.phone = phone;
        
        // Ensure master admin has correct roles even if they already existed
        const isMasterAdmin = user.email === "oreutlwilediutlwileng@gmail.com";
        if (isMasterAdmin && (!userDoc.roles || userDoc.roles.length < 3)) {
          updates.roles = ["master_admin", "admin", "volunteer"];
          updates.role = "master_admin";
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDocument("users", user.uid, updates);
        }
      }
    } catch (err: any) {
      console.error(err);
      const { message } = getHumanReadableError(err);
      setError(message);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (pass: string) => {
    const requirements = [
      { regex: /.{8,}/, label: "At least 8 characters" },
      { regex: /[A-Z]/, label: "At least one uppercase letter" },
      { regex: /[a-z]/, label: "At least one lowercase letter" },
      { regex: /[0-9]/, label: "At least one number" },
      { regex: /[^A-Za-z0-9]/, label: "At least one special character" },
    ];
    return requirements.every(req => req.regex.test(pass));
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "signup") {
      if (!validatePassword(password)) {
        setError("Password does not meet requirements: 8+ chars, uppercase, lowercase, number, and special char.");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
    }

    try {
      if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: `${firstName} ${lastName}` });
        
        try {
          const token = await result.user.getIdToken();
          await sendCustomVerificationEmail(token);
        } catch (emailErr) {
          console.error("Failed to send custom verification email:", emailErr);
          // Fallback or ignore? User already created.
        }
        
        // Determine church from context if available
        const churchId = church?.id || null;
        const churchSlug = church?.slug || null;

        await setDocument("users", result.user.uid, {
          uid: result.user.uid,
          email: email,
          firstName: firstName,
          lastName: lastName,
          role: "parent",
          roles: ["parent"],
          churchId,
          churchSlug,
          status: "incomplete_profile",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await logAudit({
          action: "email_signup",
          category: "security",
          details: { email },
          userId: result.user.uid,
          churchId: church?.id
        });
        
        setMode("verify");
        showSuccessToast("Account created!", "Please check your email for verification.");
      } else if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      const { message } = getHumanReadableError(err);
      setError(message);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      showSuccessToast("Password reset link sent!", "Please check your email.");
      setMode("signin");
    } catch (err: any) {
      const { message } = getHumanReadableError(err);
      setError(message);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    if (!validatePassword(newPassword)) {
      setError("Password does not meet requirements: 8+ chars, uppercase, lowercase, number, and special char.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updatePassword(auth.currentUser, newPassword);
      await updateDocument("users", auth.currentUser.uid, { mustChangePassword: false });
      showSuccessToast("Password updated!", "You can now sign in with your new password.");
      navigate("/");
    } catch (err: any) {
      const { message } = getHumanReadableError(err);
      setError(message);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (mode === "verify") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 text-center space-y-6 border border-gray-100 dark:border-gray-800">
          <div className="mx-auto h-20 w-20 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center">
            <Mail className="h-10 w-10 text-primary dark:text-primary/80" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Verify Your Email</h2>
          <p className="text-gray-500 dark:text-gray-400">
            We've sent a verification link to <span className="font-bold text-gray-900 dark:text-white">{auth.currentUser?.email}</span>. 
            Please check your inbox and click the link to continue.
          </p>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
            <p><strong>Note:</strong> If you've already verified, click the button below to refresh your status.</p>
          </div>
          <div className="space-y-4">
            <button 
              onClick={async () => {
                if (!auth.currentUser) return;
                await performAuthCheck(auth.currentUser, true);
              }}
              disabled={loading}
              className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {loading ? "Checking..." : "I've Verified My Email"}
            </button>
            <button 
              onClick={async () => {
                if (!auth.currentUser) return;
                setLoading(true);
                try {
                  const token = await auth.currentUser.getIdToken();
                  await sendCustomVerificationEmail(token);
                  showSuccessToast("Verification email resent!", "Please check your inbox.");
                } catch (e: any) {
                  const { message } = getHumanReadableError(e);
                  showErrorToast(e);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full text-primary dark:text-primary/80 font-semibold hover:underline"
            >
              Resend Verification Email
            </button>
            <button 
              onClick={() => auth.signOut().then(() => setMode("signin"))}
              className="w-full text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-700 dark:hover:text-gray-200"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "must-change") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 space-y-8 border border-gray-100 dark:border-gray-800">
          <div className="text-center space-y-2">
            <div className="mx-auto h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-4">
              <Key className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Change Password</h2>
            <p className="text-gray-500 dark:text-gray-400">You must change your password on first login</p>
          </div>
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/30 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  required
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                8+ chars, uppercase, lowercase, number, special char.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  required
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button 
              disabled={loading}
              className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800">
        <div className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center mb-4">
            <ChurchLogo 
              logoUrl={church?.branding?.logoUrl} 
              name={church?.name} 
              className="h-10 w-10 object-contain"
              fallbackClassName="h-10 w-10 text-primary dark:text-primary/80"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {mode === "signin" ? "Welcome Back" : mode === "signup" ? "Create Account" : "Reset Password"}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {mode === "signin" ? "Sign in to manage your children's check-in" : 
             mode === "signup" ? "Join our church community today" : 
             "Enter your email to receive a reset link"}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/30 flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {mode !== "forgot" && (
            <>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-3 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 p-4 rounded-xl font-semibold hover:border-primary dark:hover:border-primary/80 hover:text-primary dark:hover:text-primary/80 transition-all disabled:opacity-50 dark:text-white"
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5" />
                <span>Continue with Google</span>
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100 dark:border-gray-800"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500">Or use email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={mode === "forgot" ? handleForgotPassword : handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                  <input
                    required
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                  <input
                    required
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@church.com"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Password</label>
                    {mode === "signin" && (
                      <button 
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs font-semibold text-primary dark:text-primary/80 hover:underline"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {mode === "signup" && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      8+ chars, uppercase, lowercase, number, special char.
                    </p>
                  )}
                </div>

                {mode === "signup" && (
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        required
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button 
              disabled={loading}
              className="w-full bg-primary text-white p-4 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/10 dark:shadow-none"
            >
              <span>
                {loading ? "Processing..." : 
                 mode === "signin" ? "Sign In" : 
                 mode === "signup" ? "Create Account" : 
                 "Send Reset Link"}
              </span>
              {!loading && <ArrowRight className="h-5 w-5" />}
            </button>
          </form>
        </div>

        <div className="text-center space-y-4">
          {mode === "signin" ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Don't have an account?{" "}
              <button onClick={() => setMode("signup")} className="text-primary dark:text-primary/80 font-bold hover:underline">
                Sign Up
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-primary dark:text-primary/80 font-bold hover:underline">
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
