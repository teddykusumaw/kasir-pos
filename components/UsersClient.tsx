"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, UserRole } from "@/types/database";
import { formatDate } from "@/lib/utils";

interface Props {
  initialUsers: Profile[];
}

export default function UsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "cashier" as UserRole,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const supabase = createClient();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Create user via signUp (in production, better use Admin API / Edge Function)
      const { data, error: signErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.full_name,
            role: form.role,
          },
        },
      });

      if (signErr) throw signErr;

      if (data.user) {
        // Profile should be auto-created by trigger
        // Wait a bit and refresh
        setTimeout(async () => {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("*")
            .order("created_at");
          if (profiles) setUsers(profiles);
        }, 1000);

        setSuccess("User berhasil ditambahkan!");
        setForm({ email: "", password: "", full_name: "", role: "cashier" });
        setShowModal(false);
      }
    } catch (err: any) {
      setError(err.message || "Gagal menambah user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen User</h1>
          <p className="text-slate-500">
            Hanya admin yang dapat menambah user
          </p>
        </div>
        <button
          onClick={() => {
            setShowModal(true);
            setError("");
            setSuccess("");
          }}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
        >
          <UserPlus size={18} />
          Tambah User
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nama</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      u.role === "admin"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(u.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-5 border-b">
              <h2 className="text-lg font-semibold">Tambah User Baru</h2>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nama Lengkap
                </label>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as UserRole })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none text-sm"
                >
                  <option value="cashier">Kasir</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg border text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {loading ? "Menyimpan..." : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
