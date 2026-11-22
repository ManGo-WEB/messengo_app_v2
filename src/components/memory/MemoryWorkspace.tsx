"use client";

// Экран «Память» (план D7): полнотекстовый поиск по всей переписке организации.
// Результаты ведут в диалог (/chats?conversation=<id> — Inbox открывает его сразу).
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "../ui";
import { channelName } from "../channels/labels";
import "./memory.css";

type MemoryItem = {
  messageId: string;
  conversationId: string;
  channel: string;
  sourceTitle: string | null;
  direction: string;
  createdAt: string;
  text: string;
};

export default function MemoryWorkspace() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function search(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setFailed(false);
    setSearched(trimmed);
    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setItems((await response.json()).items);
    } catch {
      setFailed(true);
      setItems(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="memory" aria-label="Память организации">
      <h1 className="page-title">Память</h1>
      <form
        className="memory__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <input
          type="search"
          aria-label="Поиск по памяти организации"
          placeholder="Найдите разговор по словам из переписки…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="memory__submit" disabled={busy || !query.trim()}>
          Найти
        </button>
      </form>
      {!searched && !busy && (
        <EmptyState
          icon="brain"
          title="Пока ничего не искали"
          text="Память ищет по всем перепискам организации: вопросам клиентов и вашим ответам. Индекс наполняется фоновым worker'ом."
        />
      )}
      {busy && (
        <p className="memory__note" role="status">
          Ищем в памяти…
        </p>
      )}
      {failed && (
        <p className="memory__note" role="alert">
          Поиск недоступен. Попробуйте позже.
        </p>
      )}
      {searched && !busy && !failed && items?.length === 0 && (
        <EmptyState icon="search" title="Ничего не найдено" text={`По запросу «${searched}» в переписке организации ничего нет.`} />
      )}
      {items?.map((item) => (
        <article key={item.messageId} className="memory__item">
          <p className="memory__text">{item.text}</p>
          <div className="memory__meta">
            <span>
              {item.direction === "IN" ? "Вопрос клиента" : "Ваш ответ"} · {channelName(item.channel)}
              {item.sourceTitle ? ` · ${item.sourceTitle}` : ""} ·{" "}
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </time>
            </span>
            <Link className="memory__link" href={`/chats?conversation=${item.conversationId}`}>
              Открыть диалог
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
