export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      learning_object: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string | null;
          difficulty_level: number;
          estimated_time_minutes: number;
          status: "draft" | "published" | "archived";
        };
      };
      learning_object_content: {
        Row: {
          id: string;
          learning_object_id: string;
          delivery_type_id: string;
          title: string;
          content_json: Json;
          sequence_order: number;
          is_active: boolean;
        };
      };
      delivery_type: {
        Row: {
          id: string;
          code: string;
          name: string;
        };
      };
      learning_object_prerequisite: {
        Row: {
          id: string;
          learning_object_id: string;
          prerequisite_lo_id: string;
        };
      };
      user_learning_progress: {
        Row: {
          id: string;
          user_id: string;
          learning_object_id: string;
          status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "MASTERED";
          completion_percentage: number;
          mastery_score: number | null;
        };
      };
      user_lo_activity: {
        Row: {
          id: string;
          user_id: string;
          learning_object_id: string;
          delivery_type_id: string;
          time_spent_seconds: number;
          interactions_count: number;
        };
      };
      lo_assessment: {
        Row: {
          id: string;
          learning_object_id: string;
          title: string;
          pass_percentage: number;
          max_attempts: number;
        };
      };
      lo_question: {
        Row: {
          id: string;
          assessment_id: string;
          question_type: "MCQ" | "TRUE_FALSE" | "CODE" | "SHORT";
          question_text: string;
          metadata_json: Json;
          marks: number;
        };
      };
      lo_question_option: {
        Row: {
          id: string;
          question_id: string;
          option_text: string;
          is_correct: boolean;
        };
      };
      user_assessment_attempt: {
        Row: {
          id: string;
          user_id: string;
          assessment_id: string;
          attempt_number: number;
          score: number;
          percentage: number;
          is_passed: boolean;
        };
      };
    };
  };
}
