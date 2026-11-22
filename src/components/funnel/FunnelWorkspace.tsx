"use client";

// Экран «Воронка» (план D5 п.1): канбан-доска со сделками на моках прототипа
// (design/prototype/src/pages/BoardPage.jsx). Перетаскивание карточек между
// колонками — локальный стейт (dataTransfer). Данные моковые — связка с
// диалогами Inbox появится вместе с бэкендом воронки (TODO).
import { useState } from "react";
import Icon from "../icons/Icon";
import ChannelIcon from "../icons/ChannelIcon";
import { Avatar, Badge, Button, FilterChip } from "../ui";
import { BOARD, FUNNEL, type DealCard } from "../../app/(app)/funnel/mocks";
import { money } from "./format";
import "./funnel.css";

const FILTERS = ["Каналы", "Источники", "Статус воронки", "Ответственный", "Теги", "Дата", "Тип обращения"];

function DealCardView({ card, onDragStart }: { card: DealCard; onDragStart?: (id: string) => void }) {
  return (
    <div
      className="board-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(card.id);
      }}
    >
      <div className="board-card__top">
        <Avatar name={card.client} size={26} />
        <span className="board-card__name">{card.client}</span>
        <span className="board-card__date">{card.date}</span>
        <Icon name="checks" size={14} className="board-card__checks" />
      </div>
      <div className="board-card__row">
        <ChannelIcon id={card.channel} size={16} />
        <span className="board-card__price">{money(card.price)}</span>
      </div>
      <div className="board-card__row board-card__assignee">
        <Icon name="user" size={14} />
        <span>{card.assignee}</span>
      </div>
      <Badge tone="gray" className="board-card__tag">
        <Icon name="spark" size={11} />
        {card.tag}
      </Badge>
    </div>
  );
}

export default function FunnelWorkspace() {
  const [columns, setColumns] = useState<Record<string, DealCard[]>>(BOARD);
  const [dragOver, setDragOver] = useState<{ _cardId?: string; col: string } | null>(null);

  const drop = (columnId: string) => {
    const cardId = dragOver?._cardId;
    if (!cardId) return;
    setColumns((prev) => {
      const next: Record<string, DealCard[]> = {};
      let moved: DealCard | null = null;
      for (const [colId, cards] of Object.entries(prev)) {
        next[colId] = cards.filter((c) => {
          if (c.id === cardId) {
            moved = c;
            return false;
          }
          return true;
        });
      }
      if (moved) next[columnId] = [moved, ...next[columnId]];
      return next;
    });
    setDragOver(null);
  };

  return (
    <div className="board">
      <div className="board__toolbar">
        <button className="board__funnel" title="Фильтры" type="button">
          <Icon name="filter" size={16} />
        </button>
        <div className="board__chips">
          {FILTERS.map((f) => (
            <FilterChip key={f} label={f} />
          ))}
        </div>
        <Button variant="outline" size="sm" icon="bolt">
          Массовые действия
        </Button>
        <Button variant="outline" size="sm" icon="headset">
          Триггеры
        </Button>
        <Button variant="outline" size="sm" icon="gear">
          Редактирование воронки
        </Button>
        <button className="board__eye" title="Скрыть пустые этапы" type="button">
          <Icon name="eyeOff" size={16} />
        </button>
        <Button variant="success" size="sm" icon="download">
          Скачать в XLS
        </Button>
      </div>

      <div className="board__scroll">
        <div className="board__row">
          {FUNNEL.map((col) => {
            const cards = columns[col.id] || [];
            const sum = cards.reduce((s, c) => s + c.price, 0);
            return (
              <section
                key={col.id}
                className={`board-col ${dragOver?.col === col.id ? "is-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver((prev) => ({ _cardId: prev?._cardId, col: col.id }));
                }}
                onDragEnter={() => setDragOver((prev) => ({ _cardId: prev?._cardId, col: col.id }))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(col.id);
                }}
              >
                <header className="board-col__head">
                  <div>
                    <div className="board-col__title">{col.label}</div>
                    <div className="board-col__count">
                      {cards.length ? `${sum ? money(sum) : ""} · ${cards.length} шт.` : "0 из 0"}
                    </div>
                  </div>
                  <div className="board-col__acts">
                    <Icon name="chat" size={15} />
                    <Icon name="collapse" size={15} />
                  </div>
                </header>
                <div className="board-col__bar" style={{ background: col.color }} />
                <div className="board-col__body">
                  {cards.map((c) => (
                    <DealCardView key={c.id} card={c} onDragStart={(id) => setDragOver({ _cardId: id, col: col.id })} />
                  ))}
                  {!cards.length && (
                    <div className="board-col__empty">
                      <Icon name="folder" size={44} />
                      <p>Перетащите существующую сделку в этот этап</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
