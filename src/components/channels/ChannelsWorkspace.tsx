"use client";

// Экран «Каналы связи» (план D3): список подключений организации (таблица по
// прототипу) + сетка «можно подключить» с флоу подключения каждого канала.
// Реалтайм статусов — SSE /api/events (событие channel.status) с запасным
// опросом раз в 10 секунд (паттерн D2).
import { useCallback, useEffect, useRef, useState } from "react";
import ChannelIcon from "../icons/ChannelIcon";
import Icon from "../icons/Icon";
import { Badge, Button, EmptyState, InfoBanner, Toast, ToastStack } from "../ui";
import { ApiError, apiJson } from "../../lib/api-client";
import { useEventStream, type InboxEvent } from "../../hooks/useEventStream";
import { formatListTime } from "../inbox/format";
import { apiErrorText, channelName, connectionDisplayName, statusView } from "./labels";
import VkConnectDialog from "./VkConnectDialog";
import TelegramBotDialog from "./TelegramBotDialog";
import TelegramPersonalDialog from "./TelegramPersonalDialog";
import GreenApiDialog from "./GreenApiDialog";
import MetaConnectDialog from "./MetaConnectDialog";
import DisconnectDialog from "./DisconnectDialog";
import type { ChannelsDialog, ChannelStatusEvent, ConnectionRow, ConnectCard, ToastItem } from "./types";
import "./channels.css";

const FALLBACK_POLL_MS = 10_000; // запасной опрос, когда SSE не подключён (D2)

// Сетка «можно подключить» — порядок и состав по прототипу (channels page)
const CONNECT_CARDS: ConnectCard[] = [
  { type: "WHATSAPP", name: "WhatsApp", dialog: { kind: "greenapi", channel: "WHATSAPP" } },
  { type: "TELEGRAM_PERSONAL", name: "Telegram (личный)", dialog: { kind: "telegram-personal" } },
  { type: "TELEGRAM_BOT", name: "Telegram-бот", dialog: { kind: "telegram-bot" } },
  { type: "INSTAGRAM", name: "Instagram", dialog: { kind: "meta", platform: "instagram" } },
  { type: "VK", name: "ВКонтакте", dialog: { kind: "vk" } },
  { type: "FACEBOOK", name: "Facebook", dialog: { kind: "meta", platform: "facebook" } },
  { type: "MAX", name: "MAX", dialog: { kind: "greenapi", channel: "MAX" } },
];

// Чистая загрузка списка подключений — setState только в колбэках вызывающей стороны
const fetchConnections = async (signal?: AbortSignal): Promise<ConnectionRow[]> => {
  const data = await apiJson<{ connections: ConnectionRow[] }>("/api/channels", { signal });
  return data.connections;
};

export default function ChannelsWorkspace() {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authOk, setAuthOk] = useState(false);
  const [dialog, setDialog] = useState<ChannelsDialog | null>(null);
  const [disconnecting, setDisconnecting] = useState<ConnectionRow | null>(null);
  const [channelEvent, setChannelEvent] = useState<ChannelStatusEvent | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7_000);
  }, []);

  // Возврат из OAuth VK/Meta: callback-и (B1/B4) редиректят на /settings/channels?vk=…|?meta=…,
  // страница-редирект переносит оператора сюда с тем же query. connection:<id> →
  // продолжение флоу выбора сообщества/страницы; connected → успех; иначе код ошибки.
  const consumeOauthReturn = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const vk = params.get("vk");
    const meta = params.get("meta");
    if (!vk && !meta) return;
    params.delete("vk");
    params.delete("meta");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));

    const handle = (value: string, kind: "vk" | "meta") => {
      if (value === "connected") {
        pushToast({ tone: "success", text: "Канал подключён." });
        return;
      }
      if (value.startsWith("connection:")) {
        const connectionId = value.slice("connection:".length);
        if (kind === "vk") {
          setDialog({ kind: "vk", connectionId });
          pushToast({ tone: "info", text: "Аккаунт VK подключён — выберите сообщество." });
        } else {
          // платформу запоминали перед уходом на OAuth (callback возвращает только connectionId)
          const platform = sessionStorage.getItem("messengo:meta-platform") === "instagram" ? "instagram" : "facebook";
          setDialog({ kind: "meta", platform, connectionId });
          pushToast({ tone: "info", text: "Аккаунт Facebook подключён — выберите страницу." });
        }
        return;
      }
      pushToast({ tone: "error", text: apiErrorText(value) });
    };
    if (vk) handle(vk, "vk");
    if (meta) handle(meta, "meta");
    // callback мог создать/изменить подключение (VK/Meta статусы в SSE не публикуются —
    // финализация идёт в ответ на редирект) — синхронизируем список
    fetchConnections()
      .then((rows) => setConnections(rows))
      .catch(() => {});
  }, [pushToast]);

  // Проба сессии (как в D2): без 401 в консоли для неавторизованных; при успехе
  // сразу разбираем возможный возврат из OAuth
  useEffect(() => {
    void fetch("/api/session")
      .then((response) => response.json())
      .then((data: { authed: boolean }) => {
        if (data.authed) {
          setAuthOk(true);
          consumeOauthReturn();
        } else {
          setAuthRequired(true);
        }
      })
      .catch(() => setAuthRequired(true));
  }, [consumeOauthReturn]);

  useEffect(() => {
    if (!authOk) return;
    const controller = new AbortController();
    fetchConnections(controller.signal)
      .then((rows) => {
        setConnections(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => controller.abort();
  }, [authOk]);

  const refetchList = useCallback(() => {
    fetchConnections()
      .then((rows) => setConnections(rows))
      .catch(() => {});
  }, []);

  // Реалтайм: смена статуса подключения обновляет строку списка и открытый диалог
  const onEvent = useCallback((event: InboxEvent) => {
    if (event.type !== "channel.status" || !event.connectionId) return;
    setChannelEvent({
      connectionId: event.connectionId,
      connectionName: event.connectionName,
      channelType: event.channelType,
      status: event.status,
    });
    setConnections((rows) =>
      rows.map((row) =>
        row.id === event.connectionId
          ? {
              ...row,
              status: event.status ?? row.status,
              // для PENDING VK/Meta имя появляется только после финализации — не затираем
              externalName: event.connectionName ?? row.externalName,
            }
          : row,
      ),
    );
  }, []);
  const streamConnected = useEventStream(onEvent, authOk);

  // Запасной опрос (паттерн D2), пока SSE не подключён
  useEffect(() => {
    if (!authOk || streamConnected) return;
    const timer = setInterval(() => refetchList(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [authOk, streamConnected, refetchList]);

  // Перед открытием OAuth-диалога Meta запоминаем платформу — callback
  // возвращает только connectionId (?meta=connection:<id>), без платформы.
  const openDialog = useCallback((next: ChannelsDialog) => {
    if (next.kind === "meta") {
      sessionStorage.setItem("messengo:meta-platform", next.platform);
    }
    setDialog(next);
  }, []);

  const onConnected = useCallback(
    (name: string) => {
      setDialog(null);
      pushToast({ tone: "success", text: `Канал «${name}» подключён.` });
      refetchList();
    },
    [refetchList, pushToast],
  );

  const connectTesting = useCallback(async () => {
    try {
      await apiJson("/api/channels/testing/connect", { method: "POST", body: JSON.stringify({}) });
      pushToast({ tone: "success", text: "Тестовый канал подключён." });
      refetchList();
    } catch (error) {
      pushToast({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 404
            ? "Тестовый канал доступен только на dev-стенде."
            : "Не удалось подключить тестовый канал.",
      });
    }
  }, [refetchList, pushToast]);

  if (authRequired) {
    return (
      <div>
        <h1 className="page-title">Каналы связи</h1>
        <EmptyState
          icon="lock"
          title="Требуется вход"
          text="Подключения видны только авторизованным операторам."
          action={
            <a className="btn btn--primary btn--md" href="/login">
              Войти
            </a>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Каналы связи</h1>

      {loaded && connections.length === 0 ? (
        <EmptyState
          icon="send"
          title="Подключений пока нет"
          text="Подключите первый канал — его диалоги появятся в едином окне."
        />
      ) : (
        <div className="ch-table">
          <div className="ch-table__head">
            <span>Канал</span>
            <span>Статус</span>
            <span>Последнее событие</span>
            <span>Действия</span>
          </div>
          {connections.map((connection) => {
            const status = statusView(connection.status);
            return (
              <div key={connection.id} className="ch-table__row">
                <div className="ch-table__channel">
                  <ChannelIcon id={connection.type} size={34} />
                  <div>
                    <div className="ch-table__name">{connectionDisplayName(connection)}</div>
                    <div className="ch-table__event">{channelName(connection.type)}</div>
                  </div>
                </div>
                <div className="ch-table__status">
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div className="ch-table__event">
                  {connection.lastEventAt ? formatListTime(connection.lastEventAt) : "—"}
                </div>
                <div className="ch-table__actions">
                  {connection.status !== "DISCONNECTED" && (
                    <Button variant="outline" size="sm" onClick={() => setDisconnecting(connection)}>
                      Отключить
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="section-title">Подключить канал</h2>
      <div className="ch-grid">
        {CONNECT_CARDS.map((card) => (
          <button
            key={`${card.dialog.kind}-${card.type}`}
            type="button"
            className="ch-card"
            title={`Подключить ${card.name}`}
            onClick={() => openDialog({ ...card.dialog })}
          >
            <span className="ch-card__plus">
              <Icon name="plus" size={13} />
            </span>
            <ChannelIcon id={card.type} size={44} />
            <span className="ch-card__name">{card.name}</span>
          </button>
        ))}
        {process.env.NODE_ENV !== "production" && (
          <button type="button" className="ch-card" title="Подключить тестовый канал" onClick={() => void connectTesting()}>
            <span className="ch-card__plus">
              <Icon name="plus" size={13} />
            </span>
            <ChannelIcon id="TESTING" size={44} />
            <span className="ch-card__name">Тестовый канал</span>
          </button>
        )}
      </div>

      <InfoBanner
        tone="info"
        action={
          <Button variant="outline" size="sm" icon="help">
            Как подключить канал
          </Button>
        }
      >
        Каналы подключаются за пару минут: авторизуйтесь в мессенджере — и диалоги появятся в едином
        окне.
      </InfoBanner>

      {dialog?.kind === "vk" && (
        <VkConnectDialog pendingConnectionId={dialog.connectionId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "telegram-bot" && (
        <TelegramBotDialog onClose={() => setDialog(null)} onConnected={onConnected} />
      )}
      {dialog?.kind === "telegram-personal" && (
        <TelegramPersonalDialog channelEvent={channelEvent} onClose={() => setDialog(null)} onConnected={onConnected} />
      )}
      {dialog?.kind === "greenapi" && (
        <GreenApiDialog
          channel={dialog.channel}
          pendingConnectionId={dialog.connectionId}
          channelEvent={channelEvent}
          onClose={() => setDialog(null)}
          onConnected={onConnected}
        />
      )}
      {dialog?.kind === "meta" && (
        <MetaConnectDialog
          platform={dialog.platform}
          pendingConnectionId={dialog.connectionId}
          onClose={() => setDialog(null)}
          onConnected={onConnected}
        />
      )}
      {disconnecting && (
        <DisconnectDialog
          connection={disconnecting}
          onClose={() => setDisconnecting(null)}
          onDisconnected={() => {
            setDisconnecting(null);
            refetchList();
          }}
          pushToast={pushToast}
        />
      )}

      <ToastStack>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          >
            {toast.text}
            {toast.link && (
              <>
                {" "}
                <a href={toast.link.href} target="_blank" rel="noreferrer">
                  {toast.link.label}
                </a>
              </>
            )}
          </Toast>
        ))}
      </ToastStack>
    </div>
  );
}
