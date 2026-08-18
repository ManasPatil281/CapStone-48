"use client";

import { useState } from "react";
import { Users, Sparkles, Loader2, MessageCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PeerMatchResult } from "@/lib/ai/agents/peer-matching-agent";

export function PeerMatchingWidget() {
  const [match, setMatch] = useState<PeerMatchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const findPeer = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/peer-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicTitle: "Stack Data Structure & LIFO",
          learnerMasteryScore: 42,
        }),
      });
      const data = await res.json();
      setMatch(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-purple-500/20 bg-slate-900/60 p-5 space-y-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/15">
            <Users className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Study partner recommender
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-semibold text-purple-300 border border-purple-500/20">
                PEER SUPPORT
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              This agent looks for a peer who recently mastered the same concept and suggests a helpful study connection.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={findPeer}
          disabled={isLoading}
          className="bg-purple-600 text-white font-semibold hover:bg-purple-500 text-xs"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Matching Peer...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Find Peer Mentor
            </>
          )}
        </Button>
      </div>

      {match && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-4 space-y-3 text-xs animate-in fade-in-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-purple-400" />
              <span className="font-bold text-slate-100 text-sm">{match.matchedPeerName}</span>
            </div>
            <span className="font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
              {match.compatibilityScorePercent}% Match
            </span>
          </div>

          <p className="text-slate-300">
            <strong>Why this match:</strong> {match.peerRoleDescription}
          </p>

          <div className="rounded bg-slate-900 border border-slate-800 p-2.5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Suggested conversation starter</span>
            <p className="text-slate-200 italic">“{match.icebreakerQuestion}”</p>
          </div>
        </div>
      )}
    </div>
  );
}
