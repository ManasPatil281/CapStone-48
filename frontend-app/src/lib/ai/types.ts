export interface SubmissionChatContextBlock {
  title: string;
  deliveryType: string;
  text: string;
}

export interface SubmissionChatContext {
  courseTitle: string;
  loTitle: string;
  submissionTitle: string;
  submissionId: string;
  teacherName?: string;
  loDescription?: string;
  teachingBlocks: SubmissionChatContextBlock[];
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type StruggleSignal = {
  idleSeconds?: number;
  recentQuizScore?: number | null;
  confusionCount?: number;
};

export type InterventionType =
  | "none"
  | "hint"
  | "analogy"
  | "prerequisite_recap"
  | "micro_quiz"
  | "reflection";

export interface TutorAgentState {
  goal: string;
  stage: "diagnose" | "explain" | "check" | "remediate" | "reflect";
  nextAction: string;
  confidence: number;
  intervention: InterventionType;
  rationale?: string;
}
