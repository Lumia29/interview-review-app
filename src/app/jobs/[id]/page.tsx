"use client";

import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateLabel, fullDateLabel, groupSavedReviews, historyKey, scoreTone } from "@/lib/review-utils";
import {
  isSupabaseConfigured,
  jobRowToSavedJob,
  reviewRowToSavedReview,
  supabase,
} from "@/lib/supabase";
import type { SavedJob, SavedReview } from "@/types/review";

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function newReviewHref(job: SavedJob) {
  const params = new URLSearchParams({
    jobType: job.jobType,
    company: job.company,
    jobTitle: job.jobTitle,
    jobDescription: job.jobDescription,
  });

  return `/?${params.toString()}`;
}

export default function JobPage() {
  const params = useParams();
  const rawJobId = String(params.id || "");
  const jobId = safeDecodeURIComponent(rawJobId);
  const [job, setJob] = useState<SavedJob | null>(null);
  const [reviews, setReviews] = useState<SavedReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadJob() {
      setIsLoading(true);
      setMessage("");

      if (!isSupabaseConfigured || !supabase || jobId.startsWith("local::")) {
        try {
          const localHistory = JSON.parse(
            window.localStorage.getItem(historyKey) || "[]",
          ) as SavedReview[];
          const group = groupSavedReviews(localHistory).find((item) => item.id === jobId) || null;

          if (!isMounted) return;
          if (!group) {
            setMessage("没有找到这个本地岗位。");
            setJob(null);
            setReviews([]);
            return;
          }

          setJob({
            id: group.id,
            createdAt: group.reviews.at(-1)?.createdAt || group.latestAt,
            updatedAt: group.latestAt,
            jobType: group.jobType,
            company: group.company,
            jobTitle: group.jobTitle,
            jobDescription: group.jobDescription,
          });
          setReviews(group.reviews);
        } catch {
          if (!isMounted) return;
          setMessage("读取本地岗位失败。");
        } finally {
          if (isMounted) setIsLoading(false);
        }
        return;
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const email = sessionData.session?.user.email || "";
        if (!email) {
          if (!isMounted) return;
          setMessage("请先登录后查看岗位。");
          setJob(null);
          setReviews([]);
          return;
        }

        const [{ data: jobData, error: jobError }, { data: reportData, error: reportError }] =
          await Promise.all([
            supabase.from("jobs").select("*").eq("id", jobId).single(),
            supabase
              .from("review_reports")
              .select("*")
              .eq("job_id", jobId)
              .order("created_at", { ascending: false }),
          ]);

        if (jobError) throw jobError;
        if (reportError) throw reportError;
        if (!isMounted) return;

        setJob(jobRowToSavedJob(jobData));
        setReviews((reportData || []).map((row) => reviewRowToSavedReview(row, email)));
      } catch (error) {
        if (!isMounted) return;
        setMessage(error instanceof Error ? `读取岗位失败：${error.message}` : "读取岗位失败。");
        setJob(null);
        setReviews([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadJob();

    return () => {
      isMounted = false;
    };
  }, [jobId]);

  const sortedReviews = useMemo(
    () => [...reviews].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [reviews],
  );
  const trendData = useMemo(
    () =>
      sortedReviews.map((review, index) => ({
        name: `第${index + 1}轮`,
        score: review.report.overallScore,
        logic: review.report.dimensions.logic,
        content: review.report.dimensions.content,
        expression: review.report.dimensions.expression,
        jobFit: review.report.dimensions.jobFit,
      })),
    [sortedReviews],
  );
  const averageScore = reviews.length
    ? Math.round(reviews.reduce((sum, review) => sum + review.report.overallScore, 0) / reviews.length)
    : 0;

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 border-b border-stone-200 pb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 transition hover:text-teal-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            岗位详情
          </h1>
        </div>

        {isLoading && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-600 shadow-sm">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-teal-700" />
            正在读取岗位
          </div>
        )}

        {!isLoading && message && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
            {message}
          </div>
        )}

        {!isLoading && job && (
          <div className="grid gap-5">
            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-teal-700">
                    {job.company || "未填公司"} · {job.jobType}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">{job.jobTitle}</h2>
                  {job.jobDescription && (
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                      {job.jobDescription}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={newReviewHref(job)}
                      className="inline-flex h-9 items-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                    >
                      新建同岗位复盘
                    </Link>
                    {reviews[0] && (
                      <Link
                        href={`/reports/${reviews[0].id}`}
                        className="inline-flex h-9 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                      >
                        查看最新报告
                      </Link>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="轮次" value={`${reviews.length}`} />
                  <Metric label="均分" value={averageScore ? `${averageScore}` : "-"} />
                  <Metric label="最近" value={reviews[0] ? dateLabel(reviews[0].createdAt) : "-"} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">多轮趋势</h3>
              {trendData.length === 0 ? (
                <p className="mt-3 rounded-md bg-stone-50 px-3 py-3 text-sm text-stone-500">
                  暂无报告，生成复盘后会显示趋势。
                </p>
              ) : (
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#57534e", fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#57534e", fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" name="综合分" stroke="#0f766e" strokeWidth={2} />
                      <Line type="monotone" dataKey="logic" name="逻辑" stroke="#2563eb" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="content" name="内容" stroke="#c2410c" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="expression" name="表达" stroke="#7c3aed" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="jobFit" name="匹配" stroke="#16a34a" strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">轮次报告</h3>
              <div className="mt-4 grid gap-3">
                {reviews.length === 0 && (
                  <p className="rounded-md bg-stone-50 px-3 py-3 text-sm text-stone-500">
                    暂无报告
                  </p>
                )}
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-teal-700">
                          <FileText className="h-3.5 w-3.5" />
                          {review.input.interviewRound || "未填轮次"} · {fullDateLabel(review.createdAt)}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">
                          {review.report.summary}
                        </p>
                      </div>
                      <span
                        className={`inline-flex w-fit rounded-md border px-3 py-1 text-sm font-semibold ${scoreTone(
                          review.report.overallScore,
                        )}`}
                      >
                        {review.report.overallScore} / 100
                      </span>
                    </div>
                    <Link
                      href={`/reports/${review.id}`}
                      className="mt-3 inline-flex h-9 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                    >
                      查看报告详情
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-center">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-stone-950">{value}</div>
    </div>
  );
}
