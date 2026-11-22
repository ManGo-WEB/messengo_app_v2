"use client";

// Экран «Воронка» (план D5 п.1 + дополнение владельца 2026-11-22):
// канбан-доска с настраиваемыми колонками. Конфигурация этапов (название,
// цвет, порядок) хранится в БД на уровне организации — API
// /api/funnel/stages (GET/POST/PUT, PATCH/DELETE по id). Пользователь
// строит воронку под себя: добавляет колонки, переименовывает, удаляет
// (с подтверждением), переставляет перетаскиванием — режим
// «Редактирование воронки».
// Сделки — демо-данные (моки, раскладываются по позициям этапов);
// бэкенд сделок — отдельная работа (TODO в mocks.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../icons/Icon";
import ChannelIcon from "../icons/ChannelIcon";
import { Avatar, Badge, Button, FilterChip, Input, Modal, Toast, ToastStack, type ToastTone } from "../ui";
import { ApiError, apiJson } from "@/lib/api-client";
import { BOARD, FUNNEL, type DealCard } from "../../app/(app)/funnel/mocks";
import { money } from "./format";
import "./funnel.css";

const FILTERS = ["Каналы", "Источники", "Статус воронки", "Ответственный", "Теги", "Дата", "Тип обращения"];

// Этап воронки (серверная конфигурация колонки)
type Stage = { id: string; label: string; color: string };

type ToastItem = { id: number; tone: ToastTone; text: string };

type ModalState =
  | { kind: "add"; label: string; color: string }
  | { kind: "rename"; id: string; label: string }
  | { kind: "delete"; id: string }
  | null;

// Палитра для новых колонок (цвет редактируется при добавлении)
const PALETTE = ["#2f80ed", "#27ae60", "#f2994a", "#bb6bd9", "#eb5757", "#14b8c9"];

function DealCardView({ card, draggable, onDragStart }: { card: DealCard; draggable: boolean; onDragStart?: (id: string) => void }) {
  return (
    <div
      className="board-card"
      draggable={draggable}
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
  // Пока данные не загружены — дефолтные этапы прототипа (SSR и первый кадр),
  // карточки разложены по их id из моков.
  const [stages, setStages] = useState<Stage[]>(FUNNEL.map((s) => ({ id: s.id, label: s.label, color: s.color })));
  const [columns, setColumns] = useState<Record<string, DealCard[]>>(BOARD);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  // Перетаскивание: карточек (dragOver._cardId) и колонок целиком (dragColId)
  const [dragOver, setDragOver] = useState<{ _cardId?: string; col: string } | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  // Загрузка конфигурации колонок с сервера. Демо-карточки раскладываем по
  // позициям этапов (порядок ключей BOARD совпадает с дефолтным FUNNEL) —
  // так доска выглядит живой при любой настройке колонок; сделки — моки
  // (TODO: бэкенд сделок).
  const loadStages = useCallback(() => {
    interface StagesResponse {
      stages: Stage[];
    }
    apiJson<StagesResponse>("/api/funnel/stages")
      .then((data) => {
        setStages(data.stages);
        const defaultKeys = Object.keys(BOARD);
        setColumns(Object.fromEntries(data.stages.map((stage, index) => [stage.id, BOARD[defaultKeys[index]] ?? []])));
      })
      .catch(() => pushToast({ tone: "error", text: "Не удалось загрузить колонки воронки." }));
  }, [pushToast]);

  useEffect(() => {
    void loadStages();
  }, [loadStages]);

  const cardsOf = (stageId: string) => columns[stageId] ?? [];

  /* ---------- действия над колонками ---------- */

  const addColumn = async () => {
    if (!modal || modal.kind !== "add") return;
    setBusy(true);
    try {
      const { stage } = await apiJson<{ stage: Stage }>("/api/funnel/stages", {
        method: "POST",
        body: JSON.stringify({ label: modal.label, color: modal.color }),
      });
      setStages((prev) => [...prev, stage]);
      setColumns((prev) => ({ ...prev, [stage.id]: [] }));
      pushToast({ tone: "success", text: "Колонка добавлена." });
      setModal(null);
    } catch (err) {
      pushToast({ tone: "error", text: err instanceof ApiError ? err.message : "Не удалось добавить колонку." });
    } finally {
      setBusy(false);
    }
  };

  const renameColumn = async () => {
    if (!modal || modal.kind !== "rename") return;
    setBusy(true);
    try {
      const { stage } = await apiJson<{ stage: Stage }>(`/api/funnel/stages/${modal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: modal.label }),
      });
      setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, label: stage.label } : s)));
      pushToast({ tone: "success", text: "Название обновлено." });
      setModal(null);
    } catch (err) {
      pushToast({ tone: "error", text: err instanceof ApiError ? err.message : "Не удалось переименовать колонку." });
    } finally {
      setBusy(false);
    }
  };

  const deleteColumn = async () => {
    if (!modal || modal.kind !== "delete") return;
    const id = modal.id;
    setBusy(true);
    try {
      await apiJson(`/api/funnel/stages/${id}`, { method: "DELETE" });
      setStages((prev) => prev.filter((s) => s.id !== id));
      setColumns((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      pushToast({ tone: "success", text: "Колонка удалена." });
      setModal(null);
    } catch (err) {
      pushToast({ tone: "error", text: err instanceof ApiError ? err.message : "Не удалось удалить колонку." });
      setModal(null);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- порядок колонок ---------- */

  const reorderStages = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= stages.length || from === to) return;
    const next = [...stages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setStages(next);
    // Порядок сохраняем на сервере; при ошибке — тост и перезагрузка конфигурации
    apiJson("/api/funnel/stages", { method: "PUT", body: JSON.stringify({ ids: next.map((s) => s.id) }) }).catch(() => {
      pushToast({ tone: "error", text: "Не удалось сохранить порядок колонок." });
      loadStages();
    });
  };

  // Бросок колонки на другую — вставка перед целью
  const moveColumn = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    reorderStages(
      stages.findIndex((s) => s.id === dragId),
      stages.findIndex((s) => s.id === targetId),
    );
  };

  // Кнопки ◀ ▶ в режиме редактирования — детерминированный способ переставить
  // колонку (и запасной для тех, кому drag неудобен)
  const shiftColumn = (id: string, delta: number) => {
    const from = stages.findIndex((s) => s.id === id);
    reorderStages(from, from + delta);
  };

  /* ---------- перетаскивание карточек (как в прототипе) ---------- */

  const dropCard = (columnId: string) => {
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

  const modalStage = modal?.kind === "delete" ? stages.find((s) => s.id === modal.id) : undefined;
  const modalCardsCount = modal?.kind === "delete" ? cardsOf(modal.id).length : 0;

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
        <Button
          variant={editing ? "primary" : "outline"}
          size="sm"
          icon="gear"
          onClick={() => setEditing((prev) => !prev)}
        >
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
          {stages.map((col, index) => {
            const cards = cardsOf(col.id);
            const sum = cards.reduce((s, c) => s + c.price, 0);
            const isOver = dragColId ? dragColId !== col.id && dragOver?.col === col.id : dragOver?.col === col.id;
            return (
              <section
                key={col.id}
                className={`board-col ${isOver ? "is-over" : ""} ${dragColId === col.id ? "is-dragging" : ""}`}
                draggable={editing}
                onDragStart={(e) => {
                  if (!editing) return;
                  e.dataTransfer.effectAllowed = "move";
                  setDragColId(col.id);
                }}
                onDragEnd={() => setDragColId(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver((prev) => ({ _cardId: prev?._cardId, col: col.id }));
                }}
                onDragEnter={() => setDragOver((prev) => ({ _cardId: prev?._cardId, col: col.id }))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragColId) moveColumn(dragColId, col.id);
                  else dropCard(col.id);
                  setDragColId(null);
                }}
              >
                <header className="board-col__head">
                  <div>
                    <div className="board-col__title">
                      {editing && (
                        <span className="board-col__draghint" title="Перетащите, чтобы переставить колонку">
                          <Icon name="collapse" size={12} />
                        </span>
                      )}
                      {col.label}
                    </div>
                    <div className="board-col__count">
                      {cards.length ? `${sum ? money(sum) : ""} · ${cards.length} шт.` : "0 из 0"}
                    </div>
                  </div>
                  <div className="board-col__acts">
                    {editing ? (
                      <>
                        <button
                          className="board-col__act"
                          title="Сдвинуть колонку влево"
                          type="button"
                          disabled={index === 0}
                          onClick={() => shiftColumn(col.id, -1)}
                        >
                          <Icon name="chevronLeft" size={15} />
                        </button>
                        <button
                          className="board-col__act"
                          title="Сдвинуть колонку вправо"
                          type="button"
                          disabled={index === stages.length - 1}
                          onClick={() => shiftColumn(col.id, 1)}
                        >
                          <Icon name="chevronRight" size={15} />
                        </button>
                        <button
                          className="board-col__act"
                          title="Переименовать колонку"
                          type="button"
                          onClick={() => setModal({ kind: "rename", id: col.id, label: col.label })}
                        >
                          <Icon name="pencil" size={15} />
                        </button>
                        <button
                          className="board-col__act board-col__act--danger"
                          title="Удалить колонку"
                          type="button"
                          onClick={() => setModal({ kind: "delete", id: col.id })}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <Icon name="chat" size={15} />
                        <Icon name="collapse" size={15} />
                      </>
                    )}
                  </div>
                </header>
                <div className="board-col__bar" style={{ background: col.color }} />
                <div className="board-col__body">
                  {cards.map((c) => (
                    <DealCardView key={c.id} card={c} draggable={!editing} onDragStart={(id) => setDragOver({ _cardId: id, col: col.id })} />
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

          {editing && (
            <button className="board__add-col" type="button" onClick={() => setModal({ kind: "add", label: "", color: PALETTE[0] })}>
              <Icon name="plus" size={18} />
              Добавить колонку
            </button>
          )}
        </div>
      </div>

      {/* Добавление колонки: название + цвет из палитры */}
      <Modal
        open={modal?.kind === "add"}
        onClose={() => setModal(null)}
        title="Новая колонка"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Отмена
            </Button>
            <Button onClick={() => void addColumn()} disabled={busy || !modal || modal.kind !== "add" || !modal.label.trim()}>
              Добавить
            </Button>
          </>
        }
      >
        <div className="board-modal-field">
          <label htmlFor="board-add-label">Название колонки</label>
          <Input
            id="board-add-label"
            value={modal?.kind === "add" ? modal.label : ""}
            onChange={(e) => setModal((prev) => (prev?.kind === "add" ? { ...prev, label: e.target.value } : prev))}
            maxLength={100}
            placeholder="например, Холодные лиды"
          />
        </div>
        <div className="board-modal-field">
          <label>Цвет полоски</label>
          <div className="board-colors">
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`board-color ${modal?.kind === "add" && modal.color === color ? "is-selected" : ""}`}
                style={{ background: color }}
                title={color}
                onClick={() => setModal((prev) => (prev?.kind === "add" ? { ...prev, color } : prev))}
              />
            ))}
          </div>
        </div>
      </Modal>

      {/* Переименование колонки */}
      <Modal
        open={modal?.kind === "rename"}
        onClose={() => setModal(null)}
        title="Переименовать колонку"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Отмена
            </Button>
            <Button onClick={() => void renameColumn()} disabled={busy || !modal || modal.kind !== "rename" || !modal.label.trim()}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="board-modal-field">
          <label htmlFor="board-rename-label">Название колонки</label>
          <Input
            id="board-rename-label"
            value={modal?.kind === "rename" ? modal.label : ""}
            onChange={(e) => setModal((prev) => (prev?.kind === "rename" ? { ...prev, label: e.target.value } : prev))}
            maxLength={100}
          />
        </div>
      </Modal>

      {/* Удаление колонки с подтверждением */}
      <Modal
        open={modal?.kind === "delete"}
        onClose={() => setModal(null)}
        title="Удалить колонку?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Отмена
            </Button>
            <Button onClick={() => void deleteColumn()} disabled={busy}>
              Удалить
            </Button>
          </>
        }
      >
        <p className="board-modal-text">
          Колонка «{modalStage?.label ?? ""}» будет удалена из воронки вашей организации.
          {modalCardsCount > 0 && " В колонке есть сделки (демо-данные) — они будут удалены вместе с ней."}
        </p>
      </Modal>

      <ToastStack>
        {toasts.map((toast) => (
          <Toast key={toast.id} tone={toast.tone} onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
            {toast.text}
          </Toast>
        ))}
      </ToastStack>
    </div>
  );
}
