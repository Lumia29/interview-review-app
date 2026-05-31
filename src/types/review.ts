export type JobType =
  | "运营"
  | "产品经理"
  | "数据分析"
  | "研发"
  | "设计"
  | "市场"
  | "其他";

export type ScoreDimensions = {
  logic: number;
  content: number;
  expression: number;
  jobFit: number;
};

export type ReviewInput = {
  jobType: JobType;
  company: string;
  jobTitle: string;
  interviewRound: string;
  jobDescription: string;
  transcript: string;
};

export type QuestionReview = {
  id: string;
  question: string;
  questionType: string;
  difficulty: "低" | "中" | "高";
  isKeyQuestion: boolean;
  answerSummary: string;
  scores: ScoreDimensions;
  totalScore: number;
  issues: string[];
  improvement: string;
  betterAnswer: string;
  practiceAnswer?: string;
  unsupportedBetterAnswerClaims?: string[];
};

export type Prediction = {
  question: string;
  reason: string;
  prepAdvice: string;
  answerFrame: string;
};

export type ReverseQuestion = {
  question: string;
  purpose: string;
  timing: string;
};

export type ReviewReport = {
  overallScore: number;
  dimensions: ScoreDimensions;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  priorityActions: string[];
  questions: QuestionReview[];
  predictions: Prediction[];
  reverseQuestions?: ReverseQuestion[];
};

export type SavedReview = {
  id: string;
  createdAt: string;
  userEmail: string;
  input: ReviewInput;
  report: ReviewReport;
};
