# AI 面试复盘助手

一个面向中文面试文字稿的 MVP 网页工具。第一版支持文字稿输入、`.docx` / `.txt` / `.md` 上传提取、岗位类型选择、百分制评分、登录和历史保存；不做录音上传，也不记录面试结果。

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

生产部署后，把正式域名也加入 Site URL 和 Redirect URLs。例如当前 Vercel 正式地址：

```text
Site URL: https://interview-review-3jbwocvzh-henry135235-gmailcoms-projects.vercel.app
Redirect URLs:
http://localhost:3000
http://localhost:3000/reset-password
https://interview-review-3jbwocvzh-henry135235-gmailcoms-projects.vercel.app
https://interview-review-3jbwocvzh-henry135235-gmailcoms-projects.vercel.app/reset-password
```

如果后续绑定自定义域名，也要把自定义域名加入 Redirect URLs，并把 Site URL 改成用户实际访问的主域名。

登录方式支持邮箱 + 密码登录，同时保留邮箱 magic link 作为备用入口。Magic Link 老用户可以使用“忘记密码”给同一个邮箱设置密码；点击邮件里的设置密码链接回到 `/reset-password` 后，输入新密码即可。登录后历史报告会从 `review_reports` 读取，并按当前登录用户隔离。

## Vercel 生产部署

项目推送到 `main` 后，Vercel 通常会自动重新部署。生产环境需要在 Vercel Project Settings -> Environment Variables 中配置以下变量，并至少勾选 Production：

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.2
OPENAI_FAST_MODEL=
OPENAI_TIMEOUT_MS=120000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

如果 OpenAI-compatible 服务使用 `OPENAI_API_BASE`，也可以配置该变量；代码会优先读取 `OPENAI_BASE_URL`，再读取 `OPENAI_API_BASE`。配置或修改生产环境变量后，需要重新部署一次生产环境，运行中的部署才会读取新值。

生产上线验收建议：

1. 打开 Vercel 正式网址，确认首页正常加载且没有进入本地体验模式。
2. 使用邮箱 + 密码登录，确认登录后页面显示当前邮箱；必要时再测试 magic link 备用登录。
3. 生成一份真实或测试文字稿复盘，确认报告出现在历史记录中。
4. 打开岗位详情页和报告详情页，确认云端数据可读取。
5. 在报告详情页测试复制 `.md`、下载 `.md`。
6. 在首页历史记录中删除一份测试报告，确认会先弹出删除确认，确认后历史记录消失。

如果正式网址返回 Vercel 的 `401 Unauthorized` 或访问保护页，先在 Vercel 项目里关闭 Deployment Protection，或使用已授权的团队账号访问；否则外部用户无法进入应用，也无法完成 Supabase 登录和密码设置回跳验收。

## 文档

MVP PRD 与任务清单见 `docs/mvp-prd-and-tasks.md`。
