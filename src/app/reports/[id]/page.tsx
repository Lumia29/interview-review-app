"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ReportDetail } from "@/components/report-detail";
import { historyKey } from "@/lib/review-utils";
import { isSupabaseConfigured, reviewRowToSavedReview, supabase } from "@/lib/supabase";
import type { SavedReview } from "@/types/review";

export default function ReportPage() {
  const params = useParams();
  const reportId = String(params.id || "");
  const [saved, setSaved] = useState<SavedReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      setIsLoading(true);
      setMessage("");

      if (!isSupabaseConfigured || !supabase) {
        try {
          const localHistory = JSON.parse(
            window.localStorage.getItem(historyKey) || "[]",
          ) as SavedReview[];
          const localReport = localHistory.find((item) => item.id === reportId) || null;

          if (!isMounted) return;
          setSaved(localReport);
          setMessage(localReport ? "" : "没有找到这份本地报告。");
        } catch {
          if (!isMounted) return;
          setMessage("读取本地报告失败。");
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
          setMessage("请先登录后查看报告。");
          setSaved(null);
          return;
        }

        const { data, error } = await supabase
          .from("review_reports")
          .select("*")
          .eq("id", reportId)
          .single();

        if (error) throw error;
        if (!isMounted) return;
        setSaved(reviewRowToSavedReview(data, email));
      } catch (error) {
        if (!isMounted) return;
        setMessage(error instanceof Error ? `读取报告失败：${error.message}` : "读取报告失败。");
        setSaved(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadReport();

    return () => {
      isMounted = false;
    };
  }, [reportId]);

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href={saved?.jobId ? `/jobs/${encodeURIComponent(saved.jobId)}` : "/"}
              className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 transition hover:text-teal-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {saved?.jobId ? "返回岗位" : "返回工作台"}
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
              报告详情
            </h1>
          </div>
          {saved && (
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              新建复盘
            </Link>
          )}
        </div>

        {isLoading && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-600 shadow-sm">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-teal-700" />
            正在读取报告
          </div>
        )}

        {!isLoading && message && (
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
            {message}
          </div>
        )}

        {!isLoading && saved && <ReportDetail saved={saved} />}
      </div>
    </main>
  );
}
