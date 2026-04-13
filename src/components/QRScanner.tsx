import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, Upload, X, RefreshCw } from "lucide-react";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: string) => void;
  fps?: number;
  qrbox?: number;
}

export function QRScanner({ onScanSuccess, onScanFailure, fps = 10, qrbox = 250 }: QRScannerProps) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);

  const onScanSuccessRef = useRef(onScanSuccess);
  const onScanFailureRef = useRef(onScanFailure);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    onScanFailureRef.current = onScanFailure;
  }, [onScanFailure]);

  useEffect(() => {
    isMounted.current = true;
    const html5QrCode = new Html5Qrcode("qr-reader", { verbose: false });
    scannerRef.current = html5QrCode;

    return () => {
      isMounted.current = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(err => console.debug("Cleanup stop error", err));
      }
    };
  }, []);

  const startCamera = async () => {
    if (!scannerRef.current || isCameraActive || isInitializing) return;

    setIsInitializing(true);
    setIsCameraActive(true); // Hide overlay immediately
    
    // Responsive qrbox
    const qrboxSize = (width: number, height: number) => {
      const minEdge = Math.min(width, height);
      const size = Math.floor(minEdge * 0.7);
      return { width: size, height: size };
    };

    const config = { 
      fps, 
      qrbox: qrboxSize,
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
      aspectRatio: 1.0
    };

    try {
      await scannerRef.current.start(
        { facingMode: "environment" }, 
        config, 
        (text) => {
          stopCamera();
          onScanSuccessRef.current(text);
        }, 
        (err) => onScanFailureRef.current?.(err)
      );
    } catch (err) {
      console.warn("Back camera failed, trying front camera", err);
      try {
        await scannerRef.current.start(
          { facingMode: "user" }, 
          config, 
          (text) => {
            stopCamera();
            onScanSuccessRef.current(text);
          }, 
          (err) => onScanFailureRef.current?.(err)
        );
      } catch (fallbackErr) {
        console.error("All cameras failed", fallbackErr);
        if (isMounted.current) {
          setIsCameraActive(false); // Show overlay again on failure
        }
        if (onScanFailureRef.current) {
          onScanFailureRef.current("Could not access camera. Please check permissions.");
        }
      }
    } finally {
      if (isMounted.current) {
        setIsInitializing(false);
      }
    }
  };

  const stopCamera = async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      if (isMounted.current) {
        setIsCameraActive(false);
      }
    } catch (err) {
      console.error("Failed to stop camera", err);
      if (isMounted.current) {
        setIsCameraActive(false);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;

    try {
      const decodedText = await scannerRef.current.scanFile(file, true);
      onScanSuccess(decodedText);
    } catch (err) {
      console.error("Failed to scan file", err);
      if (onScanFailure) onScanFailure("No QR code found in image");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="relative aspect-square bg-black rounded-2xl overflow-hidden border-2 border-gray-100 shadow-inner group">
        <div id="qr-reader" className="w-full h-full"></div>
        
        {!isCameraActive && !isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm text-white p-6 text-center space-y-4">
            <div className="p-4 bg-white/10 rounded-full">
              <Camera className="w-12 h-12 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Camera Scanner</h3>
              <p className="text-sm text-gray-400">Scan QR codes using your device's primary camera</p>
            </div>
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all transform active:scale-95 flex items-center space-x-2"
            >
              <Camera className="w-5 h-5" />
              <span>Start Camera</span>
            </button>
          </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm text-white space-y-4">
            <RefreshCw className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-medium">Initializing camera...</p>
          </div>
        )}

        {isCameraActive && (
          <button
            onClick={stopCamera}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex flex-col space-y-3">
        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 px-6 bg-white border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-primary/5 rounded-2xl transition-all flex items-center justify-center space-x-3 group"
          >
            <Upload className="w-6 h-6 text-gray-400 group-hover:text-primary" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900">Upload QR Image</p>
              <p className="text-xs text-gray-500">Drag & drop or browse from local storage</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
