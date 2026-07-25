"use client";

import { useEffect, useRef, useCallback } from "react";

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
  /** ms rata-rata antar karakter scanner (default 50) */
  avgTimeByChar?: number;
  /** Abaikan scan berulang kode sama dalam ms (default 600) */
  debounceMs?: number;
}

/**
 * Deteksi scanner hardware via onscan.js (kecepatan ketik + Enter).
 * Aman untuk SSR (dynamic import).
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  avgTimeByChar = 50,
  debounceMs = 600,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const handleScan = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (trimmed.length < minLength) return;
      const now = Date.now();
      if (
        lastRef.current.code === trimmed &&
        now - lastRef.current.at < debounceMs
      ) {
        return; // cegah double-scan
      }
      lastRef.current = { code: trimmed, at: now };
      onScanRef.current(trimmed);
    },
    [minLength, debounceMs]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    const init = async () => {
      try {
        const onScanModule = await import("onscan.js");
        const onScan =
          (onScanModule as any).default ||
          (window as any).onScan ||
          onScanModule;

        if (!onScan?.attachTo || cancelled) {
          console.warn("[useBarcodeScanner] onscan.js tidak siap");
          return;
        }

        if (onScan.isAttachedTo?.(document)) {
          onScan.detachFrom(document);
        }

        onScan.attachTo(document, {
          suffixKeyCodes: [13],
          reactToPaste: false,
          minLength,
          avgTimeByChar,
          ignoreIfFocusOn: false,
          onScan: (sCode: string) => handleScan(sCode),
          onScanError: () => {},
        });
      } catch (err) {
        console.error("[useBarcodeScanner]", err);
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        const onScan = (window as any).onScan;
        if (onScan?.isAttachedTo?.(document)) {
          onScan.detachFrom(document);
        }
      } catch {
        /* ignore */
      }
    };
  }, [enabled, minLength, avgTimeByChar, handleScan]);
}

/** Beep pendek sukses scan (opsional) */
export function playScanBeep(ok = true) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.15));
  } catch {
    /* ignore */
  }
}
