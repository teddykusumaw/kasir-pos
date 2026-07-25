"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";
import {
  Key,
  User,
  Printer,
  CheckCircle2,
  AlertCircle,
  ChefHat,
  Settings2,
  Bluetooth,
  Usb,
  Unplug,
} from "lucide-react";
import {
  getPrintSettings,
  savePrintSettings,
  DEFAULT_PRINT_SETTINGS,
  PrintSettings,
  PrintMethod,
} from "@/lib/printSettings";
import {
  isWebSerialSupported,
  isWebBluetoothSupported,
  connectBluetoothPrinter,
  isBluetoothConnected,
} from "@/lib/thermalPrinter";
import {
  connectSerialPort,
  disconnectSerialPort,
  getSerialPorts,
} from "@/lib/webSerialPrinter";
import {
  disconnectBluetoothPrinter,
  getBluetoothDeviceName,
} from "@/lib/webBluetoothPrinter";
import {
  fetchTaxSettings,
  saveTaxSettings,
  clearTaxSettingsCache,
  DEFAULT_TAX_SETTINGS,
  type TaxSettings,
  type TaxMode,
} from "@/lib/taxSettings";
import {
  fetchWhatsAppSettings,
  DEFAULT_WA,
  type WhatsAppSettings,
} from "@/lib/whatsapp";
import {
  fetchTelegramSettings,
  saveTelegramSettings,
  sendTelegram,
  testTelegramConnection,
  DEFAULT_TELEGRAM,
  type TelegramSettings,
} from "@/lib/telegram";

interface Props {
  profile: Profile;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition ${
        on ? "bg-primary-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export default function SettingsClient({ profile }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [printCfg, setPrintCfg] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [saveMsg, setSaveMsg] = useState("");
  const [connMsg, setConnMsg] = useState("");
  const [serialStatus, setSerialStatus] = useState("Belum terhubung");
  const [btStatus, setBtStatus] = useState("Belum terhubung");
  const [connLoading, setConnLoading] = useState(false);
  const [taxCfg, setTaxCfg] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [taxMsg, setTaxMsg] = useState("");
  const [taxLoading, setTaxLoading] = useState(false);
  const [waCfg, setWaCfg] = useState<WhatsAppSettings>(DEFAULT_WA);
  const [waMsg, setWaMsg] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [tgCfg, setTgCfg] = useState<TelegramSettings>(DEFAULT_TELEGRAM);
  const [tgMsg, setTgMsg] = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [serialOk, setSerialOk] = useState(false);
  const [btOk, setBtOk] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    setSerialOk(isWebSerialSupported());
    setBtOk(isWebBluetoothSupported());
    setPrintCfg(getPrintSettings());
    refreshStatus();
    fetchTaxSettings().then(setTaxCfg);
    fetchWhatsAppSettings(supabase).then(setWaCfg);
    fetchTelegramSettings(supabase).then(setTgCfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = async () => {
    if (isWebSerialSupported()) {
      const ports = await getSerialPorts();
      setSerialStatus(ports.length > 0 ? `${ports.length} port tersimpan` : "Belum pilih port");
    } else {
      setSerialStatus("Tidak didukung browser");
    }
    if (isWebBluetoothSupported()) {
      const name = getBluetoothDeviceName();
      setBtStatus(
        isBluetoothConnected()
          ? `Terhubung: ${name || "BLE Printer"}`
          : printCfg.lastBluetoothName
          ? `Terakhir: ${printCfg.lastBluetoothName}`
          : "Belum terhubung"
      );
    } else {
      setBtStatus("Tidak didukung browser");
    }
  };

  const updateCfg = (partial: Partial<PrintSettings>) => {
    setPrintCfg(savePrintSettings(partial));
  };

  const handleSavePrint = () => {
    savePrintSettings(printCfg);
    setSaveMsg("Pengaturan printer disimpan");
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleConnectSerial = async (forcePicker: boolean) => {
    setConnLoading(true);
    setConnMsg("");
    const result = await connectSerialPort(printCfg.baudRate, forcePicker);
    setConnLoading(false);
    if (result.success) {
      setConnMsg(`Serial OK: ${result.portInfo}`);
      setSerialStatus(result.portInfo || "Terhubung");
    } else {
      setConnMsg(result.error || "Gagal");
    }
  };

  const handleDisconnectSerial = async () => {
    await disconnectSerialPort();
    setSerialStatus("Terputus");
    setConnMsg("Serial diputus");
  };

  const handleConnectBluetooth = async () => {
    setConnLoading(true);
    setConnMsg("");
    const result = await connectBluetoothPrinter();
    setConnLoading(false);
    if (result.success) {
      updateCfg({ lastBluetoothName: result.deviceName || "" });
      setBtStatus(`Terhubung: ${result.deviceName} (${result.profile})`);
      setConnMsg(`Bluetooth OK: ${result.deviceName}`);
    } else {
      setConnMsg(result.error || "Gagal");
    }
  };

  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBtStatus("Terputus");
    setConnMsg("Bluetooth diputus");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setPwMsg({ type: "error", text: "Password tidak cocok" });
      return;
    }
    if (password.length < 6) {
      setPwMsg({ type: "error", text: "Password minimal 6 karakter" });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setPwMsg({ type: "error", text: error.message });
    else {
      setPwMsg({ type: "success", text: "Password berhasil diubah!" });
      setPassword("");
      setConfirm("");
    }
    setPwLoading(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan</h1>
        <p className="text-slate-500">Akun, Web Serial, Bluetooth & ESC/POS</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
            <User size={24} />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{profile.full_name}</p>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <p className="text-xs text-slate-400 capitalize mt-0.5">Role: {profile.role}</p>
          </div>
        </div>
      </div>

      {/* CONNECTION */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Printer size={18} />
          Koneksi Printer
        </h2>

        {/* Serial */}
        <div className="p-3 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Usb size={16} className="text-slate-500" />
              <span className="text-sm font-medium">Web Serial (USB)</span>
            </div>
            <span className="text-xs text-slate-500">{serialStatus}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={connLoading || !mounted || !serialOk}
              onClick={() => handleConnectSerial(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Pilih Port USB
            </button>
            <button
              type="button"
              disabled={connLoading}
              onClick={handleDisconnectSerial}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              <Unplug size={12} /> Putus
            </button>
          </div>
        </div>

        {/* Bluetooth */}
        <div className="p-3 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bluetooth size={16} className="text-blue-500" />
              <span className="text-sm font-medium">Web Bluetooth (BLE)</span>
            </div>
            <span className="text-xs text-slate-500">{btStatus}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={connLoading || !mounted || !btOk}
              onClick={handleConnectBluetooth}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Pair Bluetooth
            </button>
            <button
              type="button"
              disabled={connLoading}
              onClick={handleDisconnectBluetooth}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              <Unplug size={12} /> Putus
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Hanya printer <strong>BLE</strong> (bukan Bluetooth Classic SPP). Chrome/Edge + HTTPS.
          </p>
        </div>

        {connMsg && (
          <p className="text-xs text-slate-600 bg-slate-50 rounded px-3 py-2">{connMsg}</p>
        )}
      </div>

      {/* METHOD */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <h2 className="font-semibold text-slate-900">Metode Cetak Default</h2>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "serial" as PrintMethod, label: "Web Serial", desc: "USB" },
              { id: "bluetooth" as PrintMethod, label: "Bluetooth", desc: "BLE" },
              { id: "browser" as PrintMethod, label: "Browser", desc: "Dialog OS" },
            ]
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateCfg({ method: m.id })}
              className={`p-3 rounded-lg border text-left transition ${
                printCfg.method === m.id
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-slate-400">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
          <div>
            <p className="text-sm font-medium text-slate-800">Auto-Print Receipt</p>
            <p className="text-xs text-slate-400">Cetak otomatis setelah bayar</p>
          </div>
          <Toggle on={printCfg.autoPrint} onToggle={() => updateCfg({ autoPrint: !printCfg.autoPrint })} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah Salinan</label>
          <input
            type="number"
            min={1}
            max={5}
            value={printCfg.copies}
            onChange={(e) => updateCfg({ copies: Number(e.target.value) || 1 })}
            className="w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-sm font-medium text-slate-700">Info Toko di Struk</p>
          <input value={printCfg.storeName} onChange={(e) => updateCfg({ storeName: e.target.value })}
            placeholder="Nama toko" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
          <input value={printCfg.storeAddress} onChange={(e) => updateCfg({ storeAddress: e.target.value })}
            placeholder="Alamat" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
          <input value={printCfg.storePhone} onChange={(e) => updateCfg({ storePhone: e.target.value })}
            placeholder="Telepon" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      {/* ESC/POS */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Settings2 size={18} />
          Konfigurasi ESC/POS
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lebar Kertas</label>
            <select
              value={printCfg.paperWidth}
              onChange={(e) => updateCfg({ paperWidth: Number(e.target.value) as 32 | 42 | 48 })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value={32}>32 (58mm)</option>
              <option value={42}>42 (80mm)</option>
              <option value={48}>48 (80mm lebar)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Baud Rate</label>
            <select
              value={printCfg.baudRate}
              onChange={(e) => updateCfg({ baudRate: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={115200}>115200</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Character Set</label>
          <select
            value={printCfg.characterSet}
            onChange={(e) => updateCfg({ characterSet: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="pc437_usa">PC437 USA</option>
            <option value="pc850_multilingual">PC850 Multilingual</option>
            <option value="pc852_latin2">PC852 Latin2</option>
            <option value="iso8859_15_latin9">ISO8859-15 Latin9</option>
          </select>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
          <div>
            <p className="text-sm font-medium">Auto Cut</p>
            <p className="text-xs text-slate-400">Potong kertas setelah cetak</p>
          </div>
          <Toggle on={printCfg.autoCut} onToggle={() => updateCfg({ autoCut: !printCfg.autoCut })} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
          <div>
            <p className="text-sm font-medium">Cash Drawer</p>
            <p className="text-xs text-slate-400">Buka laci uang setelah cetak</p>
          </div>
          <Toggle on={printCfg.openDrawer} onToggle={() => updateCfg({ openDrawer: !printCfg.openDrawer })} />
        </div>
      </div>

      {/* KITCHEN */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <ChefHat size={18} />
          Printer Dapur
        </h2>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
          <p className="text-sm font-medium">Aktifkan ticket dapur</p>
          <Toggle
            on={printCfg.kitchenEnabled}
            onToggle={() => updateCfg({ kitchenEnabled: !printCfg.kitchenEnabled })}
          />
        </div>
        {printCfg.kitchenEnabled && (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
              <div>
                <p className="text-sm font-medium">Auto-Print ticket dapur</p>
              </div>
              <Toggle
                on={printCfg.kitchenAutoPrint}
                onToggle={() => updateCfg({ kitchenAutoPrint: !printCfg.kitchenAutoPrint })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filter kategori
              </label>
              <input
                value={printCfg.kitchenCategories}
                onChange={(e) => updateCfg({ kitchenCategories: e.target.value })}
                placeholder="Kosong = semua. Contoh: Makanan, Minuman"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSavePrint}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
        >
          Simpan Pengaturan Printer
        </button>
        {saveMsg && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={14} />
            {saveMsg}
          </span>
        )}
      </div>


      {/* PPN / TAX — Admin only */}
      {profile.role === "admin" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">PPN / Pajak</h2>
          <p className="text-xs text-slate-500">
            Atur tarif PPN sesuai ketentuan pemerintah. Perubahan berlaku untuk
            transaksi baru (riwayat lama tetap memakai tarif saat transaksi).
          </p>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
            <div>
              <p className="text-sm font-medium text-slate-800">Aktifkan PPN</p>
              <p className="text-xs text-slate-400">Nonaktifkan jika toko tidak memungut PPN</p>
            </div>
            <button
              type="button"
              onClick={() => setTaxCfg({ ...taxCfg, enabled: !taxCfg.enabled })}
              className={`relative w-11 h-6 rounded-full transition ${
                taxCfg.enabled ? "bg-primary-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                  taxCfg.enabled ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {taxCfg.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tarif PPN (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={taxCfg.rate}
                    onChange={(e) =>
                      setTaxCfg({ ...taxCfg, rate: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">Contoh: 11 atau 12</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nama label
                  </label>
                  <input
                    type="text"
                    value={taxCfg.name}
                    onChange={(e) => setTaxCfg({ ...taxCfg, name: e.target.value })}
                    placeholder="PPN"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mode perhitungan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: "exclusive" as TaxMode,
                        label: "Exclusive",
                        desc: "Harga belum termasuk PPN (PPN ditambah)",
                      },
                      {
                        id: "inclusive" as TaxMode,
                        label: "Inclusive",
                        desc: "Harga sudah termasuk PPN (dipecah di struk)",
                      },
                    ]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setTaxCfg({ ...taxCfg, mode: m.id })}
                      className={`p-3 rounded-lg border text-left transition ${
                        taxCfg.mode === m.id
                          ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-slate-400">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs bg-slate-50 rounded-lg p-3 text-slate-600 space-y-1">
                <p className="font-medium">Contoh (subtotal item Rp 100.000, tarif {taxCfg.rate}%):</p>
                {taxCfg.mode === "exclusive" ? (
                  <>
                    <p>Subtotal: Rp 100.000</p>
                    <p>PPN: Rp {(Math.round(100000 * taxCfg.rate / 100)).toLocaleString("id-ID")}</p>
                    <p>Total bayar: Rp {(100000 + Math.round(100000 * taxCfg.rate / 100)).toLocaleString("id-ID")}</p>
                  </>
                ) : (
                  <>
                    <p>Total (incl.): Rp 100.000</p>
                    <p>PPN: Rp {(Math.round(100000 * taxCfg.rate / (100 + taxCfg.rate))).toLocaleString("id-ID")}</p>
                    <p>DPP: Rp {(100000 - Math.round(100000 * taxCfg.rate / (100 + taxCfg.rate))).toLocaleString("id-ID")}</p>
                  </>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={taxLoading}
              onClick={async () => {
                setTaxLoading(true);
                setTaxMsg("");
                const r = await saveTaxSettings(
                  {
                    ...taxCfg,
                    mode: taxCfg.enabled ? taxCfg.mode : "disabled",
                  },
                  profile.id
                );
                setTaxLoading(false);
                if (r.success) {
                  clearTaxSettingsCache();
                  setTaxMsg("Pengaturan PPN disimpan");
                  setTimeout(() => setTaxMsg(""), 3000);
                } else {
                  setTaxMsg(r.error || "Gagal menyimpan");
                }
              }}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
            >
              {taxLoading ? "Menyimpan..." : "Simpan Pengaturan PPN"}
            </button>
            {taxMsg && (
              <span className="text-sm text-emerald-600">{taxMsg}</span>
            )}
          </div>
        </div>
      )}

      
      {profile.role === "admin" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">WhatsApp Notifikasi</h2>
          <p className="text-xs text-slate-500">
            Kirim alert restock / jatuh tempo. Provider: Fonnte API, Webhook, atau link wa.me.
          </p>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm font-medium">Aktifkan WhatsApp</span>
            <button
              type="button"
              onClick={() => setWaCfg({ ...waCfg, enabled: !waCfg.enabled })}
              className={`relative w-11 h-6 rounded-full ${waCfg.enabled ? "bg-primary-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${waCfg.enabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {waCfg.enabled && (
            <>
              <div>
                <label className="text-sm font-medium">Nomor tujuan (62...)</label>
                <input
                  value={waCfg.phone}
                  onChange={(e) => setWaCfg({ ...waCfg, phone: e.target.value })}
                  placeholder="6281234567890"
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Provider</label>
                <select
                  value={waCfg.provider}
                  onChange={(e) =>
                    setWaCfg({
                      ...waCfg,
                      provider: e.target.value as WhatsAppSettings["provider"],
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                >
                  <option value="meta">WhatsApp Business (Meta Cloud API)</option>
                  <option value="fonnte">Fonnte API</option>
                  <option value="webhook">Webhook custom</option>
                  <option value="link">Link wa.me (manual)</option>
                </select>
              </div>
              {waCfg.provider === "meta" && (
                <>
                  <div>
                    <label className="text-sm font-medium">Phone Number ID</label>
                    <input
                      value={waCfg.meta_phone_number_id || ""}
                      onChange={(e) =>
                        setWaCfg({ ...waCfg, meta_phone_number_id: e.target.value })
                      }
                      placeholder="Dari Meta Developer Console"
                      className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Permanent Access Token</label>
                    <input
                      type="password"
                      value={waCfg.api_token}
                      onChange={(e) => setWaCfg({ ...waCfg, api_token: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">API Version</label>
                    <input
                      value={waCfg.meta_api_version || "v21.0"}
                      onChange={(e) =>
                        setWaCfg({ ...waCfg, meta_api_version: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Meta for Developers → WhatsApp → API Setup. Untuk production,
                    nomor penerima harus dalam allowed list (mode trial) atau bisnis terverifikasi.
                  </p>
                </>
              )}
              {waCfg.provider === "fonnte" && (
                <div>
                  <label className="text-sm font-medium">API Token Fonnte</label>
                  <input
                    type="password"
                    value={waCfg.api_token}
                    onChange={(e) => setWaCfg({ ...waCfg, api_token: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  />
                </div>
              )}
              {waCfg.provider === "webhook" && (
                <div>
                  <label className="text-sm font-medium">Webhook URL</label>
                  <input
                    value={waCfg.webhook_url || ""}
                    onChange={(e) => setWaCfg({ ...waCfg, webhook_url: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  />
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Notify forecast restock</span>
                <button
                  type="button"
                  onClick={() =>
                    setWaCfg({ ...waCfg, notify_restock: !waCfg.notify_restock })
                  }
                  className={`relative w-11 h-6 rounded-full ${waCfg.notify_restock ? "bg-primary-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${waCfg.notify_restock ? "translate-x-5" : ""}`} />
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            disabled={waLoading}
            onClick={async () => {
              setWaLoading(true);
              const { error } = await supabase.from("app_settings").upsert(
                {
                  key: "whatsapp",
                  value: waCfg,
                  updated_at: new Date().toISOString(),
                  updated_by: profile.id,
                },
                { onConflict: "key" }
              );
              setWaLoading(false);
              setWaMsg(error ? error.message : "Pengaturan WhatsApp disimpan");
              setTimeout(() => setWaMsg(""), 3000);
            }}
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
          >
            {waLoading ? "Menyimpan..." : "Simpan WhatsApp"}
          </button>
          {waMsg && <span className="text-sm text-emerald-600 ml-2">{waMsg}</span>}
        </div>
      )}


      {profile.role === "admin" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Telegram Notifikasi</h2>
          <p className="text-xs text-slate-500">
            Buat bot via @BotFather, lalu chat bot tersebut / masukkan ke grup.
            Chat ID: @userinfobot, perintah /id pada bot, atau webhook.
          </p>
          <div className="text-xs bg-sky-50 border border-sky-100 rounded-lg p-3 space-y-1 text-slate-600">
            <p className="font-medium text-sky-800">Webhook (production)</p>
            <p>
              URL: <code className="bg-white px-1 rounded">/api/telegram/webhook?secret=...</code>
            </p>
            <p>
              Set webhook (setelah deploy):{" "}
              <code className="bg-white px-1 rounded break-all">
                GET /api/telegram/webhook?secret=...&amp;action=set
              </code>
            </p>
            <p>Perintah bot: /start /help /status /id</p>
            <p className="text-slate-400">
              Env: TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL
            </p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="text-sm font-medium">Aktifkan Telegram</span>
            <button
              type="button"
              onClick={() => setTgCfg({ ...tgCfg, enabled: !tgCfg.enabled })}
              className={`relative w-11 h-6 rounded-full ${tgCfg.enabled ? "bg-sky-600" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                  tgCfg.enabled ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
          {tgCfg.enabled && (
            <>
              <div>
                <label className="text-sm font-medium">Bot Token</label>
                <input
                  type="password"
                  value={tgCfg.bot_token}
                  onChange={(e) => setTgCfg({ ...tgCfg, bot_token: e.target.value })}
                  placeholder="123456:ABC-DEF..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Chat ID</label>
                <input
                  value={tgCfg.chat_id}
                  onChange={(e) => setTgCfg({ ...tgCfg, chat_id: e.target.value })}
                  placeholder="123456789 atau -100..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Notify forecast restock</span>
                <button
                  type="button"
                  onClick={() =>
                    setTgCfg({ ...tgCfg, notify_restock: !tgCfg.notify_restock })
                  }
                  className={`relative w-11 h-6 rounded-full ${
                    tgCfg.notify_restock ? "bg-sky-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                      tgCfg.notify_restock ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Notify hutang/piutang jatuh tempo</span>
                <button
                  type="button"
                  onClick={() =>
                    setTgCfg({ ...tgCfg, notify_debt_due: !tgCfg.notify_debt_due })
                  }
                  className={`relative w-11 h-6 rounded-full ${
                    tgCfg.notify_debt_due ? "bg-sky-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                      tgCfg.notify_debt_due ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={tgLoading}
              onClick={async () => {
                setTgLoading(true);
                const r = await saveTelegramSettings(supabase, tgCfg, profile.id);
                setTgLoading(false);
                setTgMsg(r.success ? "Pengaturan Telegram disimpan" : r.error || "Gagal");
                setTimeout(() => setTgMsg(""), 3000);
              }}
              className="bg-sky-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {tgLoading ? "Menyimpan..." : "Simpan Telegram"}
            </button>
            <button
              type="button"
              disabled={tgLoading || !tgCfg.bot_token}
              onClick={async () => {
                setTgLoading(true);
                const t = await testTelegramConnection(tgCfg);
                if (!t.success) {
                  setTgMsg(t.error || "Token invalid");
                  setTgLoading(false);
                  return;
                }
                const send = await sendTelegram(
                  { ...tgCfg, enabled: true },
                  `✅ <b>Kasir POS</b>\nKoneksi Telegram OK.\nBot: @${t.botName || "-"}\nWaktu: ${new Date().toLocaleString("id-ID")}`
                );
                setTgLoading(false);
                setTgMsg(
                  send.success
                    ? `Tes OK — bot @${t.botName}. Cek chat Telegram.`
                    : send.error || "Gagal kirim tes"
                );
              }}
              className="border border-sky-600 text-sky-700 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Tes kirim
            </button>
            {tgMsg && <span className="text-sm text-sky-700">{tgMsg}</span>}
          </div>
        </div>
      )}

{/* PASSWORD */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Key size={18} />
          Ganti Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwMsg && (
            <div
              className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                pwMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {pwMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {pwMsg.text}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
            <input type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Password</label>
            <input type="password" required minLength={6} value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
          </div>
          <button type="submit" disabled={pwLoading}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium">
            {pwLoading ? "Menyimpan..." : "Ubah Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
