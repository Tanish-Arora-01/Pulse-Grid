import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, CheckCircle2 } from "lucide-react";

/**
 * FatigueReportButton
 *
 * Floating action button that allows users to self-report cognitive fatigue (1-10)
 * and provide context. Used to generate ground-truth labels for model training.
 *
 * Features:
 * - Glassmorphism popup design
 * - 1-10 fatigue slider
 * - Optional context text input
 * - Success state with auto-close
 * - Framer Motion animations
 * - Optional onSuccess callback to refresh analytics
 */
const FatigueReportButton = ({ isVisible = true, onSuccess = null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fatigueScore, setFatigueScore] = useState(5);
  const [context, setContext] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!window.fobitAPI?.submitFatigueReport) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await window.fobitAPI.submitFatigueReport({
        fatigueScore: parseInt(fatigueScore),
        context: context.trim(),
      });

      // Show success state
      setShowSuccess(true);

      // Schedule cleanup: reset form and close modal
      // Use setTimeout to allow success animation to show
      const timeoutId = setTimeout(async () => {
        try {
          // Trigger refresh of analytics after submission completes
          if (onSuccess) {
            await onSuccess();
          }
        } catch (err) {
          // Error handled silently
        } finally {
          // 🚨 CRITICAL: Always reset state, even if onSuccess fails
          setShowSuccess(false);
          setIsOpen(false);
          setFatigueScore(5);
          setContext("");
          setIsSubmitting(false); // 🚨 CRITICAL: Reset isSubmitting on success
        }
      }, 1500);

      // Cleanup: cancel timeout if component unmounts
      return () => clearTimeout(timeoutId);
    } catch (err) {
      // Error handled silently
      // 🚨 CRITICAL: Reset on error
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        disabled={isOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full
                   bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold
                   shadow-lg hover:shadow-xl hover:from-indigo-500 hover:to-purple-500
                   transition-all disabled:opacity-50 disabled:cursor-default
                   border border-indigo-400/30 backdrop-blur-md"
      >
        <MessageSquarePlus size={18} />
        <span className="text-sm">TRAIN AI</span>
      </motion.button>

      {/* Modal Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={() => !isSubmitting && setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Modal Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 150 }}
            className="fixed bottom-28 right-6 z-50 w-80 rounded-2xl
                       bg-white/10 backdrop-blur-2xl border border-white/20
                       shadow-2xl p-6 space-y-4"
          >
            {/* Success State */}
            {showSuccess ? (
              <div className="flex flex-col items-center justify-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <CheckCircle2 size={48} className="text-emerald-400" />
                </motion.div>
                <p className="mt-4 text-white font-semibold text-center">
                  Thank you!
                </p>
                <p className="text-white/60 text-sm text-center mt-1">
                  Syncing with ML engine...
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div>
                  <h3 className="text-white font-semibold text-lg">
                    Report Fatigue Level
                  </h3>
                  <p className="text-white/60 text-sm mt-1">
                    Help train our model with real feedback
                  </p>
                </div>

                {/* Fatigue Slider */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-white/80 text-sm font-medium">
                      Fatigue Score
                    </label>
                    <span className="text-indigo-300 font-bold text-lg">
                      {fatigueScore}/10
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={fatigueScore}
                    onChange={(e) => setFatigueScore(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
                               accent-indigo-500 disabled:opacity-50"
                  />

                  {/* Scale Labels */}
                  <div className="flex justify-between text-xs text-white/50 px-1">
                    <span>1 (Flow)</span>
                    <span>10 (Exhausted)</span>
                  </div>
                </div>

                {/* Context Input */}
                <div className="space-y-2">
                  <label className="text-white/80 text-sm font-medium block">
                    Context (Optional)
                  </label>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="e.g., lots of errors, eyes hurt, slow focus..."
                    className="w-full h-16 px-3 py-2 rounded-lg bg-white/5 border border-white/10
                               text-white placeholder-white/40 text-sm resize-none
                               focus:outline-none focus:border-indigo-400/50 focus:bg-white/10
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors"
                  />
                </div>

                {/* Submit Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm
                             bg-gradient-to-r from-indigo-600 to-purple-600
                             hover:from-indigo-500 hover:to-purple-500
                             text-white transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit to Training Vault</span>
                  )}
                </motion.button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                  className="w-full py-2 rounded-lg font-medium text-sm
                             text-white/60 hover:text-white hover:bg-white/5
                             transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FatigueReportButton;
