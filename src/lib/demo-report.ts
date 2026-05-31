import type { ReviewInput, ReviewReport, ScoreDimensions } from "@/types/review";

export const emptyInput: ReviewInput = {
  jobType: "运营",
  company: "阿里",
  jobTitle: "集团安全部-大模型安全策略运营",
  interviewRound: "一面（业务面）",
  jobDescription:
    "紧跟海内外相关法律法规动态及 LLM 和智能体风险态势，构建风险矩阵，定义风险细则；构建护栏评测集，与算法深度合作，牵引护栏能力升级；支持业务提供安全解决方案。",
  transcript: "",
};

export function weightedScore(scores: ScoreDimensions) {
  return Math.round(
    scores.logic * 0.3 +
      scores.content * 0.35 +
      scores.expression * 0.15 +
      scores.jobFit * 0.2,
  );
}

export function createDemoReport(input: ReviewInput): ReviewReport {
  const dimensions = {
    logic: 78,
    content: 84,
    expression: 76,
    jobFit: 86,
  };

  return {
    overallScore: weightedScore(dimensions),
    dimensions,
    summary: `${input.jobTitle || "目标岗位"}这轮回答的业务相关性较强，能讲出风险分层、模型能力、抽样、人审兜底和 bad case 迭代等实际工作内容。主要可提升点是回答开头的结论感、指标解释的完整度，以及把个人贡献和业务结果讲得更可量化。`,
    strengths: [
      "经历与岗位匹配度高，能自然覆盖内容安全、模型运营、策略迭代和算法协作。",
      "能结合真实场景说明风险发现、误伤处理、优先级分层和工作流优化。",
      "对大模型应用的成本、上下文、缓存和前置召回有一定实践意识。",
    ],
    weaknesses: [
      "部分回答先铺细节再给结论，面试官需要自己归纳重点。",
      "指标解释有术语但缺少定义、基线和结果数字，可信度可以继续加强。",
      "追问到能力建设边界时，个人贡献和算法交付边界需要说得更清楚。",
    ],
    risks: [
      "如果下一轮继续深挖 SQL、评测集构建或模型安全方法论，需要补充更体系化的案例。",
      "回答里多次出现口语化停顿，正式面试表达可以更短句、更先结论。",
    ],
    priorityActions: [
      "为每个核心项目准备一版 60 秒 STAR 结构，先说目标、动作、结果。",
      "补齐关键指标定义：风险浓度、TVVR、HVVR、CBR，以及上线前后变化。",
      "准备一个与算法协作的完整案例，明确你如何提需、验收、调参、复盘。",
    ],
    questions: [
      {
        id: "q1",
        question: "你们整体场景里的监控指标是怎么设计的？",
        questionType: "数据指标",
        difficulty: "中",
        isKeyQuestion: true,
        answerSummary:
          "回答提到了抽样、风险浓度、大盘指标、TVVR/HVVR 和误伤指标 CBR，能说明风险与体验的平衡。",
        scores: { logic: 76, content: 84, expression: 75, jobFit: 88 },
        totalScore: weightedScore({
          logic: 76,
          content: 84,
          expression: 75,
          jobFit: 88,
        }),
        issues: [
          "指标名较多，但没有先解释每个指标的业务含义。",
          "缺少上线前后数字或目标水位，结果感不足。",
        ],
        improvement:
          "建议用“目标-指标体系-监控方式-结果”四段式回答，先把核心指标翻译成面试官容易理解的业务语言。",
        betterAnswer:
          "我会把指标分成三层：第一层是业务风险水位，例如抽样后的风险浓度；第二层是模型效果，包括准召和不同风险类型的命中情况；第三层是体验约束，例如误伤率 CBR。以某次策略为例，上线前我们先看 [请补充基线风险浓度]，上线后目标是降到 [请补充目标水位]，同时把误伤控制在 [请补充阈值] 以内。这样既能证明策略有效，也能避免只追求拦截而伤害广告主体验。",
        practiceAnswer:
          "我会把监控指标分成三层来讲。第一层是业务风险水位，比如抽样后的风险浓度；第二层是模型效果，主要看准召和不同风险类型的命中情况；第三层是体验约束，比如误伤率 CBR。具体到项目里，我会补充上线前的基线风险浓度、上线后的目标水位，以及误伤控制阈值。这样回答可以同时说明策略有效性和业务体验，而不是只强调拦截。",
        unsupportedBetterAnswerClaims: [],
      },
      {
        id: "q2",
        question: "线上漏防、新增风险和 bad case 是怎么发现的？",
        questionType: "风险发现",
        difficulty: "中",
        isKeyQuestion: true,
        answerSummary:
          "回答覆盖了看板抽样、人审/机审衡量风险浓度、外部反馈、政策节点和底线风险补防。",
        scores: { logic: 80, content: 86, expression: 77, jobFit: 89 },
        totalScore: weightedScore({
          logic: 80,
          content: 86,
          expression: 77,
          jobFit: 89,
        }),
        issues: [
          "风险发现链路讲得较完整，但可以更明确输入来源和处理闭环。",
          "315 等案例可以补充你本人负责的动作与产出。",
        ],
        improvement:
          "用“发现来源-判断标准-处置优先级-上线复盘”说明闭环，会更像策略运营负责人。",
        betterAnswer:
          "我们主要有三类来源：第一是线上抽样看板，覆盖命中与未命中的 case；第二是外部反馈，包括客服、协作方和重点节点巡检；第三是政策或舆情事件触发的专项排查。拿 [请补充具体风险类型] 来说，我会先判断它属于 P0/P1/P2 哪个等级，再和规则同学对齐细则，给算法提供代表性 case，最后通过风险浓度和误伤指标看上线效果。",
        practiceAnswer:
          "线上漏防和新增风险，我会从三个来源来发现。第一是线上抽样看板，覆盖命中和未命中的 case；第二是外部反馈和重点节点巡检；第三是政策或舆情事件触发的专项排查。发现后我会先判断风险优先级，比如属于 P0、P1 还是 P2，再和规则同学对齐细则，给算法提供代表性 case，最后通过风险浓度和误伤指标看上线效果。",
        unsupportedBetterAnswerClaims: [
          "客服、协作方和重点节点巡检需要用你的原文或项目素材再确认。",
        ],
      },
      {
        id: "q3",
        question: "Workflow 或 Agent 方案是怎么优化误伤问题的？",
        questionType: "大模型应用",
        difficulty: "高",
        isKeyQuestion: true,
        answerSummary:
          "回答讲到了商家与用户私信场景、身份区分、上下文合并、只关注最后一句、行业互免和缓存工作流。",
        scores: { logic: 79, content: 88, expression: 76, jobFit: 90 },
        totalScore: weightedScore({
          logic: 79,
          content: 88,
          expression: 76,
          jobFit: 90,
        }),
        issues: [
          "技术链路信息丰富，但可以先给一句核心结论。",
          "可以补充误伤下降、审核量、QPS 或成本变化等结果。",
        ],
        improvement:
          "先说这个方案解决了什么问题，再讲从并行判断到上下文判断的关键变化。",
        betterAnswer:
          "这个 workflow 的核心价值是解决私信场景里身份混淆导致的误伤。最初我们只看商家消息，后来发现用户先留联系方式、商家复述时会被误判。所以我把用户和商家的上下文一起送入模型，同时要求模型只判断当前送审的最后一句，并结合说话人身份判断主动性。之后又针对汽车型号、房产面积等高误伤行业补充识别规则。最终希望达到的效果是误伤下降 [请补充数据]，同时通过缓存工作流控制大模型调用成本。",
        practiceAnswer:
          "这个 workflow 主要解决的是私信场景里身份混淆带来的误伤。最开始如果只看商家消息，用户先留联系方式、商家复述时就容易被误判。后来我会把用户和商家的上下文一起送入模型，同时要求模型只判断当前送审的最后一句，并结合说话人身份判断主动性。之后再针对汽车型号、房产面积等高误伤行业补充识别规则。最后我会补充误伤下降和调用成本变化，让这个方案的效果更完整。",
        unsupportedBetterAnswerClaims: [],
      },
    ],
    predictions: [
      {
        question: "如果让你从零构建一个大模型安全护栏评测集，你会怎么设计？",
        reason: "岗位 JD 明确要求构建护栏评测集，而本轮更多聊的是线上策略与模型落地。",
        prepAdvice:
          "准备风险分类、样本来源、标注规范、评测指标、版本迭代和与算法协作的完整框架。",
        answerFrame:
          "风险矩阵 -> 样本构建 -> 标注与质检 -> 指标设计 -> 缺陷归因 -> 推动算法迭代。",
      },
      {
        question: "你如何判断一个风险应该用规则、传统模型还是大模型处理？",
        reason: "本轮提到了正则、关键词、小模型和大模型，下一轮可能深挖策略选型能力。",
        prepAdvice:
          "准备一张方法选择表：稳定风险用规则，高频低成本用小模型，复杂语义和上下文用大模型。",
        answerFrame:
          "风险复杂度 -> 成本与 QPS -> 准召要求 -> 可解释性 -> 迭代速度。",
      },
      {
        question: "你最近一次和算法协作时，如何定义需求和验收标准？",
        reason: "面试官已经追问过能力建设边界，说明会关注你是否能牵引算法产出。",
        prepAdvice:
          "准备一个你主导提需的案例，包含 bad case、特征需求、验收数据和上线结果。",
        answerFrame:
          "问题背景 -> 需求转译 -> case 包 -> 验收指标 -> 上线复盘。",
      },
    ],
    reverseQuestions: [
      {
        question: "如果我进入团队，前三个月最希望我优先解决哪类问题？",
        purpose: "判断岗位真实优先级，也能体现你关注落地和交付。",
        timing: "适合业务面或未来直属负责人面试结尾。",
      },
      {
        question: "团队现在在大模型安全护栏或评测集建设上，最大的难点是什么？",
        purpose: "把话题拉回 JD 核心能力，方便你补充相关经验。",
        timing: "适合面试官已经聊过岗位职责之后。",
      },
      {
        question: "这个岗位和算法、规则、业务团队的协作边界通常是怎样的？",
        purpose: "确认工作方式，也能展示你重视跨团队协作和责任边界。",
        timing: "适合对方介绍团队协作或追问你项目协作之后。",
      },
    ],
  };
}
