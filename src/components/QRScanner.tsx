import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, Upload, X, RefreshCw } from "lucide-react";
import {
  clearStoredCamera,
  readStoredCamera,
  resolveCamera,
  selectableCameras,
  storedCameraIsStale,
  writeStoredCamera,
  type CameraDevice,
  type CameraSource,
} from "../lib/camera";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: string) => void;
  fps?: number;
  /**
   * DOM id html5-qrcode mounts into. Defaults to the original single-scanner
   * id; pass a distinct one if a second scanner could ever be mounted at the
   * same time, since two instances sharing an id fight over the same element.
   */
  elementId?: string;
  /** Skip the "Start Camera" tap. Use where scanning is the whole point of the screen. */
  autoStart?: boolean;
}

/** What the diagnostics line reports about the running track. */
interface TrackInfo {
  label: string;
  width?: number;
  height?: number;
  zoom?: number;
  focusMode?: string;
  /** Whether this lens supports zoom at all — the input to the Stage 2 decision. */
  zoomRange?: string;
}

const SOURCE_LABEL: Record<CameraSource, string> = {
  persisted: "saved choice",
  ranked: "auto-selected",
  manual: "picked by hand",
  facingMode: "browser default",
};

export function QRScanner({ onScanSuccess, onScanFailure, fps = 10, elementId = "qr-reader", autoStart = false }: QRScannerProps) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [source, setSource] = useState<CameraSource | null>(null);
  const [trackInfo, setTrackInfo] = useState<TrackInfo | null>(null);
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
    const html5QrCode = new Html5Qrcode(elementId, { verbose: false });
    scannerRef.current = html5QrCode;

    return () => {
      isMounted.current = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(err => console.debug("Cleanup stop error", err));
      }
    };
  }, [elementId]);

  const stopCamera = useCallback(async () => {
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
  }, []);

  /**
   * Opens a camera, resolved through the ladder in `src/lib/camera.ts`:
   * a saved known-good choice, then the ranking, then — via `preferredId`,
   * which the picker supplies — a human, and finally the old `facingMode`
   * chain for devices we cannot enumerate at all.
   *
   * `preferredId` marks a deliberate choice, and only a deliberate choice that
   * actually starts is saved. Caching a ranked guess would make a wrong lens
   * sticky on that phone, which is worse than the bug this fixes.
   */
  const startCamera = useCallback(async (preferredId?: string) => {
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

    const onDecoded = (text: string) => {
      stopCamera();
      onScanSuccessRef.current(text);
    };
    const onDecodeError = (err: string) => onScanFailureRef.current?.(err);

    /* Enumerating needs camera permission for labels to be populated, so this
     * is also what triggers the prompt on first use. A failure here is not
     * fatal -- it just means we fall through to the facingMode chain. */
    let devices: CameraDevice[] = [];
    try {
      devices = await Html5Qrcode.getCameras();
    } catch (err) {
      console.debug("Could not enumerate cameras", err);
    }

    if (isMounted.current) {
      setCameras(selectableCameras(devices));
    }

    const stored = readStoredCamera();
    if (storedCameraIsStale(devices, stored)) {
      clearStoredCamera();
    }

    const target = preferredId
      ? { deviceId: preferredId, source: "manual" as CameraSource }
      : resolveCamera(devices, stored);

    /** Reads what the track actually gave us, so a wrong lens is visible
     *  rather than mysterious. Capabilities are absent on some browsers. */
    const captureTrackInfo = (fallbackLabel: string) => {
      /* zoom and focusMode are not in the standard MediaTrackSettings type and
       * are absent on several browsers, so they are read defensively. */
      type ExtraSettings = MediaTrackSettings & { zoom?: number; focusMode?: string };
      type ExtraCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number } };

      let settings: ExtraSettings | undefined;
      let caps: ExtraCapabilities | undefined;

      try {
        settings = scannerRef.current?.getRunningTrackSettings() as ExtraSettings | undefined;
      } catch {
        settings = undefined;
      }

      try {
        caps = scannerRef.current?.getRunningTrackCapabilities() as ExtraCapabilities | undefined;
      } catch {
        caps = undefined;
      }

      const matched = devices.find(d => d.id === settings?.deviceId);

      if (isMounted.current) {
        setTrackInfo({
          label: matched?.label || fallbackLabel,
          width: settings?.width,
          height: settings?.height,
          zoom: settings?.zoom,
          focusMode: settings?.focusMode,
          zoomRange: caps?.zoom ? `${caps.zoom.min}–${caps.zoom.max}` : undefined,
        });
      }
    };

    try {
      if (target) {
        await scannerRef.current.start(target.deviceId, config, onDecoded, onDecodeError);

        if (isMounted.current) {
          setActiveCameraId(target.deviceId);
          setSource(target.source);
        }

        /* Only now is it "known good": the track is running. */
        if (target.source === "manual") {
          const picked = devices.find(d => d.id === target.deviceId);
          writeStoredCamera({ id: target.deviceId, label: picked?.label ?? "" });
        }

        captureTrackInfo(devices.find(d => d.id === target.deviceId)?.label ?? "Selected camera");
      } else {
        throw new Error("No camera could be resolved from the device list");
      }
    } catch (err) {
      console.warn("Falling back to facingMode selection", err);
      try {
        await scannerRef.current.start({ facingMode: "environment" }, config, onDecoded, onDecodeError);
        if (isMounted.current) {
          setActiveCameraId(null);
          setSource("facingMode");
        }
        captureTrackInfo("Rear camera (browser default)");
      } catch (envErr) {
        console.warn("Back camera failed, trying front camera", envErr);
        try {
          await scannerRef.current.start({ facingMode: "user" }, config, onDecoded, onDecodeError);
          if (isMounted.current) {
            setActiveCameraId(null);
            setSource("facingMode");
          }
          captureTrackInfo("Front camera (browser default)");
        } catch (fallbackErr) {
          console.error("All cameras failed", fallbackErr);
          if (isMounted.current) {
            setIsCameraActive(false); // Show overlay again on failure
          }
          if (onScanFailureRef.current) {
            onScanFailureRef.current("Could not access camera. Please check permissions.");
          }
        }
      }
    } finally {
      if (isMounted.current) {
        setIsInitializing(false);
      }
    }
  }, [fps, isCameraActive, isInitializing, stopCamera]);

  /**
   * The recovery path. The ranking cannot detect its own mistakes -- a wrong
   * lens opens perfectly happily -- so this is always available rather than
   * shown after a failure.
   */
  const switchCamera = async (deviceId: string) => {
    await stopCamera();
    /* stopCamera's state update is async; startCamera guards on isCameraActive,
     * so hand it a clean slate before restarting. */
    setIsCameraActive(false);
    setIsInitializing(false);
    setTimeout(() => startCamera(deviceId), 0);
  };

  // Where scanning is the entire purpose of the screen, making the volunteer
  // tap "Start Camera" first is pure friction. Safe to call unguarded:
  // startCamera early-returns if it is already active or initialising.
  useEffect(() => {
    if (autoStart) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

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
        <div id={elementId} className="w-full aspect-square"></div>

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
              onClick={() => startCamera()}
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

      {/*
        Kept outside the isCameraActive guard on purpose: if the chosen lens
        fails to start, the picker is how a volunteer gets out of it, so it
        must not be trapped behind a working camera.
      */}
      {cameras.length > 1 && (
        <div className="space-y-1">
          <label htmlFor={`${elementId}-camera`} className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Camera
          </label>
          <select
            id={`${elementId}-camera`}
            value={activeCameraId ?? ""}
            onChange={(e) => switchCamera(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {activeCameraId === null && <option value="">Browser default</option>}
            {cameras.map((cam, index) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${index + 1}`}{index === 0 ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Blurry or zoomed out? Try another camera — this phone will remember your choice.
          </p>
        </div>
      )}

      <div className="flex flex-col space-y-3">
        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
            className="hidden"
          />
          {/*
            On a phone this opens the native camera app, which does its own
            lens selection and macro focusing -- so it works even when the
            in-page scanner picks a lens that will not focus. The old wording
            ("Upload QR Image / browse from local storage") read as a desktop
            file picker, so nobody used it as the escape hatch it is.
          */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 px-6 bg-white border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-primary/5 rounded-2xl transition-all flex items-center justify-center space-x-3 group"
          >
            <Upload className="w-6 h-6 text-gray-400 group-hover:text-primary" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900">Take a photo of the code instead</p>
              <p className="text-xs text-gray-500">Uses your phone's own camera app — or pick an existing image</p>
            </div>
          </button>
        </div>
      </div>

      {/*
        This bug cannot be reproduced on a desktop, so confirming a fix means
        reading what the phone actually opened. Collapsed by default: it is for
        diagnosis, not for volunteers.
      */}
      {trackInfo && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-primary transition-colors">
            Camera details
          </summary>
          <dl className="mt-2 space-y-1 text-gray-500">
            <div className="flex justify-between gap-4">
              <dt>Camera</dt>
              <dd className="text-right font-medium text-gray-700">{trackInfo.label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Chosen by</dt>
              <dd className="text-right font-medium text-gray-700">
                {source ? SOURCE_LABEL[source] : "unknown"}
              </dd>
            </div>
            {trackInfo.width && trackInfo.height && (
              <div className="flex justify-between gap-4">
                <dt>Resolution</dt>
                <dd className="text-right font-medium text-gray-700">{trackInfo.width} × {trackInfo.height}</dd>
              </div>
            )}
            {trackInfo.zoom !== undefined && (
              <div className="flex justify-between gap-4">
                <dt>Zoom</dt>
                <dd className="text-right font-medium text-gray-700">{trackInfo.zoom}</dd>
              </div>
            )}
            {trackInfo.zoomRange && (
              <div className="flex justify-between gap-4">
                <dt>Zoom range</dt>
                <dd className="text-right font-medium text-gray-700">{trackInfo.zoomRange}</dd>
              </div>
            )}
            {trackInfo.focusMode && (
              <div className="flex justify-between gap-4">
                <dt>Focus</dt>
                <dd className="text-right font-medium text-gray-700">{trackInfo.focusMode}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
