import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createDemoReport } from "@/lib/demo-report";
import { weightedScore } from "@/lib/demo-report";
import type { ReviewInput, ReviewReport } from "@/types/review";

const scoreSchema = z.object({
  logic: z.number().int().min(0).max(100),
  content: z.number().int().min(0).max(100),
  expression: z.number().int().min(0).max(100),
  jobFit: z.number().int().min(0).max(100),
});

const reportSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  dimensions: scoreSchema,
  summary: z.string(),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  priorityActions: z.array(z.string()).min(1),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        questionType: z.string(),
        difficulty: z.enum(["低", "中", "高"]),
        isKeyQuestion: z.boolean(),
        answerSummary: z.string(),
        scores: scoreSchema,
        totalScore: z.number().int().min(0).max(100),
        issues: z.array(z.string()),
        improvement: z.string(),
        betterAnswer: z.string(),
        practiceAnswer: z.string().optional(),
        unsupportedBetterAnswerClaims: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  predictions: z
    .array(
      z.object({
        question: z.string(),
        reason: z.string(),
        prepAdvice: z.string(),
        answerFrame: z.string(),
      }),
    )
    .min(1),
  reverseQuestions: z
    .array(
      z.object({
        question: z.string(),
        purpose: z.string(),
        timing: z.string(),
      }),
    )
    .optional(),
});

const inputSchema = z.object({
  jobType: z.enum(["运营", "产品经理", "数据分析", "研发", "设计", "市场", "其他"]),
  company: z.string(),
  jobTitle: z.string().min(1),
  interviewRound: z.string().min(1),
  jobDescription: z.string(),
  transcript: z.string().min(40),
});

const cleanedTranscriptSchema = z.object({
  cleanedTranscript: z.string().min(40),
  notes: z.array(z.string()).optional(),
});

const extractedQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
        evidenceQuote: z.string(),
        questionType: z.string(),
        difficulty: z.enum(["低", "中", "高"]),
        isKeyQuestion: z.boolean(),
      }),
    )
    .min(1),
});

const betterAnswerVerificationSchema = z.object({
  checks: z.array(
    z.object({
      id: z.string(),
      unsupportedClaims: z.array(z.string()),
    }),
  ),
});

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match?.[1]) {
    return match[1].trim();
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return trimmed;
}

function normalizeScores(report: ReviewReport): ReviewReport {
  const questions = report.questions.map((question, index) => ({
    ...question,
    id: question.id || `q${index + 1}`,
    totalScore: weightedScore(question.scores),
    issues:
      question.issues.length > 0
        ? question.issues
        : ["回答整体可保留，建议补充更明确的结构、结果或例证。"],
    practiceAnswer:
      question.practiceAnswer ||
      question.betterAnswer.replace(/\[[^\]]+\]/g, "这里补充真实素材"),
  }));

  return {
    ...report,
    overallScore: weightedScore(report.dimensions),
    questions,
  };
}

function sourceContainsClaim(sourceText: string, claim: string) {
  const normalize = (value: string) => value.replace(/\s+/g, "");
  return normalize(sourceText).includes(normalize(claim));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactUnsupportedNumericClaims(text: string, sourceText: string) {
  return text.replace(
    /\d+(?:\.\d+)?\s*(?:万元|QPS|%|个|条|小时|天|周|月|年|分|次|人|元|万|千|百|K|k)/g,
    (claim) => (sourceContainsClaim(sourceText, claim) ? claim : "[请补充具体数据]"),
  );
}

const unsupportedTermReplacements = [
  ["客服", "[请补充具体外部反馈渠道]"],
  ["合作方", "[请补充具体协作方]"],
  ["高层巡查", "[请补充具体巡检来源]"],
  ["BERT", "[请补充轻量模型方案]"],
  ["A/B测试", "[请补充评估方法]"],
  ["A/B 测试", "[请补充评估方法]"],
  ["AB测试", "[请补充评估方法]"],
  ["system prompt", "[请补充提示词策略]"],
  ["拒绝模板", "[请补充安全回复策略]"],
  ["SFT", "[请补充算法修复方式]"],
  ["RLHF", "[请补充算法修复方式]"],
  ["Hugging Face", "[请补充参考资料来源]"],
  ["红队", "[请补充对抗测试方法]"],
  ["模型微调", "[请补充算法修复方式]"],
] as const;

function redactUnsupportedTerms(text: string, sourceText: string) {
  return unsupportedTermReplacements.reduce((current, [term, replacement]) => {
    if (sourceContainsClaim(sourceText, term)) return current;
    return current.replace(new RegExp(escapeRegExp(term), "gi"), replacement);
  }, text);
}

function redactUnsupportedText(text: string, sourceText: string) {
  return redactUnsupportedTerms(redactUnsupportedNumericClaims(text, sourceText), sourceText);
}

function guardUnsupportedClaims(report: ReviewReport, input: ReviewInput): ReviewReport {
  const sourceText = `${input.jobDescription}\n${input.transcript}`;

  return {
    ...report,
    questions: report.questions.map((question) => ({
      ...question,
      betterAnswer: redactUnsupportedText(question.betterAnswer, sourceText),
      practiceAnswer: question.practiceAnswer
        ? redactUnsupportedText(question.practiceAnswer, sourceText)
        : undefined,
    })),
    predictions: report.predictions.map((prediction) => ({
      ...prediction,
      reason: redactUnsupportedText(prediction.reason, sourceText),
      prepAdvice: redactUnsupportedText(prediction.prepAdvice, sourceText),
      answerFrame: redactUnsupportedText(prediction.answerFrame, sourceText),
    })),
    reverseQuestions: report.reverseQuestions?.map((reverseQuestion) => ({
      ...reverseQuestion,
      question: redactUnsupportedText(reverseQuestion.question, sourceText),
      purpose: redactUnsupportedText(reverseQuestion.purpose, sourceText),
      timing: redactUnsupportedText(reverseQuestion.timing, sourceText),
    })),
  };
}

function getOpenAIBaseURL() {
  return process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || undefined;
}

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: getOpenAIBaseURL(),
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 120000),
  });
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-5.2";
}

function getFastModel() {
  return process.env.OPENAI_FAST_MODEL || process.env.OPENAI_MODEL_FAST || getModel();
}

async function createJsonWithModel<T>(
  client: OpenAI,
  model: string,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let outputText = "";

  if (getOpenAIBaseURL()) {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是严谨的中文面试复盘教练。你只输出可解析 JSON，不输出 Markdown。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });
    outputText = response.choices[0]?.message?.content || "";
  } else {
    const response = await client.responses.create({
      model,
      instructions:
        "你是严谨的中文面试复盘教练。你只输出可解析 JSON，不输出 Markdown。",
      input: prompt,
    });
    outputText = response.output_text;
  }

  return schema.parse(JSON.parse(extractJson(outputText)));
}

type ExtractedQuestions = z.infer<typeof extractedQuestionsSchema>;
type BetterAnswerVerification = z.infer<typeof betterAnswerVerificationSchema>;

function buildCleanTranscriptPrompt(input: ReviewInput) {
  return `
请清洗下面的中文面试文字稿。

要求：
1. 只做清洗、分段和轻度说话人整理，不要总结，不要改写事实。
2. 保留面试官问题、候选人回答、指标名、风险类型、项目动作和所有原始数字。
3. 不确定说话人时保留原说话人标签。
4. 只输出 JSON。

JSON 结构：
{
  "cleanedTranscript": "清洗后的完整文字稿",
  "notes": ["可选：清洗时发现的问题"]
}

原始文字稿：
${input.transcript.slice(0, 55000)}
`;
}

function buildExtractQuestionsPrompt(input: ReviewInput, cleanedTranscript: string) {
  return `
请从清洗后的中文面试文字稿中提取真正的面试官问题和候选人的对应回答。

岗位信息：
- 岗位类型：${input.jobType}
- 公司：${input.company || "未填写"}
- 岗位名称：${input.jobTitle}
- 面试轮次：${input.interviewRound}
- 岗位 JD：${input.jobDescription || "未填写"}

要求：
1. 不要只按问号切分，要识别真实追问和关键问题。
2. answer 必须只包含候选人实际回答，不要补充原文没有的信息。
3. evidenceQuote 复制一小段原文证据，证明这个问答来自文字稿。
4. 只提取 8-12 个高信号问题；优先选择影响面试判断的问题，合并重复追问。
5. 不要提取寒暄、流程介绍、设备调试、反问面试官、薪资地点闲聊，除非它直接影响岗位匹配判断。
6. 只输出 JSON。

JSON 结构：
{
  "questions": [
    {
      "id": "q1",
      "question": "面试官问题原文",
      "answer": "候选人对应回答",
      "evidenceQuote": "原文证据片段",
      "questionType": "项目经历/数据指标/业务理解/行为面试/反问等",
      "difficulty": "低",
      "isKeyQuestion": true
    }
  ]
}

清洗后的文字稿：
${cleanedTranscript.slice(0, 55000)}
`;
}

function buildReportPrompt(
  input: ReviewInput,
  cleanedTranscript: string,
  extractedQuestions: ExtractedQuestions["questions"],
) {
  return `
请基于已提取的问答和原始证据，生成一份结构化复盘报告。

岗位信息：
- 岗位类型：${input.jobType}
- 公司：${input.company || "未填写"}
- 岗位名称：${input.jobTitle}
- 面试轮次：${input.interviewRound}
- 岗位 JD：${input.jobDescription || "未填写"}

分析要求：
1. 你是资深面试教练，语气温和、具体、建设性。
2. 第一版只分析文字稿，不涉及录音上传，不记录面试结果。
3. 按岗位类型调整标准。运营岗位重点看目标拆解、用户/业务理解、策略设计、数据指标、复盘和跨团队推动。
4. 识别面试官真正的问题，不要只按问号切分。
5. 所有评分必须是 0-100 的整数。
6. 每题 totalScore 使用：逻辑 30% + 内容 35% + 表达 15% + 岗位匹配度 20%。
7. 更好回答范例必须基于候选人已经说过的信息；证据不足时使用 [请补充具体数据] 这类占位符，不要编造经历。
8. 严禁虚构原文没有出现的具体数字、指标变化、项目名、时间、事件节点、行业案例、人数、金额、上线结果或公司内部事实。
9. 如果原回答没有给出量化结果，更好回答里必须写 [请补充具体数据]、[请补充上线前后变化]、[请补充项目名称]，不能自行补一个示例数字。
10. 如果原文只提到指标缩写但没有定义，不要自行解释缩写含义，必须写 [请补充指标定义]。
11. 可以指出“建议补充某类数据”，但不能把建议当成已经发生的事实。
12. 更好回答范例不要用“去年、Q2、春节、双11、某项目、某平台、某电商”等原文没有出现的具体背景；需要举例时用 [请补充具体场景]。
13. 更好回答范例只能重组候选人原回答里已经出现的事实、动作和机制；不要新增原文没有的方案、工具、系统、特征、流程或实验方法。
14. 原文没有提到 A/B 测试、用户画像、编码器、政策日历、红队、客服渠道、投诉历史等机制时，不要把它们写入更好回答，只能写“可补充 [请补充具体机制]”。
15. 只输出 JSON，不要输出 Markdown，不要解释。
16. questions 只保留 8-12 个最值得复盘的核心问题，优先覆盖项目经历、指标体系、风险发现、模型/策略协作、岗位动机和能力短板。
17. 每题 issues 至少给 1 条具体可改进点；如果回答整体较好，也要指出下一轮可以补强的结构、证据或结果。
18. 除非原文明确说明候选人“主导/负责/搭建/上线/设计”某事项，否则更好回答不要使用这些强归因动词；可以改成“我参与了”或“我会补充说明我在其中的角色”。
19. 不要自行解释 TVVR、HVVR、CCR、CBR、ASR、OCR 等缩写的全称和计算方式；原文没定义时必须写 [请补充指标定义]。
20. predictions 的 reason、prepAdvice、answerFrame 也不能虚构事实、指标定义、产品名、修复手段或专业术语。需要举例时使用 [请补充...] 占位符。
21. 不要把 SFT、RLHF、红队、客服、BERT、A/B 测试、system prompt、拒绝模板等原文未出现内容写成候选人已会或已做；如果确实是准备建议，请写成“可提前了解 [请补充具体方法]”。
22. 每题额外生成 practiceAnswer，作为 45-90 秒中文口播稿。它应基于 betterAnswer 但去掉证据颜色说明，不要使用 Markdown，不要长篇解释；缺少素材时用自然口语提示“这里我会补充真实数据/具体案例”，不要编造。
23. 额外生成 reverseQuestions，给出 3-5 个面试结束时可以反问面试官的问题。问题要具体、专业、不过度冒犯，围绕岗位真实优先级、团队协作方式、成功标准、当前挑战、下一轮准备。不要问薪资福利、加班、HC 稳定性这类敏感或不适合第一轮结尾的问题。

JSON 结构必须完全符合：
{
  "overallScore": 78,
  "dimensions": { "logic": 75, "content": 82, "expression": 76, "jobFit": 80 },
  "summary": "一段总评",
  "strengths": ["优势1"],
  "weaknesses": ["不足1"],
  "risks": ["风险点1"],
  "priorityActions": ["优先行动1"],
  "questions": [
    {
      "id": "q1",
      "question": "面试官问题原文",
      "questionType": "项目经历/数据指标/业务理解/行为面试/反问等",
      "difficulty": "低",
      "isKeyQuestion": true,
      "answerSummary": "候选人回答摘要",
      "scores": { "logic": 75, "content": 82, "expression": 76, "jobFit": 80 },
      "totalScore": 78,
      "issues": ["原回答问题"],
      "improvement": "改进思路",
      "betterAnswer": "更好回答范例",
      "practiceAnswer": "45-90 秒口播练习稿"
    }
  ],
  "predictions": [
    {
      "question": "下一轮可能问题",
      "reason": "为什么会问",
      "prepAdvice": "准备建议",
      "answerFrame": "回答框架"
    }
  ],
  "reverseQuestions": [
    {
      "question": "适合反问面试官的问题",
      "purpose": "这个问题帮助候选人了解什么，或展示什么能力",
      "timing": "适合在哪类面试或什么上下文中问"
    }
  ]
}

已提取问答：
${JSON.stringify(extractedQuestions)}

清洗后的文字稿：
${cleanedTranscript.slice(0, 55000)}
`;
}

function buildVerifyBetterAnswersPrompt(
  input: ReviewInput,
  cleanedTranscript: string,
  report: ReviewReport,
) {
  const answers = report.questions.map((question) => ({
    id: question.id,
    question: question.question,
    betterAnswer: question.betterAnswer,
  }));

  return `
请校验“更好回答”中哪些句子没有原文证据支持。

证据来源只允许使用：
1. 岗位 JD
2. 清洗后的面试文字稿

校验规则：
1. 如果句子是在重组候选人已经说过的事实，可认为有证据。
2. 如果句子包含原文没有出现的数字、时间、项目名、渠道、工具、机制、系统、实验方法、上线结果或内部事实，标记为 unsupportedClaims。
3. 带有 [请补充...] 的句子不算 unsupportedClaims，因为它已经明确是待补充素材。
4. “建议补充某类素材”的句子不算 unsupportedClaims，除非它把建议说成已经发生的事实。
5. 每条 unsupportedClaims 必须复制更好回答里的原句或原句片段。
6. 只输出 JSON。

JSON 结构：
{
  "checks": [
    { "id": "q1", "unsupportedClaims": ["无原文证据的句子"] }
  ]
}

岗位 JD：
${input.jobDescription || "未填写"}

清洗后的文字稿：
${cleanedTranscript.slice(0, 55000)}

待校验的更好回答：
${JSON.stringify(answers)}
`;
}

function attachBetterAnswerVerification(
  report: ReviewReport,
  verification: BetterAnswerVerification,
): ReviewReport {
  const checksById = new Map(
    verification.checks.map((check) => [check.id, check.unsupportedClaims]),
  );

  return {
    ...report,
    questions: report.questions.map((question) => ({
      ...question,
      unsupportedBetterAnswerClaims: checksById.get(question.id) || [],
    })),
  };
}

async function createReportWithPipeline(client: OpenAI, input: ReviewInput) {
  const cleaned = await createJsonWithModel(
    client,
    getFastModel(),
    buildCleanTranscriptPrompt(input),
    cleanedTranscriptSchema,
  );
  const extracted = await createJsonWithModel(
    client,
    getFastModel(),
    buildExtractQuestionsPrompt(input, cleaned.cleanedTranscript),
    extractedQuestionsSchema,
  );
  const draftReport = await createJsonWithModel(
    client,
    getModel(),
    buildReportPrompt(input, cleaned.cleanedTranscript, extracted.questions),
    reportSchema,
  );
  const guardedReport = guardUnsupportedClaims(normalizeScores(draftReport), input);

  try {
    const verification = await createJsonWithModel(
      client,
      getFastModel(),
      buildVerifyBetterAnswersPrompt(input, cleaned.cleanedTranscript, guardedReport),
      betterAnswerVerificationSchema,
    );
    return attachBetterAnswerVerification(guardedReport, verification);
  } catch (error) {
    console.error("Better answer verification failed", error);
    return {
      ...guardedReport,
      questions: guardedReport.questions.map((question) => ({
        ...question,
        unsupportedBetterAnswerClaims: [
          "证据校验暂时失败，请人工核对这段更好回答是否包含原文没有的信息。",
        ],
      })),
    };
  }
}

export async function POST(request: Request) {
  const raw = await request.json();
  const parsed = inputSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "请至少填写岗位名称、面试轮次，并粘贴一段完整文字稿。" },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      report: createDemoReport(input),
      mode: "demo",
    });
  }

  try {
    const client = getOpenAIClient();
    const report = await createReportWithPipeline(client, input);

    return NextResponse.json({
      report,
      mode: getOpenAIBaseURL() ? "compatible" : "openai",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          "AI 分析暂时失败。你可以稍后重试；本地未配置或模型返回格式异常时，可先使用演示模式验证页面。",
      },
      { status: 502 },
    );
  }
}
