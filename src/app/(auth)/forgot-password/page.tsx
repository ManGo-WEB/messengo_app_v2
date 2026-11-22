"use client";

// «Напомнить пароль» (план D6 п.2, API — A3 п.8): ответ всегда одинаковый,
// чтобы не раскрывать существование аккаунта. В dev письма печатаются в лог
// (MAIL_TRANSPORT=console), в проде уйдут по SMTP.
import { useState } from "react";
import Link from "next/link";
import ChannelIcon from "@/components/icons/ChannelIcon";
import { Button, Input } from "@/components/ui";
import { apiJson } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await apiJson("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    } catch {
      // даже при ошибке сети показываем то же сообщение — без раскрытия деталей
    } finally {
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-brand">
        <ChannelIcon id="chatsite" size={30} />
        Messengo
      </div>
      <div className="auth-title">Напомнить пароль</div>

      {sent ? (
        <>
          <div className="auth-ok">
            Если аккаунт с этим email существует, мы отправили ссылку для смены пароля. Ссылка действует 1 час.
          </div>
          <p className="auth-hint" style={{ marginBottom: 14 }}>
            В dev-окружении письма печатаются в лог сервера (MAIL_TRANSPORT=console).
          </p>
          <Link href="/login" className="btn btn--outline btn--md" style={{ width: "100%", textAlign: "center" }}>
            Вернуться ко входу
          </Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="forgot-email">Email</label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Отправляем…" : "Отправить ссылку"}
          </Button>
        </form>
      )}

      <div className="auth-links">
        <Link href="/login">Вернуться ко входу</Link>
        <Link href="/register">Создать аккаунт</Link>
      </div>
    </>
  );
}
