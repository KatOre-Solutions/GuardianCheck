import React, { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { addDocument, setDocument } from "../lib/firestore";
import { safeFetch, sendCustomVerificationEmail } from "../lib/api";
import { Shield, Building2, User, Mail, Lock, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";

export default function RegisterChurch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("starter");

  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan && ["starter", "growth", "professional"].includes(plan.toLowerCase())) {
      setSelectedPlan(plan.toLowerCase());
    }
  }, [searchParams]);

  const [formData, setFormData] = useState({
    churchName: "",
    adminFirstName: "",
    adminLastName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      showErrorToast("Passwords do not match");
      return;
    }
    if (formData.password.length < 6) {
      showErrorToast("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;
      
      // 2. Register Church via API
      const token = await user.getIdToken();
      const result = await safeFetch("/api/register-church", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          churchName: formData.churchName,
          adminFirstName: formData.adminFirstName,
          adminLastName: formData.adminLastName,
          plan: selectedPlan
        })
      });

      if (!result.ok) {
        // If registration fails, delete the auth user to prevent inconsistent state
        try {
          await user.delete();
        } catch (deleteErr) {
          console.error("Failed to delete user after failed registration", deleteErr);
          await auth.signOut();
        }
        throw new Error(result.error || "Failed to register church");
      }

      const { slug } = result.data;

      showSuccessToast("Church registered successfully! Welcome to GuardianCheck.");
      
      // Wait a moment for Firestore indexing/listeners to catch up
      setTimeout(() => {
        navigate(`/${slug}/admin`);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        showErrorToast("This email is already registered. Please log in instead.");
      } else {
        showErrorToast(err.message || "An error occurred during registration");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Side: Info */}
        <div className="hidden lg:block space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
              Start Your <span className="text-primary">14-Day Free Trial</span> Today
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Join the community of churches prioritizing safety and simplicity. No credit card required to start.
            </p>
          </div>

          <div className="space-y-6">
            {[
              "Instant QR code generation for all children",
              "Unlimited rooms and volunteer accounts",
              "Real-time attendance tracking",
              "Secure guardian verification system",
              "Detailed safety and attendance reports"
            ].map((text, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <span className="text-gray-700 dark:text-gray-300 font-medium">{text}</span>
              </div>
            ))}
          </div>

          <div className="p-6 bg-primary/10 dark:bg-primary/20 rounded-2xl border border-primary/20 dark:border-primary/30">
            <p className="text-sm text-primary/80 dark:text-primary/70 italic">
              "GuardianCheck transformed our Sunday morning check-in. It's faster, safer, and our parents love it!"
            </p>
            <p className="mt-2 text-xs font-bold text-primary uppercase tracking-wider">— Pastor Sarah, Grace Community</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800"
        >
          <div className="text-center mb-8">
            <div className="h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Register Your Church</h1>
            <p className="text-gray-500 dark:text-gray-400">
              {selectedPlan ? `You've selected the ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} plan` : 'Create your admin account to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Church Name</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    name="churchName"
                    required
                    value={formData.churchName}
                    onChange={handleChange}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="e.g. Grace Community Church"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">First Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      name="adminFirstName"
                      required
                      value={formData.adminFirstName}
                      onChange={handleChange}
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                      placeholder="John"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Last Name</label>
                  <input
                    type="text"
                    name="adminLastName"
                    required
                    value={formData.adminLastName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Admin Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="password"
                      name="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Confirm</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating Platform...</span>
                </>
              ) : (
                <>
                  <span>Start Free Trial</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-bold hover:underline">
                Login here
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
