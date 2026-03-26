import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/layout/UserNav";

export const metadata: Metadata = {
  title: "Adaptive Learning Platform",
  description: "AI-powered modular learning paths"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-slate-950 text-slate-50 antialiased")}>
        <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-sm">
          <div className="flex h-16 items-center justify-between px-6">
            <a href="/" className="text-lg font-semibold text-brand">
              Adaptive Learning
            </a>
            <UserNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
