/**
 * Web Serial API — USB / serial thermal printers
 */

"use client";

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

function getNavSerial(): any {
  return (navigator as any).serial;
}

let cachedPort: any = null;

export async function getSerialPorts(): Promise<any[]> {
  if (!isWebSerialSupported()) return [];
  return getNavSerial().getPorts();
}

export async function connectSerialPort(
  baudRate = 9600,
  forcePicker = false
): Promise<{ success: boolean; portInfo?: string; error?: string }> {
  if (!isWebSerialSupported()) {
    return {
      success: false,
      error: "Web Serial tidak didukung. Gunakan Chrome/Edge.",
    };
  }

  try {
    const navSerial = getNavSerial();
    let port = cachedPort;

    if (!forcePicker) {
      const ports = await navSerial.getPorts();
      if (ports.length > 0) {
        port = ports[0];
      }
    }

    if (!port || forcePicker) {
      port = await navSerial.requestPort();
    }

    if (port.readable || port.writable) {
      try {
        await port.close();
      } catch {
        // ignore
      }
    }

    await port.open({ baudRate });
    cachedPort = port;

    const info = port.getInfo?.() || {};
    const label = info.usbVendorId
      ? `USB VID:${info.usbVendorId?.toString(16)} PID:${info.usbProductId?.toString(16)}`
      : "Serial port terhubung";

    await port.close();

    return { success: true, portInfo: label };
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return { success: false, error: "Pemilihan port dibatalkan" };
    }
    return { success: false, error: err?.message || "Gagal koneksi serial" };
  }
}

export async function disconnectSerialPort(): Promise<void> {
  if (cachedPort) {
    try {
      if (cachedPort.readable || cachedPort.writable) {
        await cachedPort.close();
      }
    } catch {
      // ignore
    }
    cachedPort = null;
  }
}

export async function printSerial(
  data: Uint8Array,
  baudRate = 9600
): Promise<void> {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial API tidak didukung");
  }

  const navSerial = getNavSerial();
  let port = cachedPort;

  if (!port) {
    const ports = await navSerial.getPorts();
    if (ports.length > 0) {
      port = ports[0];
      cachedPort = port;
    }
  }

  if (!port) {
    port = await navSerial.requestPort();
    cachedPort = port;
  }

  if (!port.writable) {
    await port.open({ baudRate });
  }

  const writer = port.writable.getWriter();
  try {
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.subarray(i, Math.min(i + CHUNK, data.length));
      await writer.write(slice);
    }
  } finally {
    writer.releaseLock();
    try {
      await port.close();
    } catch {
      // ignore
    }
  }
}

export function hasCachedSerialPort(): boolean {
  return !!cachedPort;
}
