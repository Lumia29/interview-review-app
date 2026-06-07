import mammoth from "mammoth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maxDocumentSize = 8 * 1024 * 1024;
const supportedExtensions = [".docx", ".txt", ".md"] as const;

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getFileExtension(filename: string) {
  const normalized = filename.toLowerCase();
  return supportedExtensions.find((extension) => normalized.endsWith(extension));
}

async function extractTextFromFile(file: File) {
  const extension = getFileExtension(file.name);

  if (!extension) {
    throw new Error("当前只支持 .docx、.txt、.md 文件。");
  }

  if (extension === ".docx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      warnings: result.messages.map((message) => message.message),
    };
  }

  return {
    text: await file.text(),
    warnings: [],
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传一个 .docx、.txt 或 .md 文件。" }, { status: 400 });
  }

  if (file.size > maxDocumentSize) {
    return NextResponse.json(
      { error: "文件过大，请先压缩或拆分后再上传。" },
      { status: 400 },
    );
  }

  try {
    const result = await extractTextFromFile(file);
    const text = normalizeExtractedText(result.text);

    if (text.length < 40) {
      return NextResponse.json(
        { error: "没有从文档中提取到足够的文字内容。" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      filename: file.name,
      text,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "文档解析失败，请确认文件格式有效。";

    return NextResponse.json(
      { error: message },
      { status: message.startsWith("当前只支持") ? 400 : 500 },
    );
  }
}
