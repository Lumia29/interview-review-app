import type { JobType, ReviewInput, SavedReview } from "@/types/review";

export const historyKey = "interview-review-history";
export const userKey = "interview-review-user";

export type JobReviewGroup = {
  id: string;
  jobType: JobType;
  company: string;
  jobTitle: string;
  jobDescription: string;
  latestAt: string;
  averageScore: number;
  reviews: SavedReview[];
};

export function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 75) return "text-sky-700 bg-sky-50 border-sky-200";
  if (score >= 65) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function fullDateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function localJobId(input: ReviewInput) {
  return [
    "local",
    input.jobType,
    input.company.trim() || "未填公司",
    input.jobTitle.trim() || "未填岗位",
  ].join("::");
}

export function groupSavedReviews(reviews: SavedReview[]): JobReviewGroup[] {
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

function listMarkdown(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function reportToMarkdown(saved: SavedReview) {
  const { input, report } = saved;
  const lines = [
    `# ${input.company || "目标公司"} ${input.jobTitle} 面试复盘`,
    "",
    `- 岗位类型：${input.jobType}`,
    `- 公司：${input.company || "未填写"}`,
    `- 岗位名称：${input.jobTitle}`,
    `- 面试轮次：${input.interviewRound}`,
    `- 生成时间：${fullDateLabel(saved.createdAt)}`,
    `- 综合分：${report.overallScore} / 100`,
    "",
    "## 总评",
    "",
    report.summary,
    "",
    "## 维度评分",
    "",
    `- 逻辑：${report.dimensions.logic}`,
    `- 内容：${report.dimensions.content}`,
    `- 表达：${report.dimensions.expression}`,
    `- 岗位匹配：${report.dimensions.jobFit}`,
    "",
    "## 优势",
    "",
    listMarkdown(report.strengths),
    "",
    "## 不足",
    "",
    listMarkdown(report.weaknesses),
    "",
    "## 风险点",
    "",
    listMarkdown(report.risks),
    "",
    "## 优先改进",
    "",
    listMarkdown(report.priorityActions),
    "",
    "## 问题复盘",
    "",
    ...report.questions.flatMap((question, index) => [
      `### Q${index + 1}. ${question.question}`,
      "",
      `- 类型：${question.questionType}`,
      `- 难度：${question.difficulty}`,
      `- 关键问题：${question.isKeyQuestion ? "是" : "否"}`,
      `- 得分：${question.totalScore} / 100`,
      "",
      "回答摘要：",
      question.answerSummary,
      "",
      "问题点：",
      listMarkdown(question.issues),
      "",
      "改进建议：",
      question.improvement,
      "",
      "更好回答：",
      question.betterAnswer,
      "",
      "练习版：",
      question.practiceAnswer || question.betterAnswer.replace(/\[[^\]]+\]/g, "这里补充真实素材"),
      "",
    ]),
    "## 下一轮预测",
    "",
    ...report.predictions.flatMap((prediction, index) => [
      `### ${index + 1}. ${prediction.question}`,
      "",
      `- 为什么会问：${prediction.reason}`,
      `- 准备建议：${prediction.prepAdvice}`,
      `- 回答框架：${prediction.answerFrame}`,
      "",
    ]),
  ];

  if (report.reverseQuestions?.length) {
    lines.push(
      "## 反问面试官",
      "",
      ...report.reverseQuestions.flatMap((question, index) => [
        `### ${index + 1}. ${question.question}`,
        "",
        `- 目的：${question.purpose}`,
        `- 时机：${question.timing}`,
        "",
      ]),
    );
  }

  return lines.join("\n");
}

export function downloadMarkdown(saved: SavedReview) {
  const blob = new Blob([reportToMarkdown(saved)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = [
    saved.input.company || "目标公司",
    saved.input.jobTitle || "面试复盘",
    saved.input.interviewRound || "报告",
  ]
    .join("-")
    .replace(/[\\/:*?"<>|]/g, "-");

  link.href = url;
  link.download = `${filename}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
