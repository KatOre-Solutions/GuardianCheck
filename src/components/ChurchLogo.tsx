import React from "react";
import { Shield } from "lucide-react";

interface ChurchLogoProps {
  logoUrl?: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
}

export const ChurchLogo: React.FC<ChurchLogoProps> = ({ 
  logoUrl, 
  name, 
  className = "h-8 w-8 object-contain",
  fallbackClassName = "h-8 w-8 text-primary"
}) => {
  if (logoUrl) {
    return (
      <div className="bg-white p-1 rounded-lg shadow-sm w-10 h-10 flex items-center justify-center overflow-hidden">
        <img 
          src={logoUrl} 
          alt={name || "Church Logo"} 
          className={className} 
          referrerPolicy="no-referrer" 
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 flex items-center justify-center">
      <Shield className={fallbackClassName} />
    </div>
  );
};
