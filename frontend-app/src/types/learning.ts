import type { Database, Json } from "@/types/database";

type Tables = Database["public"]["Tables"];

export type LearningObject = Tables["learning_object"]["Row"];
export type LearningObjectContent = Tables["learning_object_content"]["Row"] & {
  delivery_type?: DeliveryType;
};
export type DeliveryType = Tables["delivery_type"]["Row"];
export type LearningObjectPrerequisite = Tables["learning_object_prerequisite"]["Row"];
export type UserLearningProgress = Tables["user_learning_progress"]["Row"];
export type Assessment = Tables["lo_assessment"]["Row"];
export type Question = Tables["lo_question"]["Row"] & {
  options?: QuestionOption[];
};
export type QuestionOption = Tables["lo_question_option"]["Row"];
export type AssessmentAttempt = Tables["user_assessment_attempt"]["Row"];

export interface LearningObjectDetail extends LearningObject {
  contents: LearningObjectContent[];
  deliveryTypes: Record<string, DeliveryType>;
  prerequisites: LearningObject[];
  dependents: LearningObject[];
  assessment?: Assessment & { questions: Question[] };
  progress?: UserLearningProgress;
}

export interface ContentTabData {
  video?: LearningObjectContent[];
  pdf?: LearningObjectContent[];
  notes?: LearningObjectContent[];
  flashcards?: LearningObjectContent[];
  playground?: LearningObjectContent[];
}

export type DeliveryPreference = {
  delivery_type_id: string;
  preference_score: number;
};

export type PlaygroundPractice = {
  id: string | number;
  title: string;
  description: string;
  expected_output?: string;
  hint?: string;
};

export type PlaygroundContent = {
  language: string;
  starter_code: string;
  practices?: PlaygroundPractice[];
};

export type FlashcardContent = {
  cards: { front: string; back: string }[];
};

export type VideoContent = {
  url: string;
  duration_seconds?: number;
  chapters?: { time: number; title: string }[];
};

export type NoteContent = {
  markdown: string;
};

export type PdfContent = {
  pdf_url: string;
  page_count?: number;
};

export type ContentJSON = VideoContent | NoteContent | PdfContent | FlashcardContent | PlaygroundContent | Json;
