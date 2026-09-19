import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface TranscriptLine {
  role: "elder" | "agent";
  text: string;
}

/**
 * 通話結束後用 Gemini Flash 產生 2-3 句繁中摘要，寫進 sessions/{id}.summary。
 * devNoDb 或逐字稿裡沒有長輩發言時回傳空字串；任何錯誤都 catch 後回傳空字串，不讓收尾流程中斷。
 */
export async function summarizeSession(elderName: string, transcript: TranscriptLine[]): Promise<string> {
  if (config.devNoDb) return "";
  if (!transcript.some((line) => line.role === "elder")) return "";

  try {
    const lines = transcript
      .map((line) => `${line.role === "elder" ? elderName : "小幫手"}：${line.text}`)
      .join("\n");
    const res = await ai.models.generateContent({
      model: config.reportModel,
      contents: `你是長照陪伴 AI 的通話摘要助手。根據以下與長輩「${elderName}」的通話逐字稿，用繁體中文寫 2-3 句摘要。
規則：只根據逐字稿內容，不要推測、不要下診斷；盡量點出下次通話可以接續的話題（例如長輩提到接下來要做的事）。

逐字稿：
${lines}`,
    });
    return (res.text ?? "").trim();
  } catch (err) {
    console.error("[summary] 產生摘要失敗", err);
    return "";
  }
}
