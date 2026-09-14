import React from "react";
import { motion } from "motion/react";
import { whatsappUrl } from "../lib/whatsapp";
import { WhatsAppIcon } from "./icons/WhatsAppIcon";

interface WhatsAppButtonProps {
  phoneNumber: string;
  message?: string;
  label?: string;
  position?: "fixed" | "static";
  className?: string;
}

export default function WhatsAppButton({ 
  phoneNumber, 
  message = "Hello, I'd like more information about GuardianCheck.", 
  label,
  position = "fixed",
  className = ""
}: WhatsAppButtonProps) {
  const href = whatsappUrl(phoneNumber, message);

  const content = (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center space-x-2 bg-[#25D366] text-white px-4 py-3 rounded-full shadow-lg hover:bg-[#128C7E] transition-colors z-[100] ${
        position === "fixed" ? "fixed bottom-6 right-6" : ""
      } ${className}`}
    >
      <WhatsAppIcon className="h-6 w-6 text-white" />
      {label && <span className="font-bold text-sm">{label}</span>}
    </motion.a>
  );

  return content;
}
