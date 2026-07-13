import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas BPO — DRYVN",
  description: "DRYVN's business outsourcing machine for Freelancer.com",
};

const nav = [
  { href: "/", label: "Overview" },
  { href: "/bids", label: "Bids" },
  { href: "/chats", label: "Chats" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex">
        <aside className="w-56 shrink-0 border-r border-edge bg-surface flex flex-col">
          <div className="px-5 py-5 border-b border-edge">
            <div className="text-lg font-semibold tracking-tight">
              DRYVN <span className="text-accent-ink">Atlas</span>
            </div>
            <div className="text-xs text-muted mt-0.5">Business Outsourcing Machine</div>
          </div>
          <nav className="flex-1 px-2 py-3 space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-ink2 hover:text-foreground hover:bg-raised"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-5 py-4 border-t border-edge text-xs text-muted">
            Quality first. Never over capacity.
          </div>
        </aside>
        <main className="flex-1 min-w-0 px-8 py-6">{children}</main>
      </body>
    </html>
  );
}
