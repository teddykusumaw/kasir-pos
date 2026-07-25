/**
 * Web Bluetooth API — BLE thermal printers (ESC/POS)
 *
 * Banyak printer thermal murah memakai service:
 *   000018f0-0000-1000-8000-00805f9b34fb
 *   write char: 00002af1-...
 *
 * Fallback: Nordic UART Service (NUS)
 *
 * Catatan:
 * - Hanya BLE (bukan Bluetooth Classic SPP)
 * - Wajib HTTPS / localhost + user gesture
 * - Chrome / Edge desktop & Android Chrome
 */

"use client";

/** Common BLE printer service/characteristic pairs */
const PRINTER_PROFILES = [
  {
    name: "Generic Thermal (18F0)",
    service: "000018f0-0000-1000-8000-00805f9b34fb",
    write: "00002af1-0000-1000-8000-00805f9b34fb",
  },
  {
    name: "Nordic UART",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // RX (write to device)
  },
  {
    name: "FFE0/FFE1 (common clones)",
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    write: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
];

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

interface BleConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  characteristic: BluetoothRemoteGATTCharacteristic;
  profileName: string;
}

let bleConn: BleConnection | null = null;

export function getBluetoothDeviceName(): string | null {
  return bleConn?.device?.name || null;
}

export function isBluetoothConnected(): boolean {
  return !!(bleConn?.device?.gatt?.connected);
}

/**
 * Request BLE device & connect to writable characteristic
 */
export async function connectBluetoothPrinter(): Promise<{
  success: boolean;
  deviceName?: string;
  profile?: string;
  error?: string;
}> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      error: "Web Bluetooth tidak didukung. Gunakan Chrome/Edge (HTTPS).",
    };
  }

  try {
    // Optional filters for known printer services + acceptAllDevices fallback
    const optionalServices = PRINTER_PROFILES.map((p) => p.service);

    // @ts-expect-error Bluetooth types
    const device: BluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    });

    if (!device.gatt) {
      return { success: false, error: "Perangkat tidak mendukung GATT" };
    }

    device.addEventListener("gattserverdisconnected", () => {
      bleConn = null;
    });

    const server = await device.gatt.connect();

    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    let profileName = "";

    for (const profile of PRINTER_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service);
        characteristic = await service.getCharacteristic(profile.write);
        profileName = profile.name;
        break;
      } catch {
        // try next profile
      }
    }

    // Last resort: scan all services for a writable char
    if (!characteristic) {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const ch of chars) {
            const props = ch.properties;
            if (props.write || props.writeWithoutResponse) {
              characteristic = ch;
              profileName = `Auto:${service.uuid.slice(0, 8)}`;
              break;
            }
          }
        } catch {
          // continue
        }
        if (characteristic) break;
      }
    }

    if (!characteristic) {
      try {
        server.disconnect();
      } catch {
        // ignore
      }
      return {
        success: false,
        error:
          "Tidak menemukan characteristic tulis. Printer mungkin Bluetooth Classic (bukan BLE).",
      };
    }

    bleConn = { device, server, characteristic, profileName };

    return {
      success: true,
      deviceName: device.name || "Bluetooth Printer",
      profile: profileName,
    };
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return { success: false, error: "Pemilihan perangkat dibatalkan" };
    }
    return {
      success: false,
      error: err?.message || "Gagal koneksi Bluetooth",
    };
  }
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  if (bleConn?.device?.gatt?.connected) {
    try {
      bleConn.device.gatt.disconnect();
    } catch {
      // ignore
    }
  }
  bleConn = null;
}

/**
 * Write ESC/POS bytes over BLE (chunked)
 */
export async function printBluetooth(data: Uint8Array): Promise<void> {
  if (!bleConn || !bleConn.device.gatt?.connected) {
    const result = await connectBluetoothPrinter();
    if (!result.success) {
      throw new Error(result.error || "Bluetooth tidak terhubung");
    }
  }

  if (!bleConn?.characteristic) {
    throw new Error("Characteristic Bluetooth tidak tersedia");
  }

  const ch = bleConn.characteristic;
  const useWithoutResponse = ch.properties.writeWithoutResponse;
  // BLE MTU often ~20–512; stay safe
  const CHUNK = 100;

  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.subarray(i, Math.min(i + CHUNK, data.length));
    // Create a new Uint8Array copy (some implementations need owned buffer)
    const chunk = new Uint8Array(slice);
    if (useWithoutResponse) {
      await ch.writeValueWithoutResponse(chunk);
    } else {
      await ch.writeValueWithResponse(chunk);
    }
    // Small delay to avoid buffer overrun on cheap printers
    await new Promise((r) => setTimeout(r, 20));
  }
}
