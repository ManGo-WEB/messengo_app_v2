"use client";

// Панель диалога (план D2 п.1–2): история (пузыри IN/OUT, статусы доставки,
// разделитель ветки) + композер с автосохранением черновика (ревизии, конфликт
// правки — по образцу V1) и отправкой через Outbox. Реалтайм — SSE с
// запасным опросом раз в 10 секунд.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../icons/Icon";
import ChannelIcon from "../icons/ChannelIcon";
import { Avatar } from "../ui";
import { ApiError, apiJson } from "../../lib/api-client";
import { useEventStream, type InboxEvent } from "../../hooks/useEventStream";
import { dayLabel, formatMessageTime } from "./format";
import type { ConversationInfo, DraftRow, MessageItem } from "./types";
import "./chat.css";

const AUTOSAVE_DEBOUNCE_MS = 800;
const FALLBACK_POLL_MS = 10_000;

function statusIcon(status: string, direction: "IN" | "OUT") {
  if (direction !== "OUT") return null;
  switch (status) {
    case "PENDING":
      return <Icon name="clock" size={13} />;
    case "SENT":
      return (
        <span className="chat__status chat__status--sent">
          <Icon name="checks" size={13} />
        </span>
      );
    case "FAILED":
      return (
        <span className="chat__status chat__status--failed">
          <Icon name="close" size={13} />
        </span>
      );
    case "UNKNOWN":
      return (
        <span className="chat__status chat__status--unknown">
          <Icon name="info" size={13} />
        </span>
      );
    default:
      return null;
  }
}

export default function ChatPanel({
  conversationId,
  info,
  onSent,
}: {
  conversationId: string;
  info: ConversationInfo | null;
  onSent?: () => void;
}) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  // Черновик (V1): text — в редакторе, savedText — на сервере; расхождение
  // триггерит автосохранение. expectedRevision — оптимистичная блокировка.
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState<DraftRow | null>(null);
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Пользователь уже редактировал черновик в этой сессии — тогда серверная
  // версия при поздней загрузке не должна затирать введённый текст.
  const touchedRef = useRef(false);

  // Чистая загрузка истории (без setState) — setState только в колбэках.
  const fetchMessages = useCallback(
    async (): Promise<MessageItem[]> =>
      (await apiJson<{ messages: MessageItem[] }>(`/api/conversations/${conversationId}/messages`)).messages,
    [conversationId],
  );
  const refreshMessages = useCallback(() => {
    fetchMessages()
      .then((loaded) => {
        setMessages(loaded);
        setMessagesLoaded(true);
      })
      .catch((error) => console.error("chat: история:", error));
  }, [fetchMessages]);

  // Загрузка: история + черновик.
  useEffect(() => {
    const controller = new AbortController();
    refreshMessages();
    void apiJson<DraftRow>(`/api/conversations/${conversationId}/draft`, { signal: controller.signal })
      .then((draft) => {
        setRevision(draft.revision);
        if (!touchedRef.current) {
          setText(draft.text);
          setSavedText(draft.text);
        } else {
          // Пользователь уже начал печатать — оставляем его текст, но берём
          // серверную ревизию, чтобы автосохранение не словило 409.
          setSavedText(draft.text);
        }
        setReady(true);
      })
      .catch((error) => {
        // Обрыв запроса при размонтировании/смене диалога — штатное поведение
        // cleanup'а, не ошибка (иначе AbortError попадает в dev-оверлей).
        if ((error as Error).name === "AbortError") return;
        console.error("chat: черновик:", error);
      });
    return () => controller.abort();
  }, [conversationId, refreshMessages]);

  // Реалтайм: новое сообщение (полный текст) и смены статусов.
  const onEvent = useCallback(
    (event: InboxEvent) => {
      if (event.conversationId !== conversationId) return;
      if (event.type === "message.status") {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === event.messageId ? { ...message, status: event.status ?? message.status } : message,
          ),
        );
      }
      if (event.type === "message.new") refreshMessages();
    },
    [conversationId, refreshMessages],
  );
  const sseConnected = useEventStream(onEvent);

  // Запасной опрос, пока SSE не подключён.
  useEffect(() => {
    if (sseConnected) return;
    const timer = setInterval(refreshMessages, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [sseConnected, refreshMessages]);

  // Автосохранение: раз в 800 мс после последней правки.
  useEffect(() => {
    if (!ready || conflict) return;
    if (text === savedText) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void apiJson<DraftRow>(`/api/conversations/${conversationId}/draft`, {
        method: "PUT",
        body: JSON.stringify({ text, expectedRevision: revision }),
      })
        .then((draft) => {
          setSavedText(draft.text);
          setRevision(draft.revision);
          setSavedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) {
            // Черновик правили в другом месте: показываем серверную версию.
            const serverDraft = (error.payload as { draft?: DraftRow })?.draft;
            if (serverDraft) setConflict(serverDraft);
          } else {
            console.error("chat: автосохранение:", error);
          }
        });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [text, savedText, revision, ready, conflict, conversationId]);

  // Автоскролл к последнему сообщению.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await apiJson<{ message: MessageItem }>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: trimmed }),
      });
      // Отправленный текст перестаёт быть черновиком: автосохранение запишет пустое.
      setText("");
      setSavedText("");
      setConflict(null);
      refreshMessages();
      onSent?.();
    } catch (error) {
      console.error("chat: отправка:", error);
    } finally {
      setSending(false);
    }
  };

  const adoptServerDraft = () => {
    if (!conflict) return;
    setText(conflict.text);
    setSavedText(conflict.text);
    setRevision(conflict.revision);
    setConflict(null);
  };

  const overwriteMine = async () => {
    if (!conflict) return;
    try {
      const draft = await apiJson<DraftRow>(`/api/conversations/${conversationId}/draft`, {
        method: "PUT",
        body: JSON.stringify({ text, expectedRevision: conflict.revision }),
      });
      setSavedText(draft.text);
      setRevision(draft.revision);
      setConflict(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const serverDraft = (error.payload as { draft?: DraftRow })?.draft;
        if (serverDraft) setConflict(serverDraft);
      } else {
        console.error("chat: перезапись черновика:", error);
      }
    }
  };

  const contactName = info?.contact.name ?? info?.contact.externalId ?? "";

  // Разделители дней и веток Telegram-обсуждений (чистая функция от индекса —
  // без мутаций переменных рендера).
  const dayFor = (index: number): string | null => {
    const day = dayLabel(messages[index].createdAt);
    return index === 0 || dayLabel(messages[index - 1].createdAt) !== day ? day : null;
  };

  return (
    <aside className="chat">
      <header className="chat__head">
        <Avatar name={contactName} size={38} />
        <div className="chat__who">
          <div className="chat__name">{contactName || "Диалог"}</div>
          <div className="chat__meta">
            {info && <ChannelIcon id={info.connection.type} size={14} />}
            {info ? info.connection.name : ""}
            {info?.threadTitle ? ` · ${info.threadTitle}` : ""}
          </div>
        </div>
      </header>

      <div className="chat__body" ref={bodyRef}>
        {messagesLoaded && messages.length === 0 && <div className="chat__empty">Сообщений пока нет</div>}
        {messages.map((message, index) => {
          const day = dayFor(index);
          return (
            <div key={message.id} style={{ display: "contents" }}>
              {day && <div className="chat__day">{day}</div>}
              {info?.threadTitle && day && <div className="chat__thread">{info.threadTitle}</div>}
              <div className={`chat__msg chat__msg--${message.direction === "IN" ? "them" : "me"}`}>
                <div className="chat__bubble">{message.text}</div>
                <div className="chat__meta-row">
                  <span>{formatMessageTime(message.createdAt)}</span>
                  {statusIcon(message.status, message.direction)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {conflict && (
        <div className="chat__conflict">
          Черновик изменён в другом месте. Серверная версия: «{conflict.text || "—"}»
          <div className="chat__conflict-actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={adoptServerDraft}>
              Взять серверную
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void overwriteMine()}>
              Перезаписать моей
            </button>
          </div>
        </div>
      )}
      <div className="chat__draft-state">
        {conflict
          ? "Есть конфликт правок"
          : text !== savedText
            ? "Сохранение…"
            : savedAt
              ? `Черновик сохранён в ${savedAt}`
              : ready && revision > 0
                ? "Черновик загружен"
                : ""}
      </div>

      <footer className="chat__input">
        <button className="chat__act" title="Прикрепить файл (появится в одной из следующих фаз)" disabled>
          <Icon name="paperclip" size={18} />
        </button>
        <textarea
          rows={1}
          placeholder="Напишите сообщение..."
          value={text}
          onChange={(e) => {
            touchedRef.current = true;
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="chat__send" onClick={() => void send()} title="Отправить" disabled={sending || !text.trim()}>
          <Icon name="send" size={16} />
        </button>
      </footer>
    </aside>
  );
}
