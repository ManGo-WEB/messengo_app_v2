"use client";

// Диалог привязки личного Telegram (план D3 п.2, механика B3 + V1 telegram-personal-dialog):
// deeplink служебного бота → владелец отправляет /start → подтверждение аккаунта →
// привязка Telegram Business → ACTIVE. Статус — SSE (план D3 п.2) + опрос раз в
// 1.5 с как в V1. Рендерится условно (workspace) — состояние свежее на маунте.
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { apiJson } from "../../lib/api-client";
import type { ChannelStatusEvent } from "./types";

const POLL_MS = 1_500; // как в V1 telegram-personal-dialog

type PersonalStatus = { id: string; status: string; ownerLinked: boolean; businessLinked: boolean };

// Чистый запрос статуса привязки — setState только в колбэках вызывающей стороны
const fetchPersonalStatus = async (
  id: string,
  signal?: AbortSignal,
): Promise<PersonalStatus | null> => {
  try {
    return await apiJson<PersonalStatus>(`/api/channels/telegram-personal/${id}/status`, { signal });
  } catch {
    // 404 (подключение удалено) и сетевые сбои — null; опрос повторит по тику
    return null;
  }
};

export default function TelegramPersonalDialog({
  channelEvent,
  onClose,
  onConnected,
}: {
  channelEvent: ChannelStatusEvent | null;
  onClose: () => void;
  onConnected: (name: string) => void;
}) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [deeplink, setDeeplink] = useState("");
  const [ownerLinked, setOwnerLinked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Один тик опроса: чистый запрос → setState в .then
  const checkOnce = useCallback(
    (id: string) => {
      fetchPersonalStatus(id).then((data) => {
        if (!data) return;
        setOwnerLinked(data.ownerLinked);
        if (data.status === "ACTIVE" && !finished) {
          setFinished(true);
          stopPolling();
          onConnected("Личный Telegram");
        }
      });
    },
    [finished, onConnected, stopPolling],
  );

  const startBinding = useCallback(async () => {
    setBusy(true);
    setError("");
    setOwnerLinked(false);
    setFinished(false);
    try {
      // Повторное начало привязки: предыдущее PENDING-подключение закрываем,
      // чтобы не плодить «осиротевшие» записи (ревизий/reconnect в V2 нет)
      if (connectionId) {
        await apiJson(`/api/channels/${connectionId}`, { method: "DELETE" }).catch(() => {});
      }
      const data = await apiJson<{ connectionId: string; deeplink: string; expiresAt: string }>(
        "/api/channels/telegram-personal/connect",
        { method: "POST", body: JSON.stringify({}) },
      );
      setConnectionId(data.connectionId);
      setDeeplink(data.deeplink);
      stopPolling();
      pollTimer.current = setInterval(() => checkOnce(data.connectionId), POLL_MS);
    } catch {
      setError("Не удалось начать привязку. Проверьте, что служебный бот настроен на сервере.");
    } finally {
      setBusy(false);
    }
  }, [checkOnce, connectionId, stopPolling]);

  // SSE (план D3 п.2): событие своего подключения — внеочередная проверка статуса
  useEffect(() => {
    if (!channelEvent?.connectionId || channelEvent.connectionId !== connectionId) return;
    checkOnce(connectionId);
  }, [channelEvent, connectionId, checkOnce]);

  useEffect(() => stopPolling, [stopPolling]);

  const step = finished ? 3 : ownerLinked ? 2 : connectionId ? 1 : 0;

  return (
    <Modal open onClose={onClose} title="Подключение личного Telegram">
      {!connectionId ? (
        <>
          <p className="ch-dlg__text">
            Личный Telegram подключается через <b>служебного бота Messengo</b> и Telegram Business:
            диалоги вашей личной переписки попадают в единое окно, ответы уходят от вашего имени.
          </p>
          {error && <p className="ch-dlg__error">{error}</p>}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void startBinding()} disabled={busy}>
              Начать привязку
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="ch-steps">
            <div className={`ch-steps__item ${step > 1 ? "is-done" : step === 1 ? "is-current" : ""}`}>
              <span className="ch-steps__num">{step > 1 ? "✓" : "1"}</span>
              <span>Перейдите в служебного бота и отправьте ему команду /start</span>
            </div>
            <div className={`ch-steps__item ${step > 2 ? "is-done" : step === 2 ? "is-current" : ""}`}>
              <span className="ch-steps__num">{step > 2 ? "✓" : "2"}</span>
              <span>
                В Telegram: <b>Настройки → Telegram Business → Чат-боты</b> — добавьте служебного бота
              </span>
            </div>
          </div>
          {finished ? (
            <p className="ch-dlg__text">Личный Telegram подключён — диалоги появятся в едином окне.</p>
          ) : (
            <div className="ch-dlg__row">
              <a className="btn btn--primary btn--md" href={deeplink} target="_blank" rel="noreferrer">
                Открыть бота в Telegram
              </a>
              <span className="ch-dlg__text" style={{ margin: 0 }}>
                Ссылка действует 15 минут
              </span>
            </div>
          )}
          {error && <p className="ch-dlg__error">{error}</p>}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              {finished ? "Готово" : "Закрыть"}
            </Button>
            {!finished && (
              <Button variant="soft" onClick={() => void startBinding()} disabled={busy}>
                Получить новую ссылку
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
