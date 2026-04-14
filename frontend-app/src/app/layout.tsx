import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/layout/UserNav";
import { BookOpen } from "lucide-react";

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
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between px-6">
            <a
              href="/"
              className="flex items-center gap-2.5 text-slate-100 transition-colors hover:text-white"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
                <BookOpen className="h-3.5 w-3.5 text-brand" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Adaptive Learning</span>
            </a>
            <UserNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
