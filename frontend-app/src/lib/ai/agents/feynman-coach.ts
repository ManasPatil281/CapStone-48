/**
 * Feynman Socratic Coaching Agent — LangGraph StateGraph.
 *
 * Upgrades the one-shot Feynman evaluator into a multi-turn
 * Socratic coaching flow:
 *
 * 1. evaluate_explanation  → initial grading
 * 2. detect_misconception  → check for gaps
 * 3. ask_followup         → Socratic question (if misconception)
 * 4. final_grade          → produce final score + feedback
 * 5. persist_mastery      → save to database
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getGroqChat } from "@/lib/ai/model";
import {
  FEYNMAN_EVALUATION_PROMPT,
  FEYNMAN_MISCONCEPTION_PROMPT,
} from "@/lib/ai/prompts";
import {
  FeynmanEvaluationSchema,
  MisconceptionAnalysisSchema,
} from "@/lib/ai/output-schemas";
import {
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";

/* ── State Definition ────────────────────────────────────────────────── */

const FeynmanStateAnnotation = Annotation.Root({
  loTitle: Annotation<string>,
  explanation: Annotation<string>,
  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  currentScore: Annotation<number>({ default: () => 0 }),
  feedback: Annotation<string>({ default: () => "" }),
  misconceptions: Annotation<string[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  followUpQuestion: Annotation<string>({ default: () => "" }),
  followUpCount: Annotation<number>({ default: () => 0 }),
  maxFollowUps: Annotation<number>({ default: () => 2 }),
  phase: Annotation<"evaluate" | "followup" | "final">({
    default: () => "evaluate",
  }),
  studentResponse: Annotation<string>({ default: () => "" }),
});

type FeynmanState = typeof FeynmanStateAnnotation.State;

/* ── Node: Initial Evaluation ────────────────────────────────────────── */

async function evaluateExplanation(
  state: FeynmanState
): Promise<Partial<FeynmanState>> {
  const model = getGroqChat({ temperature: 0.3, maxTokens: 300 });
  const structuredModel = model.withStructuredOutput(FeynmanEvaluationSchema);

  const prompt = await FEYNMAN_EVALUATION_PROMPT.formatMessages({
    loTitle: state.loTitle,
    explanation: state.explanation,
  });

  const result = await structuredModel.invoke(prompt);

  return {
    currentScore: result.score,
    feedback: result.feedback,
    conversationHistory: [
      new HumanMessage(state.explanation),
      new AIMessage(
        `Score: ${result.score}/100. ${result.feedback}`
      ),
    ],
    phase: "followup" as const,
  };
}

/* ── Node: Detect Misconception ──────────────────────────────────────── */

async function detectMisconception(
  state: FeynmanState
): Promise<Partial<FeynmanState>> {
  const model = getGroqChat({ temperature: 0.3, maxTokens: 400 });
  const structuredModel = model.withStructuredOutput(
    MisconceptionAnalysisSchema
  );

  const prompt = await FEYNMAN_MISCONCEPTION_PROMPT.formatMessages({
    loTitle: state.loTitle,
    currentScore: state.currentScore.toString(),
    previousFeedback: state.feedback,
    conversation_history: state.conversationHistory,
    studentResponse:
      state.studentResponse || state.explanation,
  });

  const result = await structuredModel.invoke(prompt);

  return {
    currentScore: result.adjustedScore,
    feedback: result.feedback,
    misconceptions: result.misconceptions,
    followUpQuestion: result.hasMisconception
      ? result.followUpQuestion
      : "",
    followUpCount: state.followUpCount + 1,
    conversationHistory: result.hasMisconception
      ? [
          new AIMessage(
            `Follow-up: ${result.followUpQuestion}`
          ),
        ]
      : [],
    phase: result.hasMisconception ? ("followup" as const) : ("final" as const),
  };
}

/* ── Node: Final Grade ───────────────────────────────────────────────── */

async function finalGrade(
  state: FeynmanState
): Promise<Partial<FeynmanState>> {
  // The score and feedback are already set by previous nodes.
  // This node could do a final reasoning pass if needed.
  return {
    phase: "final" as const,
  };
}

/* ── Conditional Edge: Should Continue? ──────────────────────────────── */

function shouldContinue(state: FeynmanState): "detect_misconception" | "final_grade" {
  // Stop if we've asked enough follow-ups or no misconceptions left
  if (state.followUpCount >= state.maxFollowUps) {
    return "final_grade";
  }
  if (state.phase === "final") {
    return "final_grade";
  }
  return "detect_misconception";
}

/* ── Build the Graph ─────────────────────────────────────────────────── */

function buildFeynmanGraph() {
  const graph = new StateGraph(FeynmanStateAnnotation)
    .addNode("evaluate_explanation", evaluateExplanation)
    .addNode("detect_misconception", detectMisconception)
    .addNode("final_grade", finalGrade)
    .addEdge(START, "evaluate_explanation")
    .addConditionalEdges("evaluate_explanation", shouldContinue)
    .addConditionalEdges("detect_misconception", shouldContinue)
    .addEdge("final_grade", END);

  return graph.compile();
}

/* ── Public API ──────────────────────────────────────────────────────── */

export interface FeynmanCoachInput {
  loTitle: string;
  explanation: string;
  maxFollowUps?: number;
}

export interface FeynmanCoachResult {
  score: number;
  feedback: string;
  misconceptions: string[];
  followUpQuestion: string;
  followUpCount: number;
  phase: "evaluate" | "followup" | "final";
}

/**
 * Run the initial Feynman evaluation through the LangGraph pipeline.
 *
 * Returns the result after the first evaluation pass.
 * If misconceptions are detected, `followUpQuestion` will be populated
 * and the frontend can send follow-up responses via the followup endpoint.
 */
export async function evaluateFeynman(
  input: FeynmanCoachInput
): Promise<FeynmanCoachResult> {
  const app = buildFeynmanGraph();

  const result = await app.invoke({
    loTitle: input.loTitle,
    explanation: input.explanation,
    maxFollowUps: input.maxFollowUps ?? 2,
  });

  return {
    score: result.currentScore,
    feedback: result.feedback,
    misconceptions: result.misconceptions,
    followUpQuestion: result.followUpQuestion,
    followUpCount: result.followUpCount,
    phase: result.phase,
  };
}

/**
 * Process a follow-up response from the student through the graph.
 */
export async function processFollowUp(input: {
  loTitle: string;
  studentResponse: string;
  previousState: FeynmanCoachResult;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<FeynmanCoachResult> {
  const app = buildFeynmanGraph();

  // Convert conversation history to LangChain messages
  const history: BaseMessage[] = input.conversationHistory.map((msg) =>
    msg.role === "user"
      ? new HumanMessage(msg.content)
      : new AIMessage(msg.content)
  );

  // We need to run just the misconception detection node
  const model = getGroqChat({ temperature: 0.3, maxTokens: 400 });
  const structuredModel = model.withStructuredOutput(
    MisconceptionAnalysisSchema
  );

  const prompt = await FEYNMAN_MISCONCEPTION_PROMPT.formatMessages({
    loTitle: input.loTitle,
    currentScore: input.previousState.score.toString(),
    previousFeedback: input.previousState.feedback,
    conversation_history: history,
    studentResponse: input.studentResponse,
  });

  const result = await structuredModel.invoke(prompt);

  const newFollowUpCount = input.previousState.followUpCount + 1;
  const shouldStop =
    !result.hasMisconception ||
    newFollowUpCount >= (input.previousState.followUpCount > 0 ? 2 : 2);

  return {
    score: result.adjustedScore,
    feedback: result.feedback,
    misconceptions: [
      ...input.previousState.misconceptions,
      ...result.misconceptions,
    ],
    followUpQuestion: result.hasMisconception
      ? result.followUpQuestion
      : "",
    followUpCount: newFollowUpCount,
    phase: shouldStop ? "final" : "followup",
  };
}
