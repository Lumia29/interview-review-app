"use client";

import { Activity, BarChart3, Check, ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
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
import { useMemo, useState } from "react";
import { downloadMarkdown, reportToMarkdown, scoreTone } from "@/lib/review-utils";
import type { ReviewReport, SavedReview } from "@/types/review";

type ReportDetailProps = {
  saved: SavedReview;
  showExport?: boolean;
};

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

function getReverseQuestions(report: ReviewReport) {
  if (report.reverseQuestions?.length) return report.reverseQuestions;

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

export function ReportDetail({ saved, showExport = true }: ReportDetailProps) {
  const { input, report } = saved;
  const [exportMessage, setExportMessage] = useState("");
  const chartData = useMemo(
    () => [
      { dimension: "逻辑", score: report.dimensions.logic },
      { dimension: "内容", score: report.dimensions.content },
      { dimension: "表达", score: report.dimensions.expression },
      { dimension: "匹配", score: report.dimensions.jobFit },
    ],
    [report],
  );
  const questionScoreData = useMemo(
    () =>
      report.questions.map((question, index) => ({
        name: `Q${index + 1}`,
        score: question.totalScore,
        questionId: question.id,
      })),
    [report],
  );

  function scrollToQuestion(questionId: string) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(reportToMarkdown(saved));
      setExportMessage("Markdown 已复制。");
    } catch {
      setExportMessage("复制失败，请改用下载 Markdown。");
    }
  }

  function handleDownloadMarkdown() {
    downloadMarkdown(saved);
    setExportMessage("Markdown 文件已开始下载。");
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
              <Check className="h-4 w-4" />
              {input.company || "目标公司"} · {input.interviewRound}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{input.jobTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">{report.summary}</p>
            {showExport && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyMarkdown()}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                >
                  <Copy className="h-4 w-4" />
                  复制 Markdown
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                >
                  <Download className="h-4 w-4" />
                  下载 .md
                </button>
                {exportMessage && <span className="text-xs text-stone-500">{exportMessage}</span>}
              </div>
            )}
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
                <Radar dataKey="score" stroke="#0f766e" fill="#0f766e" fillOpacity={0.22} />
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
              <p className="mt-3 text-sm leading-6 text-stone-600">{question.answerSummary}</p>
              <div className="mt-4 grid gap-3">
                <TextBlock title="问题点" items={question.issues} />
                <BetterAnswerBlock
                  title="更好回答"
                  text={question.betterAnswer}
                  unsupportedClaims={question.unsupportedBetterAnswerClaims}
                />
                <PracticeAnswerBlock text={getPracticeAnswer(question)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold">下一轮预测</h3>
        <div className="mt-4 grid gap-4">
          {report.predictions.map((prediction) => (
            <article key={prediction.question} className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4">
              <h4 className="text-base font-semibold text-stone-950">{prediction.question}</h4>
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
            <article key={reverseQuestion.question} className="rounded-lg border border-stone-200 bg-[#fbfaf7] p-4">
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
              segment.tone === "needsInput" ? "font-medium text-rose-700" : "text-emerald-800"
            }
          >
            {segment.text}
          </span>
        ))}
      </p>
    </div>
  );
}
