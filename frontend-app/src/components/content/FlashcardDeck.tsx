"use client";

import { useState } from "react";
import type { FlashcardContent } from "@/types/learning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface Props {
  data: FlashcardContent;
}

export function FlashcardDeck({ data }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState<Set<number>>(new Set());
  const cards = data.cards ?? [];
  const card = cards[index];
  const progressPercent = Math.round((masteredCards.size / cards.length) * 100);

  if (!card) {
    return <p className="text-sm text-slate-400">No flashcards yet.</p>;
  }

  const goNext = () => {
    setIndex((idx) => (idx + 1) % cards.length);
    setFlipped(false);
  };

  const goPrev = () => {
    setIndex((idx) => (idx - 1 + cards.length) % cards.length);
    setFlipped(false);
  };

  const toggleMastered = () => {
    const newSet = new Set(masteredCards);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setMasteredCards(newSet);
  };

  const isMastered = masteredCards.has(index);

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-200">Progress</span>
          <span className="text-xs font-bold text-brand">{masteredCards.size}/{cards.length} Mastered</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Flashcard */}
      <div
        className={`group relative min-h-[280px] cursor-pointer rounded-3xl border-2 transition-all duration-300 p-8 flex flex-col items-center justify-center text-center shadow-xl ${
          flipped
            ? "border-green-500/50 bg-gradient-to-br from-green-900/20 to-slate-900"
            : "border-brand/40 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 hover:border-brand/60"
        }`}
        onClick={() => setFlipped((f) => !f)}
      >
        {/* Flip Hint */}
        <div className="absolute top-3 right-3 text-xs text-slate-400 group-hover:text-slate-300">
          Click to flip
        </div>

        {/* Card Content */}
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
            {flipped ? "Answer" : "Question"}
          </div>
          <p className="text-xl font-semibold text-white leading-relaxed">
            {flipped ? card.back : card.front}
          </p>
        </div>

        {/* Mastered Badge */}
        {isMastered && (
          <div className="absolute bottom-4 left-4">
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">✓ Mastered</Badge>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Card <span className="font-semibold text-slate-200">{index + 1}</span>/{cards.length}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={goPrev} className="text-slate-300 hover:text-white">
              ← Back
            </Button>
            <Button variant="ghost" size="sm" onClick={goNext} className="text-slate-300 hover:text-white">
              Next →
            </Button>
          </div>
        </div>
        <Button
          onClick={toggleMastered}
          className={`w-full transition-all ${
            isMastered
              ? "bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/30"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
          variant="outline"
        >
          {isMastered ? "✓ Mark as Mastered" : "Mark as Mastered"}
        </Button>
      </div>
    </div>
  );
}
