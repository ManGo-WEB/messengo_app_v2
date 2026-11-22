"use client";

// Диалог подключения Telegram-бота (план D3 п.2, механика V1 telegram-dialog):
// токен из @BotFather (+ опционально канал — B2) → сразу ACTIVE. Рендерится
// условно (workspace) — состояние свежее на маунте, сброс не нужен.
import { useCallback, useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import { ApiError, apiJson } from "../../lib/api-client";
import { apiErrorText } from "./labels";

export default function TelegramBotDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (name: string) => void;
}) {
  const [token, setToken] = useState("");
  const [channelUsername, setChannelUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(async () => {
    if (!token.trim()) {
      setError("Введите токен бота.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { connection } = await apiJson<{
        connection: { id: string; status: string; displayName: string | null };
      }>("/api/channels/telegram-bot/connect", {
        method: "POST",
        body: JSON.stringify({
          token: token.trim(),
          ...(channelUsername.trim() ? { channelUsername: channelUsername.trim() } : {}),
        }),
      });
      onConnected(connection.displayName ?? "Telegram-бот");
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось подключить бота.");
      setBusy(false);
    }
  }, [token, channelUsername, onConnected]);

  return (
    <Modal open onClose={onClose} title="Подключение Telegram-бота">
      <p className="ch-dlg__text">
        Создайте бота у <b>@BotFather</b> командой <b>/newbot</b> и вставьте выданный токен. Чтобы
        бот писал в канал, добавьте его администратором канала.
      </p>
      <div className="ch-field">
        <span className="ch-field__label">Токен бота</span>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="1234567890:AA…"
          autoComplete="off"
        />
      </div>
      <div className="ch-field">
        <span className="ch-field__label">Канал (необязательно)</span>
        <Input
          value={channelUsername}
          onChange={(e) => setChannelUsername(e.target.value)}
          placeholder="@username канала"
        />
      </div>
      {error && <p className="ch-dlg__error">{error}</p>}
      <div className="ch-dlg__footer">
        <span className="ch-dlg__spacer" />
        <Button variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !token.trim()}>
          Подключить
        </Button>
      </div>
    </Modal>
  );
}
