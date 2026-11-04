import nodemailer from "nodemailer";
import type { MailMessage } from "./mailer";

let transporter: nodemailer.Transporter | undefined;

export async function sendSmtpMail(message: MailMessage): Promise<void> {
  if (!process.env.SMTP_URL) throw new Error("SMTP_URL обязателен при MAIL_TRANSPORT=smtp");
  transporter ??= nodemailer.createTransport(process.env.SMTP_URL);
  await transporter.sendMail({
    from: process.env.MAIL_FROM ?? "Messengo <no-reply@messengo.ru>",
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
