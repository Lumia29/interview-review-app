import mammoth from "mammoth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maxDocxSize = 8 * 1024 * 1024;

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传一个 .docx 文件。" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "当前只支持 .docx 文件。" }, { status: 400 });
  }

  if (file.size > maxDocxSize) {
    return NextResponse.json(
      { error: "文件过大，请先压缩或拆分后再上传。" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeExtractedText(result.value);

    if (text.length < 40) {
      return NextResponse.json(
        { error: "没有从文档中提取到足够的文字内容。" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      filename: file.name,
      text,
      warnings: result.messages.map((message) => message.message),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "文档解析失败，请确认文件是有效的 .docx。" },
      { status: 500 },
    );
  }
}
