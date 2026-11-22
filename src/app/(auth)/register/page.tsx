"use client";

// Форма регистрации (план D6 п.2, API — A3): оператор + организация создаются
// в одной транзакции на сервере. После регистрации сразу входим и переходим
// на дашборд (главная после входа, план D5).
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { ApiError, apiJson } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name, organizationName: organizationName || undefined }),
      });
      // Сразу входим под новыми данными (register сессию не создаёт).
      await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Пользователь с таким email уже зарегистрирован. Войдите или используйте другой адрес.");
      } else {
        setError(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться.");
      }
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-brand">
        <Image src="/logo.png" alt="Логотип Messengo" width={30} height={30} />
        Messengo
      </div>
      <div className="auth-title">Создать аккаунт</div>
      <div className="auth-sub">Бесплатный старт: подключите каналы и получите единый инбокс</div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="reg-name">Ваше имя</label>
          <Input id="reg-name" required placeholder="Иван Иванов" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="auth-field">
          <label htmlFor="reg-email">Email</label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="reg-password">Пароль</label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="минимум 8 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="reg-org">Организация</label>
          <Input
            id="reg-org"
            placeholder="например, Студия дизайна «Манго»"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </div>
        <p className="auth-hint">Организацию можно пропустить — назовём по вашему имени.</p>
        <Button type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Создаём аккаунт…" : "Начать бесплатно"}
        </Button>
      </form>

      <div className="auth-links">
        <span className="dim">Уже есть аккаунт?</span>
        <Link href="/login">Войти</Link>
      </div>
    </>
  );
}
