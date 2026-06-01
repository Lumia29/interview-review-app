# AI 面试复盘助手

一个面向中文面试文字稿的 MVP 网页工具。第一版支持文字稿输入、`.docx` 上传提取、岗位类型选择、百分制评分、登录和历史保存；不做录音上传，也不记录面试结果。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

没有配置环境变量时，应用会进入本地体验模式：登录和历史保存在浏览器本地，分析接口返回演示报告，方便直接验证流程。配置 Supabase 后，登录会切到 Supabase Auth，历史报告会保存到云端。

## 环境变量

复制 `.env.example` 为 `.env.local` 后填写：

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.2
OPENAI_FAST_MODEL=
OPENAI_TIMEOUT_MS=120000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

如果使用第三方 OpenAI-compatible API，把第三方平台给你的接口地址填到
`OPENAI_BASE_URL`。已有 `OPENAI_API_BASE` 也会被读取。

如果要混合使用模型，`OPENAI_FAST_MODEL` 用于文字稿清洗、问答提取和证据校验，
`OPENAI_MODEL` 用于评分、改写和下一轮预测。当前 MVP 推荐先全部使用
`deepseek-v4-flash`，可读性更贴近面试复盘场景：

```bash
OPENAI_API_BASE=https://api.deepseek.com
OPENAI_FAST_MODEL=deepseek-v4-flash
OPENAI_MODEL=deepseek-v4-flash
```

如果后续希望提高分析深度，可以只把 `OPENAI_MODEL` 切到更高质量模型。

## Supabase

P1 已支持 Supabase Auth 和云端历史保存。未配置 Supabase 时仍会回退到本地体验模式。

配置步骤：

1. 在 Supabase 控制台创建项目。
2. 打开项目的 SQL Editor，执行 `supabase/schema.sql`。
3. 在 Project Settings -> API 复制 Project URL 和 anon public key。
4. 写入 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=你的 Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 anon public key
```

5. 在 Authentication -> URL Configuration 中，把本地开发地址加入允许列表：

```text
Site URL: http://localhost:3000
Redirect URLs: http://localhost:3000
```

生产部署后，把正式域名也加入 Site URL 和 Redirect URLs。

登录方式使用邮箱 magic link。输入邮箱后，Supabase 会发送登录链接；点击邮件里的链接回到应用后，历史报告会从 `review_reports` 读取，并按当前登录用户隔离。

## 文档

MVP PRD 与任务清单见 `docs/mvp-prd-and-tasks.md`。
