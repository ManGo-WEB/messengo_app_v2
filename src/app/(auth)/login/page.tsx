"use client";

// Форма входа (план D6 п.2, API — A3): email + пароль + «Запомнить меня»
// (персистентная кука на 30 дней против сессионной). После входа — переход
// в рабочую область (/chats; дашборд появится в D5).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ChannelIcon from "@/components/icons/ChannelIcon";
import { Button, Checkbox, Input } from "@/components/ui";
import { ApiError, apiJson } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, rememberMe }),
      });
      router.push("/chats");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-brand">
        <ChannelIcon id="chatsite" size={30} />
        Messengo
      </div>
      <div className="auth-title">Вход в кабинет</div>
      <div className="auth-sub">Единое окно для всех мессенджеров вашей организации</div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="login-email">Email</label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="login-password">Пароль</label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div style={{ margin: "4px 0 16px" }}>
          <Checkbox checked={rememberMe} onChange={setRememberMe} label="Запомнить меня на 30 дней" />
        </div>
        <Button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Входим…" : "Войти"}
        </Button>
      </form>

      <div className="auth-links">
        <Link href="/forgot-password">Забыли пароль?</Link>
        <Link href="/register">Создать аккаунт</Link>
      </div>
    </>
  );
}
