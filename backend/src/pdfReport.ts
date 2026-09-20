import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

// 跟長輩端 index.html、家屬儀表板一致的 Google 品牌色
const COLOR = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC05",
  green: "#34A853",
  ink: "#202124",
  inkSoft: "#5F6368",
  paper: "#FAFBFC",
} as const;

const OVERALL_STYLE = {
  normal: { bg: "#E6F4EA", text: "#1E7E37", border: COLOR.green, label: "正常" },
  watch: { bg: "#FEF7E0", text: "#B88400", border: COLOR.yellow, label: "需留意" },
  alert: { bg: "#FCE8E6", text: "#B0281E", border: COLOR.red, label: "需立即關心" },
} as const;

const FONT_REGULAR = fileURLToPath(new URL("../fonts/NotoSansTC-Regular.ttf", import.meta.url));
const FONT_BOLD = fileURLToPath(new URL("../fonts/NotoSansTC-Bold.ttf", import.meta.url));

interface ReportPdfInput {
  elderName: string;
  dateStr: string;
  overall: "normal" | "watch" | "alert";
  medication: string;
  sleep: string;
  mood: string;
  meals: string;
  pain: string;
  events: string[];
  summary: string;
  followUps: string[];
  sessionCount: number;
  minutes: number;
}

/** 產生跟 Email／長輩端一致風格的每日報告 PDF，回傳 Buffer 供直接當附件寄出，不落地寫檔。 */
export function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.registerFont("NotoTC", FONT_REGULAR);
    doc.registerFont("NotoTC-Bold", FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const style = OVERALL_STYLE[input.overall];
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // 品牌四色圓點（跟長輩端、家屬儀表板同一個標記）
    const dotColors = [COLOR.blue, COLOR.red, COLOR.yellow, COLOR.green];
    let dotX = 50;
    for (const c of dotColors) {
      doc.circle(dotX + 4, 58, 4).fill(c);
      dotX += 14;
    }
    doc.font("NotoTC").fontSize(10).fillColor(COLOR.inkSoft).text("安心快報・今日狀況報告", 50, 70);

    // 長輩姓名 + 狀態徽章
    doc.font("NotoTC-Bold").fontSize(24).fillColor(COLOR.ink).text(input.elderName, 50, 92);
    const nameWidth = doc.widthOfString(input.elderName);
    const badgeX = 50 + nameWidth + 14;
    const badgeText = style.label;
    doc.font("NotoTC").fontSize(12);
    const badgeTextWidth = doc.widthOfString(badgeText);
    doc.roundedRect(badgeX, 96, badgeTextWidth + 24, 24, 12).fillAndStroke(style.bg, style.border);
    doc.fillColor(style.text).text(badgeText, badgeX + 12, 102);

    doc
      .font("NotoTC")
      .fontSize(10)
      .fillColor(COLOR.inkSoft)
      .text(`${input.dateStr}｜共互動 ${input.sessionCount} 次、約 ${input.minutes} 分鐘`, 50, 128);

    // 分隔線
    doc.moveTo(50, 154).lineTo(50 + pageWidth, 154).strokeColor("#EEF1F5").lineWidth(1).stroke();

    // 健康項目
    let y = 170;
    const metrics: [string, string][] = [
      ["用藥", input.medication],
      ["睡眠", input.sleep],
      ["心情", input.mood],
      ["飲食", input.meals],
      ["不適", input.pain],
    ];
    for (const [label, value] of metrics) {
      doc.font("NotoTC-Bold").fontSize(11).fillColor(COLOR.inkSoft).text(label, 50, y, { width: 70 });
      doc.font("NotoTC").fontSize(12).fillColor(COLOR.ink).text(value, 130, y, { width: pageWidth - 80 });
      y += 26;
    }

    // 異常事件（紅色提示框）
    if (input.events.length > 0) {
      y += 8;
      const text = "⚠ " + input.events.join("；");
      const boxHeight = doc.heightOfString(text, { width: pageWidth - 40 }) + 24;
      doc.rect(50, y, pageWidth, boxHeight).fill(OVERALL_STYLE.alert.bg);
      doc.rect(50, y, 4, boxHeight).fill(COLOR.red);
      doc.font("NotoTC").fontSize(11).fillColor(OVERALL_STYLE.alert.text).text(text, 66, y + 12, { width: pageWidth - 40 });
      y += boxHeight + 16;
    } else {
      y += 16;
    }

    // 摘要
    if (input.summary) {
      doc.font("NotoTC-Bold").fontSize(12).fillColor(COLOR.ink).text("今日摘要", 50, y);
      y += 20;
      doc.font("NotoTC").fontSize(12).fillColor(COLOR.ink).text(input.summary, 50, y, { width: pageWidth, lineGap: 4 });
      y += doc.heightOfString(input.summary, { width: pageWidth, lineGap: 4 }) + 20;
    }

    // 建議關心（綠色提示框）
    if (input.followUps.length > 0) {
      const text = "建議關心：" + input.followUps.join("；");
      const boxHeight = doc.heightOfString(text, { width: pageWidth - 40 }) + 24;
      doc.rect(50, y, pageWidth, boxHeight).fill(OVERALL_STYLE.normal.bg);
      doc.rect(50, y, 4, boxHeight).fill(COLOR.green);
      doc.font("NotoTC").fontSize(11).fillColor(OVERALL_STYLE.normal.text).text(text, 66, y + 12, { width: pageWidth - 40 });
      y += boxHeight + 24;
    } else {
      y += 8;
    }

    // 頁尾免責聲明
    doc
      .font("NotoTC")
      .fontSize(9)
      .fillColor("#B4B2A9")
      .text("此報告由 AI 根據當日對話自動彙整，僅供參考，非醫療診斷。", 50, Math.max(y, 700), {
        width: pageWidth,
        align: "center",
      });

    doc.end();
  });
}
