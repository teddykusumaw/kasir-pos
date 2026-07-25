declare module "onscan.js" {
  interface OnScanOptions {
    suffixKeyCodes?: number[];
    prefixKeyCodes?: number[];
    minLength?: number;
    avgTimeByChar?: number;
    reactToKeydown?: boolean;
    reactToPaste?: boolean;
    singleScanQty?: number;
    scanButtonKeyCode?: number;
    scanButtonLongPressTime?: number;
    onScan?: (sCode: string, iQty: number) => void;
    onScanError?: (oDebug: unknown) => void;
    onKeyDetect?: (iKeyCode: number, oEvent: KeyboardEvent) => boolean | void;
    onPaste?: (sPasted: string, oEvent: ClipboardEvent) => void;
    keyCodeMapper?: (oEvent: KeyboardEvent) => string | null;
  }

  interface OnScanStatic {
    attachTo(el: Document | HTMLElement, options?: OnScanOptions): void;
    detachFrom(el: Document | HTMLElement): void;
    isAttachedTo(el: Document | HTMLElement): boolean;
    setOptions(el: Document | HTMLElement, options: OnScanOptions): void;
    simulate(el: Document | HTMLElement, scanData: string | unknown[]): void;
    decodeKeyEvent(oEvent: KeyboardEvent): string | null;
  }

  const onScan: OnScanStatic;
  export default onScan;
}
