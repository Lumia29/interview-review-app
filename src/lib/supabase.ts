import { createClient } from "@supabase/supabase-js";
import type { JobType, ReviewInput, ReviewReport, SavedJob, SavedReview } from "@/types/review";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export type JobRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  job_type: JobType;
  company: string | null;
  job_title: string;
  job_description: string | null;
};

export type JobInsert = {
  user_id: string;
  job_type: JobType;
  company: string | null;
  job_title: string;
  job_description: string | null;
};

export type ReviewReportRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  created_at: string;
  job_type: JobType;
  company: string | null;
  job_title: string;
  interview_round: string;
  job_description: string | null;
  transcript: string;
  report: ReviewReport;
};

type ReviewReportInsert = {
  user_id: string;
  job_id: string | null;
  job_type: JobType;
  company: string | null;
  job_title: string;
  interview_round: string;
  job_description: string | null;
  transcript: string;
  report: ReviewReport;
};

type Database = {
  public: {
    Tables: {
      jobs: {
        Row: JobRow;
        Insert: JobInsert;
        Update: Partial<JobInsert>;
        Relationships: [];
      };
      review_reports: {
        Row: ReviewReportRow;
        Insert: ReviewReportInsert;
        Update: Partial<ReviewReportInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;

export function reviewRowToSavedReview(row: ReviewReportRow, userEmail: string): SavedReview {
  return {
    id: row.id,
    jobId: row.job_id || undefined,
    createdAt: row.created_at,
    userEmail,
    input: {
      jobType: row.job_type,
      company: row.company || "",
      jobTitle: row.job_title,
      interviewRound: row.interview_round,
      jobDescription: row.job_description || "",
      transcript: row.transcript,
    },
    report: row.report,
  };
}

export function jobRowToSavedJob(row: JobRow): SavedJob {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobType: row.job_type,
    company: row.company || "",
    jobTitle: row.job_title,
    jobDescription: row.job_description || "",
  };
}

export function reviewInputToJobInsert(userId: string, input: ReviewInput): JobInsert {
  return {
    user_id: userId,
    job_type: input.jobType,
    company: input.company.trim() || null,
    job_title: input.jobTitle.trim(),
    job_description: input.jobDescription.trim() || null,
  };
}

export function reviewInputToInsert(
  userId: string,
  jobId: string | null,
  input: ReviewInput,
  report: ReviewReport,
): ReviewReportInsert {
  return {
    user_id: userId,
    job_id: jobId,
    job_type: input.jobType,
    company: input.company.trim() || null,
    job_title: input.jobTitle.trim(),
    interview_round: input.interviewRound.trim(),
    job_description: input.jobDescription.trim() || null,
    transcript: input.transcript,
    report,
  };
}
