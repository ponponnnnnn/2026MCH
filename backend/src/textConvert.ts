import * as OpenCC from "opencc-js";

// 簡體轉繁體（台灣慣用字形）。一次建立轉換器重複使用，避免每次呼叫都重新初始化字典。
const converter = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * 把可能包含簡體字的文字轉成繁體中文。
 *
 * 用途：
 * 1. Gemini Live API 對長輩語音的即時轉錄（inputTranscription）有時會輸出簡體字形，
 *    這是轉錄模型本身的選字行為，System Prompt 管不到，只能用程式轉換兜底。
 * 2. Agent 生成的文字理論上已經被 Prompt 要求用繁體中文，但 LLM 輸出不保證 100%，
 *    這裡再轉一次確保萬無一失。
 * 3. 附帶效益：topic、category 這類被當作 Map key 使用的字串，統一轉繁體後，
 *    不會因為同一個詞有時輸出簡體、有時輸出繁體，而被誤判成兩個不同的 key。
 */
export function toTraditional(text: string | undefined | null): string {
  if (!text) return text ?? "";
  return converter(text);
}
