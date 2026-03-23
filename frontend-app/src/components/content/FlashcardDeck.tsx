"use client";

import { useState } from "react";
import type { FlashcardContent } from "@/types/learning";
import { Button } from "@/components/ui/button";

interface Props {
  data: FlashcardContent;
}

export function FlashcardDeck({ data }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const cards = data.cards ?? [];
  const card = cards[index];

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

  return (
    <div className="flex flex-col gap-4">
      <div
        className="min-h-[220px] cursor-pointer rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-center text-xl font-semibold shadow-xl"
        onClick={() => setFlipped((f) => !f)}
      >
        {flipped ? card.back : card.front}
      </div>
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Card {index + 1}/{cards.length}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={goPrev}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
