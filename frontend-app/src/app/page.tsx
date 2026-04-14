import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-slate-950 px-6 text-center">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-muted">
          Adaptive Learning Platform
        </p>

        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl">
          Build atomic learning journeys<br className="hidden sm:block" />
          powered by AI-driven personalization.
        </h1>

        <p className="max-w-lg text-base leading-relaxed text-slate-400">
          Explore the DSA pilot and experience mastery-based progress, interactive
          roadmaps, and intelligent feedback loops.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/courses/dsa/linked-list">Explore Linked List LO</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Student Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
