import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kasir POS - Sistem Kasir & Warehouse",
  description: "Aplikasi kasir modern dengan pelaporan keuangan dan warehouse",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased min-h-screen bg-slate-50">
        {children}
      </body>
    </html>
  );
}
