import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FinalizePayload = {
  sessionId?: string;
  studentId?: string;
  submissionId?: string;
  activeSeconds?: number;
  idleSeconds?: number;
  endedAt?: string;
  contentDeltas?: Array<{
    content_id: string;
    delivery_type_id: string;
    active_seconds: number;
    idle_seconds: number;
  }>;
};

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr) {
      console.error("[finalize-session] Failed to resolve auth user:", authErr);
      return NextResponse.json({ ok: true });
    }

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const payload = (await request.json()) as FinalizePayload;

    if (!payload.sessionId) {
      return NextResponse.json({ ok: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;

    try {
      const { error: visitUpdateErr } = await supabaseAny
        .from("student_submission_visit")
        .update({
          ended_at: payload.endedAt ?? new Date().toISOString(),
          active_seconds: Number(payload.activeSeconds ?? 0),
          idle_seconds: Number(payload.idleSeconds ?? 0),
        })
        .eq("id", payload.sessionId)
        .eq("student_id", user.id);

      if (visitUpdateErr) {
        throw visitUpdateErr;
      }
    } catch (visitErr) {
      console.error("[finalize-session] Failed to update visit row:", visitErr);
    } finally {
      // no-op
    }

    try {
      const deltas = (payload.contentDeltas ?? []).filter(
        (item) => (item.active_seconds ?? 0) > 0 || (item.idle_seconds ?? 0) > 0
      );

      for (const delta of deltas) {
        try {
          const { data: existingRow, error: existingErr } = await supabaseAny
            .from("student_content_block_time")
            .select("id, active_seconds, idle_seconds, first_viewed_at")
            .eq("student_id", user.id)
            .eq("submission_id", payload.submissionId)
            .eq("content_id", delta.content_id)
            .maybeSingle();

          if (existingErr) {
            throw existingErr;
          }

          const candidateViewedAt = payload.endedAt ?? new Date().toISOString();

          if (existingRow?.id) {
            const firstViewedAt =
              typeof existingRow.first_viewed_at === "string" ? existingRow.first_viewed_at : null;
            const firstViewedAtMs = firstViewedAt ? Date.parse(firstViewedAt) : NaN;
            const candidateViewedAtMs = Date.parse(candidateViewedAt);
            const lastViewedAt =
              Number.isFinite(firstViewedAtMs) &&
              Number.isFinite(candidateViewedAtMs) &&
              candidateViewedAtMs < firstViewedAtMs
                ? new Date(firstViewedAtMs).toISOString()
                : candidateViewedAt;

            const { error: updateErr } = await supabaseAny
              .from("student_content_block_time")
              .update({
                active_seconds:
                  Number(existingRow.active_seconds ?? 0) + Number(delta.active_seconds ?? 0),
                idle_seconds:
                  Number(existingRow.idle_seconds ?? 0) + Number(delta.idle_seconds ?? 0),
                last_viewed_at: lastViewedAt,
              })
              .eq("id", existingRow.id);

            if (updateErr) {
              throw updateErr;
            }
          } else {
            const viewedAt = candidateViewedAt;

            const { error: insertErr } = await supabaseAny
              .from("student_content_block_time")
              .insert({
                student_id: user.id,
                submission_id: payload.submissionId,
                content_id: delta.content_id,
                delivery_type_id: delta.delivery_type_id,
                active_seconds: Number(delta.active_seconds ?? 0),
                idle_seconds: Number(delta.idle_seconds ?? 0),
                first_viewed_at: viewedAt,
                last_viewed_at: viewedAt,
              });

            if (insertErr) {
              throw insertErr;
            }
          }
        } catch (deltaErr) {
          console.error("[finalize-session] Failed content delta persist:", deltaErr);
        } finally {
          // no-op
        }
      }
    } catch (contentErr) {
      console.error("[finalize-session] Failed content delta loop:", contentErr);
    } finally {
      // no-op
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[finalize-session] Unexpected error:", err);
    return NextResponse.json({ ok: true });
  } finally {
    // no-op
  }
}
