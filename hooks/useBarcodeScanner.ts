"use client";

import { useEffect, useRef, useCallback } from "react";

// onscan.js is a UMD/global library – we declare the type
declare global {
  interface Window {
    onScan?: {
      attachTo: (el: Document | HTMLElement, options?: Record<string, unknown>) => void;
      detachFrom: (el: Document | HTMLElement) => void;
      isAttachedTo: (el: Document | HTMLElement) => boolean;
      simulate: (el: Document | HTMLElement, code: string) => void;
    };
  }
}

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  minLength?: number;
  /** Average ms between characters from a real scanner (default 40) */
  avgTimeByChar?: number;
}

/**
 * Smart barcode scanner detection using onscan.js
 * Distinguishes hardware scanner input from manual typing by speed + Enter suffix.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 4,
  avgTimeByChar = 40,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const handleScan = useCallback((code: string) => {
    const trimmed = code.trim();
    if (trimmed.length >= minLength) {
      onScanRef.current(trimmed);
    }
  }, [minLength]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let attached = false;

    const init = async () => {
      // Dynamic import so SSR is happy
      try {
        // onscan.js attaches to window / exports default
        const onScanModule = await import("onscan.js");
        const onScan = onScanModule.default || (window as any).onScan || onScanModule;

        if (!onScan?.attachTo) {
          console.warn("[useBarcodeScanner] onscan.js not loaded correctly");
          return;
        }

        if (onScan.isAttachedTo?.(document)) {
          onScan.detachFrom(document);
        }

        onScan.attachTo(document, {
          suffixKeyCodes: [13], // Enter
          reactToPaste: false,
          minLength,
          avgTimeByChar,
          // Ignore key events that come from focused inputs when user is typing slowly
          // (onscan already handles speed detection)
          onScan: (sCode: string) => {
            handleScan(sCode);
          },
          onScanError: () => {
            // silently ignore incomplete / slow input
          },
        });

        attached = true;
      } catch (err) {
        console.error("[useBarcodeScanner] Failed to load onscan.js", err);
      }
    };

    init();

    return () => {
      if (attached) {
        try {
          const onScan = (window as any).onScan;
          if (onScan?.isAttachedTo?.(document)) {
            onScan.detachFrom(document);
          }
        } catch {
          // ignore
        }
      }
    };
  }, [enabled, minLength, avgTimeByChar, handleScan]);
}
