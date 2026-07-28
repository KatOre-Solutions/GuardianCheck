import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { LEGAL_CONTENT, CURRENT_POLICY_VERSION } from "../constants/legalContent";
import { motion } from "motion/react";
import { Shield, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "../components/Seo";

export default function PolicyAcceptancePage() {
  const { user, userData, roles } = useAuth();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Use a small buffer (5px) for reliability
      if (scrollTop + clientHeight >= scrollHeight - 5) {
        setHasScrolledToBottom(true);
      }
    }
  };

  const handleAccept = async () => {
    if (!user || !userData) return;
    setSubmitting(true);

    try {
      const acceptanceRef = doc(db, "policy_acceptance", user.uid);
      const historyRef = doc(db, "policy_acceptance", user.uid, "history", CURRENT_POLICY_VERSION);
      const churchId = userData.churchId || "system";

      await runTransaction(db, async (transaction) => {
        // 1. Create the immutable history record
        transaction.set(historyRef, {
          version: CURRENT_POLICY_VERSION,
          acceptedAt: serverTimestamp(),
          churchId: churchId,
          roleAtTime: userData.role || "unknown",
          legalContext: {
            policyHash: "sha256:placeholder_hash_v1", // In a real app, this would be a real hash
            agreementType: roles.includes("admin") || roles.includes("master_admin") ? "Operator_Agreement" : "Privacy_Notice"
          },
          forensicData: {
            userAgent: navigator.userAgent,
            ipMasked: "0.0.0.0", // Server will populate this if using a Cloud Function, or we mask it here
            traceId: `ui_${Date.now()}`
          },
          acceptanceMethod: "explicit_checkbox_click"
        });

        // 2. Update the summary record
        transaction.set(acceptanceRef, {
          lastAcceptedVersion: CURRENT_POLICY_VERSION,
          lastAcceptedAt: new Date().toISOString(),
          status: "compliant"
        });

        // 3. If Admin, also record church-level acceptance if not already done
        if (roles.includes("admin") || roles.includes("master_admin")) {
          const churchPolicyRef = doc(db, "church_policy_acceptance", churchId);
          transaction.set(churchPolicyRef, {
            acceptedBy: user.uid,
            acceptedAt: serverTimestamp(),
            policyVersion: CURRENT_POLICY_VERSION
          }, { merge: true });
        }
      });

      toast.success("Policies accepted successfully");
      const from = (location.state as any)?.from;
      if (from) {
        navigate(from, { replace: true });
      } else if (userData.churchSlug) {
        navigate(`/${userData.churchSlug}`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (error: any) {
      console.error("Failed to save policy acceptance:", error);
      toast.error("Failed to save acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isRoleRelevant = (sectionRoles?: string[]) => {
    if (!sectionRoles) return true;
    return sectionRoles.some(r => roles.includes(r as any));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Seo title="Policy update" noindex />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      >
        <div className="p-8 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Legal Compliance & Privacy
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            GuardianCheck is committed to POPIA compliance. Please review our updated Privacy Policy and Terms of Service to continue using the platform.
          </p>
        </div>

        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="p-8 max-h-[500px] overflow-y-auto space-y-8 scroll-smooth"
        >
          {/* Privacy Policy Section */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
              {LEGAL_CONTENT.privacyPolicy.title}
            </h2>
            <div className="space-y-6">
              {LEGAL_CONTENT.privacyPolicy.sections.map((section) => (
                <div 
                  key={section.id}
                  className={`p-4 rounded-xl transition-all duration-300 ${
                    isRoleRelevant(section.roles) 
                      ? "bg-primary/5 border-l-4 border-primary" 
                      : "bg-transparent"
                  }`}
                >
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center">
                    {section.title}
                    {isRoleRelevant(section.roles) && (
                      <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary text-[10px] uppercase tracking-wider rounded-full">
                        Relevant to your role
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {section.content}
                  </p>
                  {section.id === "responsible-party" && roles.includes("admin") && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30 flex items-start space-x-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                        As an Admin, you are a <strong>Data Deputy</strong> under POPIA. You are responsible for ensuring staff follow these protocols.
                      </p>
                    </div>
                  )}
                  {section.id === "children-data" && roles.includes("parent") && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30 flex items-start space-x-3">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                        We process your child's data solely for safety. You have the right to request deletion at any time.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Terms of Service Section */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
              {LEGAL_CONTENT.termsOfService.title}
            </h2>
            <div className="space-y-6">
              {LEGAL_CONTENT.termsOfService.sections.map((section) => (
                <div 
                  key={section.id}
                  className={`p-4 rounded-xl transition-all duration-300 ${
                    isRoleRelevant(section.roles) 
                      ? "bg-primary/5 border-l-4 border-primary" 
                      : "bg-transparent"
                  }`}
                >
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                    {section.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="p-8 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          {!hasScrolledToBottom && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/30 flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Please scroll to the bottom of the policy to enable acceptance.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={!hasScrolledToBottom}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
              />
              <span className={`text-sm ${!hasScrolledToBottom ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>
                I have read and agree to the Privacy Policy and Terms of Service. I understand my rights under POPIA.
              </span>
            </label>

            <button
              onClick={handleAccept}
              disabled={!agreed || submitting || !hasScrolledToBottom}
              className="w-full py-4 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Shield className="h-5 w-5" />
                  <span>Accept & Continue</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
      
      <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
        GuardianCheck Policy Version {CURRENT_POLICY_VERSION} • Last Updated {LEGAL_CONTENT.lastUpdated}
      </p>
    </div>
  );
}
