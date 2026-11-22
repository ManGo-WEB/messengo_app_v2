"use client";

// Смена пароля по одноразовой ссылке из письма (план D6 п.2, API — A3 п.8):
// /reset-password?token=… → новый пароль → все сессии пользователя гасятся.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ChannelIcon from "@/components/icons/ChannelIcon";
import { Button, Input } from "@/components/ui";
import { ApiError, apiJson } from "@/lib/api-client";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <>
        <div className="auth-error">Ссылка недействительна: в адресе нет токена. Запросите новое письмо.</div>
        <Link href="/forgot-password" className="btn btn--outline btn--md" style={{ width: "100%", textAlign: "center" }}>
          Запросить ссылку
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <div className="auth-ok">Пароль изменён. Все прежние сессии завершены — войдите с новым паролем.</div>
        <Link href="/login" className="btn btn--primary btn--md" style={{ width: "100%", textAlign: "center" }}>
          Войти
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="auth-field">
        <label htmlFor="reset-password">Новый пароль</label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="минимум 8 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <div className="auth-error">{error}</div>}
      <Button type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Сохраняем…" : "Сменить пароль"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <div className="auth-brand">
        <ChannelIcon id="chatsite" size={30} />
        Messengo
      </div>
      <div className="auth-title">Новый пароль</div>
      <div className="auth-sub">Придумайте новый пароль для входа в кабинет</div>
      {/* useSearchParams требует Suspense-границу для статической сборки */}
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
      <div className="auth-links">
        <Link href="/login">Вернуться ко входу</Link>
      </div>
    </>
  );
}
