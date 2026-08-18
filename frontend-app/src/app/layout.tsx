import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/layout/UserNav";
import { AgentModeOverlay } from "@/components/layout/AgentModeOverlay";

export const metadata: Metadata = {
  title: "Adaptive Learning Platform",
  description: "AI-powered modular learning paths with autonomous agent mode"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("min-h-screen bg-slate-950 text-slate-50 antialiased")}>
        <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between px-6">
            {/* Brand */}
            <a
              href="/"
              className="group flex items-center gap-3 text-slate-100 transition-colors hover:text-white"
            >
              {/* Logo mark */}
              <div className="relative flex h-7 w-7 items-center justify-center">
                <div className="absolute inset-0 rounded-lg bg-brand/20 blur-[6px] transition-all group-hover:bg-brand/30" />
                <div className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-brand/30 bg-brand/15">
                  {/* Custom SVG icon: stacked nodes (represents learning graph) */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                    className="text-brand"
                  >
                    <circle cx="7" cy="2.5" r="1.75" fill="currentColor" opacity="0.9" />
                    <circle cx="3" cy="9" r="1.75" fill="currentColor" opacity="0.6" />
                    <circle cx="11" cy="9" r="1.75" fill="currentColor" opacity="0.6" />
                    <line x1="7" y1="4.25" x2="3.7" y2="7.4" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
                    <line x1="7" y1="4.25" x2="10.3" y2="7.4" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
                  </svg>
                </div>
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-200 transition-colors group-hover:text-white">
                Pathfinder
              </span>
            </a>

            <UserNav />
          </div>
        </header>

        {children}

        {/* Global Agent Mode Overlay Co-pilot */}
        <AgentModeOverlay />
      </body>
    </html>
  );
}
