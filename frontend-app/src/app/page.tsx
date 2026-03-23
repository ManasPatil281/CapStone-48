import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-indigo-500/20 via-slate-950 to-slate-900 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.4em] text-brand-muted">Adaptive Learning</p>
      <h1 className="max-w-2xl text-4xl font-semibold sm:text-5xl">
        Build atomic learning journeys powered by AI-driven personalization.
      </h1>
      <p className="max-w-xl text-lg text-slate-300">
        Explore the DSA pilot and experience mastery-based progress, interactive roadmaps, and intelligent feedback loops.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button asChild>
          <Link href="/courses/dsa/linked-list">Explore Linked List LO</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Student Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
