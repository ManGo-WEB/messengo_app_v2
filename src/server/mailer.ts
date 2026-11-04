// Отправка почты. Транспорт выбирается переменной MAIL_TRANSPORT:
//   console — dev по умолчанию: письмо печатается в лог сервера;
//   smtp    — реальная отправка (SMTP_URL, MAIL_FROM), прод;
// в тестах (NODE_ENV=test) письма складываются в mailboxForTests.
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export const mailboxForTests: MailMessage[] = [];

export async function sendMail(message: MailMessage): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    mailboxForTests.push(message);
    return;
  }
  const transport = process.env.MAIL_TRANSPORT ?? "console";
  if (transport === "console") {
    console.log(`[mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }
  if (transport === "smtp") {
    const { sendSmtpMail } = await import("./mailer-smtp");
    return sendSmtpMail(message);
  }
  throw new Error(`Неизвестный MAIL_TRANSPORT: ${transport}`);
}
