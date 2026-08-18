import { NextResponse } from "next/server";
import { generateRecommendations } from "@/lib/ai/agents/learning-router";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const signals = body?.signals ?? {
      masteryScores: [
        { submissionId: "sub-1", score: 31, level: "beginner", lastCalculatedAt: new Date().toISOString() },
        { submissionId: "sub-2", score: 76, level: "developing", lastCalculatedAt: new Date().toISOString() },
      ],
      recentVisits: [
        { submissionId: "sub-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), activeSeconds: 420, idleSeconds: 60 },
      ],
      quizTrajectories: [
        { submissionId: "sub-1", scores: [35, 45, 62], latestAt: new Date().toISOString() },
      ],
      contentStylePreferences: [
        { deliveryTypeId: "notes", deliveryTypeName: "Concept notes", totalActiveSeconds: 1800 },
        { deliveryTypeId: "video", deliveryTypeName: "Video", totalActiveSeconds: 1200 },
      ],
    };

    const availableSubmissions = body?.availableSubmissions ?? [
      {
        id: "sub-1",
        title: "Stack video",
        loTitle: "Stack",
        courseTitle: "Data structures and algorithms",
        courseSlug: "dsa",
        loId: "lo-stack",
        mastery: 31,
      },
      {
        id: "sub-2",
        title: "Linked list review",
        loTitle: "Linked list",
        courseTitle: "Data structures and algorithms",
        courseSlug: "dsa",
        loId: "lo-linked-list",
        mastery: 58,
      },
    ];

    const prerequisiteEdges = body?.prerequisiteEdges ?? [
      { sourceLoId: "lo-stack", targetLoId: "lo-linked-list" },
    ];

    const result = await generateRecommendations({
      signals,
      availableSubmissions,
      prerequisiteEdges,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/ai/recommend] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate recommendations.",
        fallback: {
          sections: [
            {
              sectionType: "continue",
              items: [
                {
                  submissionId: "fallback",
                  reason: "You recently started this topic and your mastery is still low, so the system is nudging you to revisit it before moving ahead.",
                  confidence: 0.72,
                  priority: 1,
                },
              ],
            },
          ],
          reasoning: "Fallback recommendation generated because the LLM was unavailable.",
        },
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST with student signals to generate recommendation output.",
    exampleBody: {
      signals: {
        masteryScores: [{ submissionId: "sub-1", score: 31, level: "beginner", lastCalculatedAt: new Date().toISOString() }],
        recentVisits: [{ submissionId: "sub-1", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), activeSeconds: 420, idleSeconds: 60 }],
        quizTrajectories: [{ submissionId: "sub-1", scores: [35, 45, 62], latestAt: new Date().toISOString() }],
        contentStylePreferences: [{ deliveryTypeId: "notes", deliveryTypeName: "Concept notes", totalActiveSeconds: 1800 }],
      },
      availableSubmissions: [{ id: "sub-1", title: "Stack video", loTitle: "Stack", courseTitle: "Data structures and algorithms", courseSlug: "dsa", loId: "lo-stack", mastery: 31 }],
      prerequisiteEdges: [{ sourceLoId: "lo-stack", targetLoId: "lo-linked-list" }],
    },
  });
}
