import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitBranch, Zap, Map } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative flex min-h-[calc(100vh-56px)] flex-col items-center justify-center overflow-hidden px-6 text-center">

      {/* ── Background composition ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Primary ambient glow */}
        <div className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-[55%] rounded-full bg-brand/5 blur-[120px]" />
        {/* Secondary accent */}
        <div className="absolute right-1/4 bottom-1/4 h-[280px] w-[280px] rounded-full bg-brand/4 blur-[80px]" />
        {/* Dot grid overlay */}
        <div className="absolute inset-0 bg-dot-grid opacity-100" />
        {/* Radial fade mask */}
        <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-transparent to-slate-950/80" />
      </div>

      {/* ── Content ── */}
      <div className="relative flex max-w-3xl flex-col items-center gap-8">

        {/* Eyebrow pill */}
        <div className="flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
          <span className="text-xs font-semibold tracking-label text-brand-muted uppercase">
            Adaptive Learning Platform
          </span>
        </div>

        {/* Hero heading */}
        <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-6xl">
          Build atomic<br className="hidden sm:block" /> learning journeys
          <span className="block text-slate-400 sm:inline"> powered by intelligent paths.</span>
        </h1>

        {/* Sub-text */}
        <p className="max-w-md text-base leading-relaxed text-slate-500">
          Explore the DSA pilot — mastery-based progress, interactive
          prerequisite roadmaps, and adaptive feedback loops.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/courses/dsa/linked-list" className="flex items-center gap-2">
              Explore Linked List LO
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/dashboard">Student Dashboard</Link>
          </Button>
        </div>

        {/* Feature pills */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {[
            { icon: <GitBranch className="h-3.5 w-3.5" />, label: "Prerequisite graphs" },
            { icon: <Zap className="h-3.5 w-3.5" />, label: "Mastery tracking" },
            { icon: <Map className="h-3.5 w-3.5" />, label: "Course roadmaps" }
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-500"
            >
              <span className="text-slate-600">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
