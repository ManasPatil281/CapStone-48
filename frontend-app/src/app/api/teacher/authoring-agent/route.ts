import { NextResponse } from "next/server";
import { generateCoursePackage } from "@/lib/ai/agents/course-authoring-agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topicTitle = "Graph Breadth-First Search (BFS)", courseTitle } = body;

    if (!topicTitle) {
      return NextResponse.json({ error: "topicTitle is required" }, { status: 400 });
    }

    const pkg = await generateCoursePackage({ topicTitle, courseTitle });
    return NextResponse.json(pkg);
  } catch (error) {
    console.error("[api/teacher/authoring-agent] Error:", error);
    return NextResponse.json({ error: "Failed to author course package." }, { status: 500 });
  }
}
