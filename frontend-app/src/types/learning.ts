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

// Teacher submission types
export type TeacherSubmission = Tables["teacher_lo_submission"]["Row"];
export type TeacherSubmissionContent = Tables["teacher_lo_submission_content"]["Row"] & {
  delivery_type?: DeliveryType;
  // Make it compatible with LearningObjectContent for rendering
  learning_object_id?: string;
  is_active?: boolean;
};
export type TeacherSubmissionEdge = Tables["teacher_lo_submission_edge"]["Row"];
export type TeacherSubmissionCoursePrerequisite = Tables["teacher_lo_submission_course_prerequisite"]["Row"];
export type TeacherSubmissionAssessment = Tables["teacher_lo_submission_assessment"]["Row"];
export type TeacherSubmissionQuestion = Tables["teacher_lo_submission_question"]["Row"] & {
  options?: TeacherSubmissionQuestionOption[];
};
export type TeacherSubmissionQuestionOption = Tables["teacher_lo_submission_question_option"]["Row"];

export interface LearningObjectDetail extends LearningObject {
  contents: LearningObjectContent[];
  deliveryTypes: Record<string, DeliveryType>;
  prerequisites: LearningObject[];
  dependents: LearningObject[];
  assessment?: Assessment & { questions: Question[] };
  progress?: UserLearningProgress;
}

export interface ContentTabData {
  blocks?: LearningObjectContent[];
  video?: LearningObjectContent[];
  pdf?: LearningObjectContent[];
  notes?: LearningObjectContent[];
  flashcards?: LearningObjectContent[];
  playground?: LearningObjectContent[];
  conceptNotes?: LearningObjectContent[];
  flowchart?: LearningObjectContent[];
  visualExplanation?: LearningObjectContent[];
  workedExample?: LearningObjectContent[];
  practiceSet?: LearningObjectContent[];
  revisionSheet?: LearningObjectContent[];
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

export type ConceptNotesContent = {
  markdown: string;
};

export type FlowchartContent = {
  image_url: string;
  caption?: string;
};

export type VisualExplanationContent = {
  image_url: string;
  caption?: string;
  text?: string;
};

export type WorkedExampleContent = {
  problem: string;
  solution: string;
  explanation: string;
};

export type PracticeSetContent = {
  questions: string[];
};

export type RevisionSheetContent = {
  summary: string;
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

export type ContentJSON =
  | VideoContent
  | NoteContent
  | PdfContent
  | FlashcardContent
  | PlaygroundContent
  | ConceptNotesContent
  | FlowchartContent
  | VisualExplanationContent
  | WorkedExampleContent
  | PracticeSetContent
  | RevisionSheetContent
  | Json;
