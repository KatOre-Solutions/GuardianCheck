import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      setTimeout(() => setShowRestored(false), 5000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4 pointer-events-none">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex items-center space-x-4 border border-gray-800 pointer-events-auto"
          >
            <div className="h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <WifiOff className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">You are offline</p>
              <p className="text-xs text-gray-400">Your actions will sync when connection is restored.</p>
            </div>
          </motion.div>
        )}

        {showRestored && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="bg-green-600 text-white p-4 rounded-2xl shadow-2xl flex items-center space-x-4 pointer-events-auto"
          >
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wifi className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">Connection restored</p>
              <p className="text-xs text-green-100">You are back online and synced.</p>
            </div>
            <button onClick={() => setShowRestored(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
