"use client";

import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Check,
  ClipboardList,
  FileText,
  History,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserPlus,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { emptyInput } from "@/lib/demo-report";
import {
  isSupabaseConfigured,
  reviewInputToJobInsert,
  reviewInputToInsert,
  reviewRowToSavedReview,
  supabase,
} from "@/lib/supabase";
import type { JobType, ReviewInput, ReviewReport, SavedReview } from "@/types/review";

const jobTypes: JobType[] = ["运营", "产品经理", "数据分析", "研发", "设计", "市场", "其他"];
const userKey = "interview-review-user";
const historyKey = "interview-review-history";
const analysisStages = ["正在清洗文字稿", "正在提取关键问题", "正在生成复盘报告", "正在核对更好回答"];

type AnalyzeResponse = {
  report?: ReviewReport;
  mode?: "demo" | "openai" | "compatible";
  error?: string;
};

type ExtractDocxResponse = {
  filename?: string;
  text?: string;
  warnings?: string[];
  error?: string;
};

type QuestionScoreDatum = {
  name: string;
  score: number;
  questionId: string;
};

type JobReviewGroup = {
  id: string;
  jobType: JobType;
  company: string;
  jobTitle: string;
  jobDescription: string;
  latestAt: string;
  averageScore: number;
  reviews: SavedReview[];
};

type AuthView = "password" | "signup" | "magic" | "reset";

function authErrorMessage(error: unknown, fallback: string) {
  const rawMessage = error instanceof Error ? error.message : "";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "请求太频繁了。请先不要重复点击，稍等一段时间后再试。";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "邮箱或密码不正确。";
  }

  if (normalized.includes("email not confirmed")) {
    return "请先打开邮箱确认账号后再登录。";
  }

  if (normalized.includes("password") && normalized.includes("characters")) {
    return "密码长度不符合要求，请至少输入 6 位。";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "这个邮箱已注册。请直接登录，或使用“忘记密码 / 设置密码”。";
  }

  return rawMessage ? `${fallback}：${rawMessage}` : fallback;
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 75) return "text-sky-700 bg-sky-50 border-sky-200";
  if (score >= 65) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function localJobId(input: ReviewInput) {
  return [
    "local",
    input.jobType,
    input.company.trim() || "未填公司",
    input.jobTitle.trim() || "未填岗位",
  ].join("::");
}

function groupSavedReviews(reviews: SavedReview[]): JobReviewGroup[] {
  const groups = new Map<string, JobReviewGroup>();

  for (const review of reviews) {
    const groupId = review.jobId || localJobId(review.input);
    const existing = groups.get(groupId);

    if (existing) {
      existing.reviews.push(review);
      if (new Date(review.createdAt) > new Date(existing.latestAt)) {
        existing.latestAt = review.createdAt;
      }
      continue;
    }

    groups.set(groupId, {
      id: groupId,
      jobType: review.input.jobType,
      company: review.input.company,
      jobTitle: review.input.jobTitle,
      jobDescription: review.input.jobDescription,
      latestAt: review.createdAt,
      averageScore: review.report.overallScore,
      reviews: [review],
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const reviewsInGroup = [...group.reviews].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const averageScore = Math.round(
        reviewsInGroup.reduce((sum, review) => sum + review.report.overallScore, 0) /
          reviewsInGroup.length,
      );

      return {
        ...group,
        reviews: reviewsInGroup,
        averageScore,
      };
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBetterAnswerSegments(text: string, unsupportedClaims: string[] = []) {
  const ranges: { start: number; end: number; tone: "supported" | "needsInput" }[] = [];
  const placeholderPattern = /\[[^\]]+\]/g;
  let placeholderMatch: RegExpExecArray | null;

  while ((placeholderMatch = placeholderPattern.exec(text))) {
    ranges.push({
      start: placeholderMatch.index,
      end: placeholderMatch.index + placeholderMatch[0].length,
      tone: "needsInput",
    });
  }

  for (const claim of unsupportedClaims) {
    const trimmed = claim.trim();
    if (!trimmed) continue;

    const pattern = new RegExp(escapeRegExp(trimmed), "g");
    let claimMatch: RegExpExecArray | null;
    while ((claimMatch = pattern.exec(text))) {
      ranges.push({
        start: claimMatch.index,
        end: claimMatch.index + claimMatch[0].length,
        tone: "needsInput",
      });
    }
  }

  const mergedRanges = ranges
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<typeof ranges>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
        previous.tone = "needsInput";
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);

  const segments: { text: string; tone: "supported" | "needsInput" }[] = [];
  let cursor = 0;

  for (const range of mergedRanges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), tone: "supported" });
    }
    segments.push({ text: text.slice(range.start, range.end), tone: range.tone });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), tone: "supported" });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function getPracticeAnswer(question: ReviewReport["questions"][number]) {
  return question.practiceAnswer || question.betterAnswer.replace(/\[[^\]]+\]/g, "这里补充真实素材");
}

function getReverseQuestions(report: ReviewReport | null) {
  if (report?.reverseQuestions?.length) return report.reverseQuestions;

  return [
    {
      question: "如果我进入团队，前三个月最希望我优先解决哪类问题？",
      purpose: "判断岗位真实优先级，也体现你关注落地和交付。",
      timing: "适合业务面或未来直属负责人面试结尾。",
    },
    {
      question: "这个岗位和算法、规则、业务团队的协作边界通常是怎样的？",
      purpose: "确认工作方式，也展示你重视跨团队协作和责任边界。",
      timing: "适合对方介绍团队协作或岗位职责之后。",
    },
    {
      question: "团队判断这个岗位做得好的核心标准是什么？",
      purpose: "了解成功标准，帮助你判断岗位是否匹配自己的优势。",
      timing: "适合几乎所有轮次的结尾反问。",
    },
  ];
}

function inferInputFromExtractedText(text: string, current: ReviewInput): ReviewInput {
  const jobTypeMatch = text.match(/岗位类型[：:]\s*([^\n]+)/);
  const jobTitleMatch = text.match(/面试岗位[：:]\s*([^\n]+)/);
  const roundMatch = text.match(/面试轮次[：:]\s*([^\n]+)/);
  const jdMatch = text.match(/岗位JD\s*\n([\s\S]*?)(?:\n职位要求|\n阿里风控|\n【智能总结】|$)/);
  const nextInput = { ...current, transcript: text };
  const jobType = jobTypeMatch?.[1]?.trim();

  if (jobType && jobTypes.includes(jobType as JobType)) {
    nextInput.jobType = jobType as JobType;
  }

  if (jobTitleMatch?.[1]?.trim()) {
    nextInput.jobTitle = jobTitleMatch[1].trim();
  }

  if (roundMatch?.[1]?.trim()) {
    nextInput.interviewRound = roundMatch[1].trim();
  }

  if (jdMatch?.[1]?.trim()) {
    nextInput.jobDescription = jdMatch[1].trim();
  }

  if (!nextInput.company && /阿里/.test(text)) {
    nextInput.company = "阿里";
  }

  return nextInput;
}

export default function Home() {
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [authView, setAuthView] = useState<AuthView>("password");
  const [input, setInput] = useState<ReviewInput>(emptyInput);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [history, setHistory] = useState<SavedReview[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStageIndex, setAnalysisStageIndex] = useState<number | null>(null);
  const [isExtractingDocx, setIsExtractingDocx] = useState(false);
  const [docxFileName, setDocxFileName] = useState("");
  const [message, setMessage] = useState("");
  const [analysisMode, setAnalysisMode] = useState<"demo" | "openai" | "compatible" | null>(
    null,
  );
  const authMode = isSupabaseConfigured ? "cloud" : "local";

  const loadCloudHistory = useCallback(async (email: string) => {
    if (!supabase) return;

    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("review_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        throw error;
      }

      setHistory((data || []).map((row) => reviewRowToSavedReview(row, email)));
    } catch (error) {
      setHistory([]);
      setMessage(error instanceof Error ? `读取云端历史失败：${error.message}` : "读取云端历史失败。");
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      const storedUser = window.localStorage.getItem(userKey);
      const storedHistory = window.localStorage.getItem(historyKey);

      queueMicrotask(() => {
        if (storedUser) {
          setUserEmail(storedUser);
          setEmailDraft(storedUser);
        }

        if (storedHistory) {
          try {
            setHistory(JSON.parse(storedHistory) as SavedReview[]);
          } catch {
            window.localStorage.removeItem(historyKey);
          }
        }

        setIsAuthLoading(false);
      });

      return;
    }

    let isMounted = true;

    async function applySession(session: Session | null) {
      if (!isMounted) return;

      const email = session?.user.email || "";
      setUserEmail(email);
      setEmailDraft(email);
      setUserId(session?.user.id || "");

      if (email) {
        await loadCloudHistory(email);
      } else {
        setHistory([]);
      }
    }

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        setMessage(`读取登录状态失败：${error.message}`);
      }

      await applySession(data.session);
      if (isMounted) setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void applySession(session);
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadCloudHistory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobTypeParam = params.get("jobType");
    const company = params.get("company") || "";
    const jobTitle = params.get("jobTitle") || "";
    const jobDescription = params.get("jobDescription") || "";
    const jobType = jobTypes.includes(jobTypeParam as JobType)
      ? (jobTypeParam as JobType)
      : undefined;

    if (!jobType && !company && !jobTitle && !jobDescription) return;

    queueMicrotask(() => {
      setInput((current) => ({
        ...current,
        jobType: jobType || current.jobType,
        company,
        jobTitle,
        jobDescription,
        transcript: "",
      }));
      setReport(null);
      setMessage("已带入岗位信息，请填写本轮轮次和文字稿。");
    });
  }, []);

  useEffect(() => {
    if (!isAnalyzing) return;

    const timer = window.setInterval(() => {
      setAnalysisStageIndex((current) =>
        current === null ? 0 : Math.min(current + 1, analysisStages.length - 1),
      );
    }, 35000);

    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const chartData = useMemo(() => {
    if (!report) return [];
    return [
      { dimension: "逻辑", score: report.dimensions.logic },
      { dimension: "内容", score: report.dimensions.content },
      { dimension: "表达", score: report.dimensions.expression },
      { dimension: "匹配", score: report.dimensions.jobFit },
    ];
  }, [report]);

  const questionScoreData = useMemo<QuestionScoreDatum[]>(() => {
    if (!report) return [];
    return report.questions.map((question, index) => ({
      name: `Q${index + 1}`,
      score: question.totalScore,
      questionId: question.id,
    }));
  }, [report]);

  const jobReviewGroups = useMemo(() => groupSavedReviews(history), [history]);

  function persistLocalHistory(nextHistory: SavedReview[]) {
    setHistory(nextHistory);
    window.localStorage.setItem(historyKey, JSON.stringify(nextHistory));
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = emailDraft.trim();
    const password = passwordDraft.trim();

    if (!email) {
      setMessage("请输入邮箱。");
      return;
    }

    if (!supabase) {
      setUserEmail(email);
      window.localStorage.setItem(userKey, email);
      setMessage("已进入本地体验账号。");
      return;
    }

    if (authView !== "magic" && authView !== "reset" && password.length < 6) {
      setMessage("密码至少需要 6 位。");
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authView === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setPasswordDraft("");
        setMessage("已登录。");
        return;
      }

      if (authView === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          throw error;
        }

        setPasswordDraft("");
        setMessage(
          data.session
            ? "注册成功，已登录。"
            : "注册成功。请先打开邮箱确认账号后再登录。",
        );
        return;
      }

      if (authView === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          throw error;
        }

        setMessage("密码设置邮件已发送，请打开邮箱继续。");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        throw error;
      }

      setMessage("登录链接已发送，请打开邮箱完成登录。");
    } catch (error) {
      const fallback =
        authView === "password"
          ? "登录失败"
          : authView === "signup"
            ? "注册失败"
            : authView === "reset"
              ? "发送密码设置邮件失败"
              : "发送登录链接失败";
      setMessage(authErrorMessage(error, fallback));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    if (supabase) {
      setIsAuthLoading(true);
      const { error } = await supabase.auth.signOut();

      if (error) {
        setMessage(`退出失败：${error.message}`);
        setIsAuthLoading(false);
        return;
      }
    }

    setUserEmail("");
    setUserId("");
    setEmailDraft("");
    setPasswordDraft("");
    setAuthView("password");
    setHistory([]);
    setReport(null);
    window.localStorage.removeItem(userKey);
    setMessage("已退出。");
    setIsAuthLoading(false);
  }

  async function getOrCreateCloudJob(inputToSave: ReviewInput) {
    if (!supabase || !userId) return null;

    const jobInsert = reviewInputToJobInsert(userId, inputToSave);
    const baseQuery = supabase
      .from("jobs")
      .select("*")
      .eq("user_id", userId)
      .eq("job_type", jobInsert.job_type)
      .eq("job_title", jobInsert.job_title)
      .limit(1);
    const { data: existingJob, error: findError } = jobInsert.company
      ? await baseQuery.eq("company", jobInsert.company).maybeSingle()
      : await baseQuery.is("company", null).maybeSingle();

    if (findError) {
      throw findError;
    }

    if (existingJob) {
      if (jobInsert.job_description && existingJob.job_description !== jobInsert.job_description) {
        const { error: updateError } = await supabase
          .from("jobs")
          .update({ job_description: jobInsert.job_description })
          .eq("id", existingJob.id);

        if (updateError) {
          throw updateError;
        }
      }

      return existingJob.id;
    }

    const { data: createdJob, error: createError } = await supabase
      .from("jobs")
      .insert(jobInsert)
      .select("*")
      .single();

    if (createError) {
      throw createError;
    }

    return createdJob.id;
  }

  async function saveReview(inputToSave: ReviewInput, reportToSave: ReviewReport) {
    if (!supabase || !userId) {
      const saved: SavedReview = {
        id: crypto.randomUUID(),
        jobId: localJobId(inputToSave),
        createdAt: new Date().toISOString(),
        userEmail,
        input: inputToSave,
        report: reportToSave,
      };
      persistLocalHistory([saved, ...history].slice(0, 30));
      return saved;
    }

    const jobId = await getOrCreateCloudJob(inputToSave);
    const { data, error } = await supabase
      .from("review_reports")
      .insert(reviewInputToInsert(userId, jobId, inputToSave, reportToSave))
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const saved = reviewRowToSavedReview(data, userEmail);
    setHistory([saved, ...history].slice(0, 30));
    return saved;
  }

  async function handleDocxUpload(file: File | null) {
    if (!file) return;

    setIsExtractingDocx(true);
    setDocxFileName(file.name);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-docx", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ExtractDocxResponse;

      if (!response.ok || !data.text) {
        throw new Error(data.error || "文档解析失败。");
      }

      setInput((current) => inferInputFromExtractedText(data.text || "", current));
      setMessage(
        `已从 ${data.filename || file.name} 提取 ${data.text.length} 字，可直接生成复盘。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文档解析失败。");
    } finally {
      setIsExtractingDocx(false);
    }
  }

  async function handleAnalyze() {
    if (isAuthLoading) {
      setMessage("正在读取登录状态，请稍后再试。");
      return;
    }

    if (!userEmail) {
      setMessage("请先登录。");
      return;
    }

    if (supabase && !userId) {
      setMessage("请先完成云端登录。");
      return;
    }

    if (input.transcript.trim().length < 40) {
      setMessage("文字稿内容太短，请粘贴更完整的面试记录。");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStageIndex(0);
    setMessage("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !data.report) {
        throw new Error(data.error || "分析失败。");
      }

      setReport(data.report);
      setAnalysisMode(data.mode || null);

      try {
        await saveReview(input, data.report);
        setMessage(
          data.mode === "demo"
            ? "已生成演示报告，已自动保存。"
            : authMode === "cloud"
              ? "已生成 AI 报告，已保存到云端。"
              : "已生成 AI 报告，已自动保存。",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `已生成报告，但保存失败：${error.message}`
            : "已生成报告，但保存失败。",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败。");
    } finally {
      setIsAnalyzing(false);
      setAnalysisStageIndex(null);
    }
  }

  async function deleteSaved(saved: SavedReview) {
    const shouldDelete = window.confirm(
      `确定删除「${saved.input.company || "未填公司"} · ${
        saved.input.interviewRound || "未填轮次"
      }」这份报告吗？删除后无法从应用内恢复。`,
    );

    if (!shouldDelete) return;

    if (supabase && userId) {
      const { error } = await supabase.from("review_reports").delete().eq("id", saved.id);

      if (error) {
        setMessage(`删除云端历史失败：${error.message}`);
        return;
      }
    }

    const nextHistory = history.filter((item) => item.id !== saved.id);
    if (supabase && userId) {
      setHistory(nextHistory);
    } else {
      persistLocalHistory(nextHistory);
    }
    setMessage("已删除历史报告。");
  }

  function scrollToQuestion(questionId: string) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
              <Sparkles className="h-4 w-4" />
              AI 面试复盘助手
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950 sm:text-3xl">
              文字稿复盘工作台
            </h1>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {analysisMode && (
              <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600">
                {analysisMode === "openai"
                  ? "OpenAI 分析"
                  : analysisMode === "compatible"
                    ? "兼容接口分析"
                    : "演示分析"}
              </div>
            )}
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            <form
              onSubmit={(event) => void handleAuthSubmit(event)}
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold">
                  {authMode === "cloud" ? "云端登录" : "本地体验登录"}
                </h2>
              </div>

              {userEmail ? (
                <div>
                  <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                      <User className="h-4 w-4 text-teal-700" />
                      <span className="min-w-0 truncate">{userEmail}</span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      历史报告会按当前账号保存和读取。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={isAuthLoading}
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAuthLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {authMode === "cloud" && (
                    <div className="grid grid-cols-2 gap-1 rounded-md bg-stone-100 p-1">
                      <button
                        type="button"
                        onClick={() => setAuthView("password")}
                        className={`h-8 rounded px-2 text-xs font-semibold transition ${
                          authView === "password"
                            ? "bg-white text-stone-950 shadow-sm"
                            : "text-stone-600 hover:text-stone-950"
                        }`}
                      >
                        密码登录
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthView("signup")}
                        className={`h-8 rounded px-2 text-xs font-semibold transition ${
                          authView === "signup"
                            ? "bg-white text-stone-950 shadow-sm"
                            : "text-stone-600 hover:text-stone-950"
                        }`}
                      >
                        注册账号
                      </button>
                    </div>
                  )}

                  <label className="grid gap-1 text-sm font-medium text-stone-700">
                    邮箱
                    <input
                      value={emailDraft}
                      onChange={(event) => setEmailDraft(event.target.value)}
                      disabled={isAuthLoading}
                      className="min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      placeholder="name@example.com"
                      type="email"
                    />
                  </label>

                  {authMode === "cloud" && authView !== "magic" && authView !== "reset" && (
                    <label className="grid gap-1 text-sm font-medium text-stone-700">
                      密码
                      <input
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        disabled={isAuthLoading}
                        className="min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                        placeholder="至少 6 位"
                        type="password"
                      />
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAuthLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : authView === "signup" ? (
                      <UserPlus className="h-4 w-4" />
                    ) : authView === "magic" ? (
                      <Mail className="h-4 w-4" />
                    ) : authView === "reset" ? (
                      <KeyRound className="h-4 w-4" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    {authMode !== "cloud"
                      ? "进入本地体验"
                      : authView === "signup"
                        ? "注册"
                        : authView === "magic"
                          ? "发送登录链接"
                          : authView === "reset"
                            ? "发送设置密码邮件"
                            : "登录"}
                  </button>

                  {authMode === "cloud" && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthView(authView === "reset" ? "password" : "reset");
                          setPasswordDraft("");
                        }}
                        className="font-semibold text-teal-700 transition hover:text-teal-900"
                      >
                        {authView === "reset" ? "返回密码登录" : "忘记密码 / 设置密码"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthView(authView === "magic" ? "password" : "magic");
                          setPasswordDraft("");
                        }}
                        className="font-semibold text-teal-700 transition hover:text-teal-900"
                      >
                        {authView === "magic" ? "返回密码登录" : "使用邮箱链接登录"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="mt-2 text-xs text-stone-500">
                {authMode === "cloud"
                  ? authView === "reset"
                    ? "Magic Link 老账号可用同一邮箱设置密码，历史报告仍会保留在原账号下。"
                    : "使用 Supabase Auth，历史会保存到云端；Magic Link 仍可作为备用登录方式。"
                  : "未配置 Supabase，历史只保存在当前浏览器。"}
              </p>
            </form>

            <section className="min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold">复盘输入</h2>
              </div>

              <div className="grid min-w-0 gap-3">
                <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                  岗位类型
                  <select
                    value={input.jobType}
                    onChange={(event) =>
                      setInput({ ...input, jobType: event.target.value as JobType })
                    }
                    className="w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  >
                    {jobTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                    公司
                    <input
                      value={input.company}
                      onChange={(event) => setInput({ ...input, company: event.target.value })}
                      className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                  </label>

                  <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                    面试轮次
                    <input
                      value={input.interviewRound}
                      onChange={(event) =>
                        setInput({ ...input, interviewRound: event.target.value })
                      }
                      className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                  </label>
                </div>

                <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                  岗位名称
                  <input
                    value={input.jobTitle}
                    onChange={(event) => setInput({ ...input, jobTitle: event.target.value })}
                    className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                </label>

                <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                  岗位 JD
                  <textarea
                    value={input.jobDescription}
                    onChange={(event) =>
                      setInput({ ...input, jobDescription: event.target.value })
                    }
                    className="min-h-24 w-full min-w-0 resize-y rounded-md border border-stone-300 px-3 py-2 text-sm leading-6 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                </label>

                <label className="grid min-w-0 gap-1 text-sm font-medium text-stone-700">
                  文字稿
                  <div className="min-w-0 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-3">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-stone-600">
                        <FileText className="h-4 w-4 shrink-0 text-teal-700" />
                        <span className="truncate">
                          {docxFileName || "上传 .docx 后会自动提取文字并填入下方"}
                        </span>
                      </div>
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100">
                        {isExtractingDocx ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {isExtractingDocx ? "提取中" : "上传 docx"}
                        <input
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          disabled={isExtractingDocx}
                          onChange={(event) => {
                            void handleDocxUpload(event.target.files?.[0] || null);
                            event.target.value = "";
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>
                  <textarea
                    value={input.transcript}
                    onChange={(event) => setInput({ ...input, transcript: event.target.value })}
                    className="min-h-48 w-full min-w-0 resize-y rounded-md border border-stone-300 px-3 py-2 text-sm leading-6 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    placeholder="粘贴面试文字稿"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isAuthLoading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isAnalyzing ? "分析中" : "生成复盘"}
                </button>
                {isAnalyzing && analysisStageIndex !== null && (
                  <AnalysisProgress activeIndex={analysisStageIndex} />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold">岗位与轮次</h2>
              </div>
              <div className="grid gap-2">
                {isHistoryLoading && (
                  <p className="rounded-md bg-stone-50 px-3 py-3 text-sm text-stone-500">
                    正在读取历史报告
                  </p>
                )}
                {!isHistoryLoading && jobReviewGroups.length === 0 && (
                  <p className="rounded-md bg-stone-50 px-3 py-3 text-sm text-stone-500">
                    暂无历史报告
                  </p>
                )}
                {jobReviewGroups.map((jobGroup) => (
                  <div
                    key={jobGroup.id}
                    className="rounded-md border border-stone-200 bg-stone-50"
                  >
                    <Link
                      href={`/jobs/${encodeURIComponent(jobGroup.id)}`}
                      className="block border-b border-stone-200 px-3 py-3 transition hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-stone-900">
                            {jobGroup.company || "未填公司"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">
                            {jobGroup.jobTitle || "未填岗位"}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${scoreTone(
                            jobGroup.averageScore,
                          )}`}
                        >
                          均分 {jobGroup.averageScore}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span className="rounded-md bg-white px-2 py-1">{jobGroup.jobType}</span>
                        <span>{jobGroup.reviews.length} 轮</span>
                        <span>最近 {dateLabel(jobGroup.latestAt)}</span>
                      </div>
                    </Link>
                    <div className="grid gap-1 p-2">
                      {jobGroup.reviews.map((saved) => (
                        <div
                          key={saved.id}
                          className="rounded-md border border-transparent bg-white transition hover:border-teal-300 hover:bg-teal-50"
                        >
                          <Link
                            href={`/reports/${saved.id}`}
                            className="block w-full px-3 py-2 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-stone-800">
                                {saved.input.interviewRound || "未填轮次"}
                              </span>
                              <span className="shrink-0 text-xs text-stone-500">
                                {dateLabel(saved.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-xs text-stone-500">
                              {saved.report.summary}
                            </p>
                          </Link>
                          <div className="flex items-center justify-between gap-2 px-3 pb-2">
                            <span
                              className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${scoreTone(
                                saved.report.overallScore,
                              )}`}
                            >
                              {saved.report.overallScore} / 100
                            </span>
                            <button
                              type="button"
                              onClick={() => void deleteSaved(saved)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition hover:bg-white hover:text-rose-700"
                              title="删除历史"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            {message && (
              <div className="mb-5 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
                {message}
              </div>
            )}

            {!report ? (
              <div className="flex min-h-[620px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/70 p-8 text-center">
                <div className="max-w-md">
                  <Activity className="mx-auto h-8 w-8 text-teal-700" />
                  <h2 className="mt-4 text-xl font-semibold text-stone-950">
                    {isAnalyzing ? "正在复盘" : "等待复盘"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {isAnalyzing && analysisStageIndex !== null
                      ? analysisStages[analysisStageIndex]
                      : "登录后粘贴文字稿，报告会出现在这里。"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-5">
                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
                        <Check className="h-4 w-4" />
                        {input.company || "目标公司"} · {input.interviewRound}
                      </div>
                      <h2 className="mt-2 text-2xl font-semibold text-stone-950">{input.jobTitle}</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                        {report.summary}
                      </p>
                    </div>
                    <div
                      className={`flex min-w-32 flex-col items-center rounded-lg border px-5 py-4 ${scoreTone(
                        report.overallScore,
                      )}`}
                    >
                      <span className="text-4xl font-semibold">{report.overallScore}</span>
                      <span className="text-sm font-medium">/ 100</span>
                    </div>
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-teal-700" />
                      <h3 className="text-base font-semibold">维度评分</h3>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={chartData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="dimension" tick={{ fill: "#57534e", fontSize: 12 }} />
                          <Radar
                            dataKey="score"
                            stroke="#0f766e"
                            fill="#0f766e"
                            fillOpacity={0.22}
                          />
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-teal-700" />
                      <h3 className="text-base font-semibold">逐题得分</h3>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={questionScoreData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: "#57534e", fontSize: 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: "#57534e", fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="score" fill="#c2410c" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {questionScoreData.map((item) => (
                        <button
                          key={item.questionId}
                          type="button"
                          onClick={() => scrollToQuestion(item.questionId)}
                          className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-2">
                  <ReportList title="优势" items={report.strengths} />
                  <ReportList title="不足" items={report.weaknesses} />
                  <ReportList title="风险点" items={report.risks} />
                  <ReportList title="优先改进" items={report.priorityActions} />
                </section>

                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">问题复盘</h3>
                  <div className="mt-4 grid gap-4">
                    {report.questions.map((question, index) => (
                      <article
                        key={question.id}
                        id={`question-${question.id}`}
                        className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-xs font-semibold text-teal-700">
                              Q{index + 1} · {question.questionType} · {question.difficulty}
                              {question.isKeyQuestion ? " · 关键问题" : ""}
                            </div>
                            <h4 className="mt-2 text-base font-semibold leading-6 text-stone-950">
                              {question.question}
                            </h4>
                          </div>
                          <span
                            className={`inline-flex w-fit rounded-md border px-3 py-1 text-sm font-semibold ${scoreTone(
                              question.totalScore,
                            )}`}
                          >
                            {question.totalScore}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-stone-600">
                          {question.answerSummary}
                        </p>
                        <div className="mt-4 grid gap-3">
                          <TextBlock title="问题点" items={question.issues} />
                          <BetterAnswerBlock
                            title="更好回答"
                            text={question.betterAnswer}
                            unsupportedClaims={question.unsupportedBetterAnswerClaims}
                          />
                          <PracticeAnswerBlock
                            text={getPracticeAnswer(question)}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">下一轮预测</h3>
                  <div className="mt-4 grid gap-4">
                    {report.predictions.map((prediction) => (
                      <article
                        key={prediction.question}
                        className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
                      >
                        <h4 className="text-base font-semibold text-stone-950">
                          {prediction.question}
                        </h4>
                        <div className="mt-3 grid gap-3 text-sm leading-6 text-stone-600 lg:grid-cols-2">
                          <p>
                            <span className="font-semibold text-stone-800">原因：</span>
                            {prediction.reason}
                          </p>
                          <p>
                            <span className="font-semibold text-stone-800">准备：</span>
                            {prediction.prepAdvice}
                          </p>
                        </div>
                        <div className="mt-3 rounded-md bg-white px-3 py-2 text-sm leading-6 text-stone-600">
                          <span className="font-semibold text-stone-800">框架：</span>
                          {prediction.answerFrame}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">反问面试官</h3>
                  <div className="mt-4 grid gap-3">
                    {getReverseQuestions(report).map((reverseQuestion) => (
                      <article
                        key={reverseQuestion.question}
                        className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4"
                      >
                        <h4 className="text-base font-semibold leading-6 text-stone-950">
                          {reverseQuestion.question}
                        </h4>
                        <div className="mt-3 grid gap-3 text-sm leading-6 text-stone-600 lg:grid-cols-2">
                          <p>
                            <span className="font-semibold text-stone-800">目的：</span>
                            {reverseQuestion.purpose}
                          </p>
                          <p>
                            <span className="font-semibold text-stone-800">时机：</span>
                            {reverseQuestion.timing}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => (
          <li key={item} className="rounded-md bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-600">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
        {analysisStages[activeIndex]}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {analysisStages.map((stage, index) => (
          <div
            key={stage}
            className={`h-1.5 rounded-full ${
              index <= activeIndex ? "bg-teal-700" : "bg-stone-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function TextBlock({
  title,
  items,
  className = "",
}: {
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <div className={className}>
      <h5 className="text-sm font-semibold text-stone-900">{title}</h5>
      <div className="mt-2 grid gap-2">
        {items.map((item) => (
          <p key={item} className="rounded-md bg-white px-3 py-2 text-sm leading-6 text-stone-600">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function PracticeAnswerBlock({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold text-stone-900">练习版</h5>
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 transition hover:border-teal-300 hover:text-teal-800"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {isExpanded ? "收起" : "展开全文"}
        </button>
      </div>
      <p
        className={`mt-2 rounded-md bg-white px-3 py-2 text-sm leading-7 text-stone-700 ${
          isExpanded ? "" : "line-clamp-2"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function BetterAnswerBlock({
  title,
  text,
  unsupportedClaims = [],
  className = "",
}: {
  title: string;
  text: string;
  unsupportedClaims?: string[];
  className?: string;
}) {
  const segments = getBetterAnswerSegments(text, unsupportedClaims);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-semibold text-stone-900">{title}</h5>
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          原回答素材
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          需补充/核对
        </span>
      </div>
      <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm leading-7">
        {segments.map((segment, index) => (
          <span
            key={`${segment.tone}-${index}-${segment.text}`}
            className={
              segment.tone === "needsInput"
                ? "font-medium text-rose-700"
                : "text-emerald-800"
            }
          >
            {segment.text}
          </span>
        ))}
      </p>
    </div>
  );
}
