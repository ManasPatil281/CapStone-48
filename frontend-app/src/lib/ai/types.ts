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
