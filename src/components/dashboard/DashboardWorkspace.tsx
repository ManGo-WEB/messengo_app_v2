"use client";

// Дашборд — главная после входа (план D5 п.2): сводка по данным Inbox —
// всего диалогов, ожидают ответа, новых за сегодня и SLA первого ответа.
// Счётчики живые: GET /api/stats/summary при открытии, автопродление каждые
// 30 секунд (у Inbox тот же подход к фоллбеку) и кнопка «Обновить».
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "../icons/Icon";
import { Button, EmptyState, InfoBanner } from "../ui";
import "./dashboard.css";

type StatsSummary = {
  total: number;
  awaiting: number;
  newToday: number;
  avgFirstResponseMinutes: number | null;
  sla1hPercent: number | null;
};

function formatResponseTime(minutes: number): string {
  if (minutes < 1) return "меньше минуты";
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export default function DashboardWorkspace() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState("");

  // setState — только в then/catch: правило react-hooks запрещает
  // синхронный setState в эффекте (каскадные рендеры), тот же стиль, что в
  // InboxWorkspace.loadList.
  const load = useCallback(() => {
    fetch("/api/stats/summary")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<StatsSummary>;
      })
      .then((data) => {
        setStats(data);
        setError("");
      })
      .catch(() => setError("Не удалось загрузить счётчики."));
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const cards: Array<{ icon: IconName; label: string; value: string; tone?: string }> = [
    { icon: "chat", label: "Всего диалогов", value: stats ? String(stats.total) : "…" },
    { icon: "bell", label: "Ожидают ответа", value: stats ? String(stats.awaiting) : "…", tone: "dash-card__value--warn" },
    { icon: "plus", label: "Новые за сегодня", value: stats ? String(stats.newToday) : "…" },
    {
      icon: "clock",
      label: "Среднее время первого ответа",
      value: stats ? (stats.avgFirstResponseMinutes == null ? "нет данных" : formatResponseTime(stats.avgFirstResponseMinutes)) : "…",
    },
    {
      icon: "percent",
      label: "Первый ответ в течение часа",
      value: stats ? (stats.sla1hPercent == null ? "нет данных" : `${stats.sla1hPercent}%`) : "…",
    },
  ];

  return (
    <div className="dash">
      <div className="dash__head">
        <h1 className="page-title">Дашборд</h1>
        <Button variant="outline" size="sm" icon="bolt" onClick={() => void load()}>
          Обновить
        </Button>
      </div>
      {error && <InfoBanner tone="danger">{error}</InfoBanner>}
      <div className="dash__grid">
        {cards.map((card) => (
          <div key={card.label} className="card dash-card">
            <span className="dash-card__ic">
              <Icon name={card.icon} size={18} />
            </span>
            <span className={`dash-card__value ${card.tone ?? ""}`}>{card.value}</span>
            <span className="dash-card__label">{card.label}</span>
          </div>
        ))}
      </div>
      {stats && stats.total === 0 && (
        <EmptyState
          icon="chat"
          title="Диалогов пока нет"
          text="Подключите канал связи и напишите себе через него — счётчики появятся автоматически."
        />
      )}
      <div className="dash__links">
        <Link className="dash-link" href="/chats">
          <Icon name="chat" size={16} />
          Открыть чаты
        </Link>
        <Link className="dash-link" href="/channels">
          <Icon name="send" size={16} />
          Каналы связи
        </Link>
      </div>
    </div>
  );
}
