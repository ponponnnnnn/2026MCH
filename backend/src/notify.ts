import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";
import { elderRef } from "./firestore.js";

let transporter: Transporter | undefined;

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
  });
  return transporter;
}

/** 收件人：長輩文件的 familyContacts[].email，沒有就用環境變數 FAMILY_EMAILS */
async function resolveRecipients(elderId: string): Promise<string[]> {
  const contacts = ((await elderRef(elderId).get()).data()?.familyContacts ?? []) as { email?: string }[];
  const fromDb = contacts.map((c) => c.email).filter((e): e is string => !!e);
  return fromDb.length ? fromDb : config.familyEmails;
}

/** 以 Gmail 寄信給家屬。未設定 Gmail 或沒有收件人時只印 log，方便本機開發。 */
export async function notifyFamily(elderId: string, subject: string, text: string): Promise<boolean> {
  try {
    const to = await resolveRecipients(elderId);
    if (!config.gmailUser || !config.gmailAppPassword || to.length === 0) {
      console.log(`[notify:dry-run] to=${to.join(",") || "(無收件人)"}\n主旨：${subject}\n${text}`);
      return false;
    }
    await getTransporter().sendMail({
      from: `"長照小幫手" <${config.gmailUser}>`,
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("[notify] 寄信失敗", err);
    return false;
  }
}
