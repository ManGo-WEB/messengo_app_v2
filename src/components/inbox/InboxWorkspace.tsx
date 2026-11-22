"use client";

// Экран «Чаты» (план D2): список диалогов с фильтрами (канал/статус/поиск),
// панель истории с композером и черновиком, карточка контакта. Реалтайм —
// SSE /api/events с запасным опросом раз в 10 секунд.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ChannelIcon from "../icons/ChannelIcon";
import { EmptyState, FilterChip, SearchInput } from "../ui";
import { ApiError, apiJson } from "../../lib/api-client";
import { useEventStream, type InboxEvent } from "../../hooks/useEventStream";
import ChatPanel from "./ChatPanel";
import ContactCard from "./ContactCard";
import { formatListTime } from "./format";
import type { ConversationInfo, ConversationItem } from "./types";
import "./inbox.css";
import "./chat.css";


const CHANNEL_FILTERS: Array<{ id: string; label: string }> = [
  { id: "VK", label: "VK" },
  { id: "TELEGRAM_BOT", label: "Telegram-бот" },
  { id: "TELEGRAM_PERSONAL", label: "Telegram-личный" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "MAX", label: "MAX" },
  { id: "FACEBOOK", label: "Facebook" },
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "TESTING", label: "Тестовый" },
];

const STATUS_FILTERS: Array<{ id: "all" | "awaiting" | "replied"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "awaiting", label: "Ожидают ответа" },
  { id: "replied", label: "Отвечены" },
];

const PAGE_SIZE = 50;
const FALLBACK_POLL_MS = 10_000; // запасной опрос, когда SSE не подключён
const SEARCH_DEBOUNCE_MS = 400;

export default function InboxWorkspace() {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "awaiting" | "replied">("all");
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authOk, setAuthOk] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const listAbort = useRef<AbortController | null>(null);

  // Чистая загрузка списка (без setState) — setState только в колбэках ниже.
  const fetchList = useCallback(
    async (nextOffset: number, signal: AbortSignal): Promise<{ total: number; conversations: ConversationItem[] }> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (channelFilter) params.set("channel", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);
      return apiJson(`/api/conversations?${params}`, { signal });
    },
    [channelFilter, statusFilter, searchQuery],
  );

  const loadList = useCallback(
    (nextOffset = 0) => {
      listAbort.current?.abort();
      const controller = new AbortController();
      listAbort.current = controller;
      fetchList(nextOffset, controller.signal)
        .then((data) => {
          setAuthRequired(false);
          setAuthOk(true);
          setItems((prev) => (nextOffset > 0 ? [...prev, ...data.conversations] : data.conversations));
          setTotal(data.total);
        })
        .catch((error) => {
          if ((error as Error).name === "AbortError") return;
          if (error instanceof ApiError && error.status === 401) {
            // Неавторизованный визит: показываем дружелюбное состояние, а не
            // ошибку в консоли (замечание владельца).
            setAuthRequired(true);
            return;
          }
          console.error("inbox: список диалогов:", error);
        });
    },
    [fetchList],
  );

  // Поиск с дебаунсом; сброс страницы — вместе с фильтрами (в обработчиках).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(search.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Проба сессии через /api/session (всегда 200): список грузим только при
  // сессии, неавторизованным — дружелюбное состояние без 401 в консоли.
  useEffect(() => {
    void fetch("/api/session")
      .then((response) => response.json())
      .then((data: { authed: boolean }) => {
        setSessionChecked(true);
        if (data.authed) {
          setAuthOk(true);
        } else {
          setAuthRequired(true);
        }
      })
      .catch(() => setSessionChecked(true));
  }, []);
  useEffect(() => {
    if (!authOk) return;
    void loadList(offset);
  }, [authOk, loadList, offset]);

  const refetchList = useCallback(() => void loadList(offset), [loadList, offset]);
  const loadMore = () => setOffset((current) => current + PAGE_SIZE);

  // Dev-only (план B0 п.6: testing-канал позволяет создать диалог без реального
  // мессенджера) — кнопка вместо консольных команд; в production роут
  // /api/testing/inbound выключен, кнопка не рендерится.
  const [sendingTest, setSendingTest] = useState(false);
  const sendTestMessage = useCallback(() => {
    setSendingTest(true);
    apiJson<{ organization: { id: string } }>("/api/auth/me")
      .then((me) =>
        fetch("/api/testing/inbound", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId: me.organization.id,
            events: [
              {
                externalEventId: `dev-${Date.now()}`,
                contactExternalId: "test-client",
                contactName: "Тестовый клиент",
                conversationKey: "test-chat",
                text: "Проверка инбокса — сообщение из testing-канала",
              },
            ],
          }),
        }),
      )
      .then((response) => {
        if (!response.ok) throw new Error(`testing/inbound: ${response.status}`);
      })
      .then(() => refetchList())
      .catch((error) => console.error("inbox: тестовое сообщение:", error))
      .finally(() => setSendingTest(false));
  }, [refetchList]);

  const selectConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    setInfo(null);
    try {
      const data = await apiJson<{ conversation: ConversationInfo }>(`/api/conversations/${id}`);
      setInfo(data.conversation);
    } catch (error) {
      console.error("inbox: карточка диалога:", error);
    }
  }, []);

  // Реалтайм: любое новое сообщение/статус обновляет список; контент открытого
  // диалога обновляет сам ChatPanel (у него своя подписка).
  const onEvent = useCallback(
    (event: InboxEvent) => {
      if (event.type === "message.new" || event.type === "message.status") refetchList();
    },
    [refetchList],
  );
  // SSE открываем только после подтверждённой авторизации (иначе EventSource
  // бесконечно ретраит 401 и шумит в консоли).
  const sseConnected = useEventStream(onEvent, authOk);

  // Запасной вариант (план D2 п.3): опрос раз в 10 секунд, пока SSE не подключён
  // и подтверждена авторизация (неавторизованным не долбим API).
  // (ChatPanel обновляет контент открытого диалога своим собственным fallback-опросом.)
  useEffect(() => {
    if (sseConnected || !authOk) return;
    const timer = setInterval(() => refetchList(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [sseConnected, authOk, refetchList]);

  const showMore = useMemo(() => items.length < total, [items, total]);

  return (
    <div className="inbox">
      <div className="inbox__list">
        <div className="inbox__toolbar">
          {STATUS_FILTERS.map((chip) => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              value={statusFilter === chip.id ? chip.label : ""}
              onClick={() => {
                setOffset(0);
                setStatusFilter(chip.id);
              }}
            />
          ))}
          <span className="inbox__sep" />
          {CHANNEL_FILTERS.map((chip) => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              value={channelFilter === chip.id ? chip.label : ""}
              onClick={() => {
                setOffset(0);
                setChannelFilter((current) => (current === chip.id ? null : chip.id));
              }}
            />
          ))}
          <SearchInput value={search} onChange={setSearch} placeholder="Искать..." width={200} />
        </div>

        <div className="inbox__rows">
          {authRequired ? (
            <EmptyState
              icon="lock"
              title="Требуется вход"
              text="Войдите в аккаунт, чтобы увидеть диалоги вашей организации. Форма входа и регистрации уже доступны."
              action={
                <Link href="/login" className="btn btn--primary btn--md">
                  Войти
                </Link>
              }
            />
          ) : !sessionChecked ? (
            <div className="inbox__empty" aria-busy="true">
              Загрузка…
            </div>
          ) : (
            <>
              {items.map((item) => (
            <div
              key={item.id}
              className={`inbox__row ${selectedId === item.id ? "is-selected" : ""}`}
              onClick={() => void selectConversation(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") void selectConversation(item.id);
              }}
            >
              <ChannelIcon id={item.channel} size={36} />
              <div className="inbox__client">
                <div className="inbox__client-top">
                  <span className="inbox__name">{item.contactName ?? item.contactExternalId}</span>
                  <span className="inbox__date">{formatListTime(item.lastMessageAt)}</span>
                </div>
                <div className="inbox__client-sub">
                  <span className="inbox__preview">
                    {item.lastMessage
                      ? `${item.lastMessage.direction === "OUT" ? "Вы: " : ""}${item.lastMessage.text}`
                      : "Нет сообщений"}
                  </span>
                  <span className="inbox__channel-name dim">
                    {item.connectionName ?? CHANNEL_FILTERS.find((c) => c.id === item.channel)?.label ?? item.channel}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!items.length && (
            <>
              <div className="inbox__empty">Диалогов нет</div>
              {process.env.NODE_ENV !== "production" && (
                <div className="inbox__empty" style={{ paddingTop: 0 }}>
                  <p className="dim" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
                    Тестовый канал (dev): диалог без реального мессенджера
                  </p>
                  <button type="button" className="btn btn--outline btn--md" onClick={sendTestMessage} disabled={sendingTest}>
                    {sendingTest ? "Отправляем…" : "Отправить тестовое сообщение"}
                  </button>
                </div>
              )}
            </>
          )}
            </>
          )}
        </div>

        {showMore && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn btn--outline btn--md" style={{ width: "100%" }} onClick={loadMore}>
              Показать ещё ({items.length} из {total})
            </button>
          </div>
        )}
      </div>

      {selectedId ? (
        <>
          <ChatPanel key={selectedId} conversationId={selectedId} info={info} onSent={refetchList} />
          {info && <ContactCard info={info} />}
        </>
      ) : (
        <div className="chat">
          <div className="chat__empty">Выберите диалог слева, чтобы открыть переписку</div>
        </div>
      )}
    </div>
  );
}
