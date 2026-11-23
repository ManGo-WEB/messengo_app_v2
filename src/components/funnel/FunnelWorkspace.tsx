"use client";

// Экран «Воронка» (план D5 п.1 + дополнение владельца 2026-11-22/23):
// канбан-доска с настраиваемыми колонками. Конфигурация этапов (название,
// цвет, порядок) хранится в БД на уровне организации — API
// /api/funnel/stages (GET/POST/PUT, PATCH/DELETE по id).
// Механика доски — по референсу Yougile:
//  — колонку переставляют захватом за grip-иконку (9 точек) в шапке, в любом
//    режиме, мышью и пальцем: клон летит за курсором, в позиции вставки
//    показывается пунктирный слот (та же схема, что у карточек);
//  — карточку при переносе «поднимаем»: клон летит за курсором, колонка
//    целиком не подсвечивается — в позиции вставки показывается пунктирный
//    слот; перенос работает и внутри одной колонки (решение владельца
//    2026-11-23, референс Yougile); декоративные иконки chat/collapse
//    в шапке колонки убраны как непонятные;
//  — захват мышью за другое место доски (вне кнопок, grip и карточек)
//    протаскивает доску по горизонтали; колесо мыши тоже скроллит доску,
//    если колонка под курсором не имеет вертикальной прокрутки;
//  — двойной клик/тап по названию колонки — инлайн-переименование
//    (карандаш в режиме «Редактирование воронки» — запасной путь);
//  — «+» в шапке колонки добавляет сделку вручную (демо-режим: карточка
//    живёт локально, бэкенд сделок — отдельная работа, TODO в mocks.ts).
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
  | { kind: "add-deal"; columnId: string; client: string; price: string }
  | null;

// Палитра для новых колонок (цвет редактируется при добавлении)
const PALETTE = ["#2f80ed", "#27ae60", "#f2994a", "#bb6bd9", "#eb5757", "#14b8c9"];

function DealCardView({
  card,
  onCardStart,
}: {
  card: DealCard;
  onCardStart: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      className="board-card"
      onPointerDown={onCardStart}
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
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null);
  const [boardScrolling, setBoardScrolling] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  // Перетаскивание — pointer-события (pointerdown/pointermove/pointerup),
  // и для колонок (захват за grip), и для карточек — единый код для мыши и
  // пальца. Нативный HTML5 DnD в Chromium ломается, когда
  // скроллируемая доска прокручивается во время перетаскивания
  // (dragover/drop перестают приходить), что особенно заметно на узких окнах,
  // где доска скроллится по горизонтали.
  const [colDragId, setColDragId] = useState<string | null>(null);
  // Позиция вставки переносимой колонки: индекс среди остальных колонок
  const [colOver, setColOver] = useState<{ index: number } | null>(null);
  const [cardDragId, setCardDragId] = useState<string | null>(null);
  // Позиция вставки переносимой карточки: колонка + индекс в её списке
  const [cardOver, setCardOver] = useState<{ col: string; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  // Сохранение названия — общий путь для инлайн-правки (двойной клик по
  // заголовку) и модалки «Переименовать» (карандаш в режиме редактирования)
  const saveColumnLabel = async (id: string, label: string) => {
    setBusy(true);
    try {
      const { stage } = await apiJson<{ stage: Stage }>(`/api/funnel/stages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
      });
      setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, label: stage.label } : s)));
      pushToast({ tone: "success", text: "Название обновлено." });
    } catch (err) {
      pushToast({ tone: "error", text: err instanceof ApiError ? err.message : "Не удалось переименовать колонку." });
    } finally {
      setBusy(false);
    }
  };

  const renameColumn = async () => {
    if (!modal || modal.kind !== "rename" || !modal.label.trim()) return;
    await saveColumnLabel(modal.id, modal.label.trim());
    setModal(null);
  };

  // Инлайн-переименование: Enter/уход фокуса — сохранить, Esc — отменить
  const finishInlineRename = (id: string, original: string, value: string) => {
    setInlineRenameId(null);
    const label = value.trim();
    if (!label || label === original) return;
    void saveColumnLabel(id, label);
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

  /* ---------- добавление сделки вручную (демо, без БД) ---------- */

  // Бэкенда сделок пока нет (TODO в mocks.ts): карточка живёт в состоянии
  // страницы до перезагрузки; формат полей повторяет моки BOARD
  const addDeal = () => {
    if (!modal || modal.kind !== "add-deal") return;
    const client = modal.client.trim();
    if (!client) return;
    const price = Math.max(0, Math.round(Number(modal.price.replace(/\s/g, "")) || 0));
    const card: DealCard = {
      id: `local-${Date.now().toString(36)}`,
      client,
      channel: "telegram",
      price,
      assignee: "Никита",
      tag: "Ручная",
      date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date()),
    };
    const columnId = modal.columnId;
    setColumns((prev) => ({ ...prev, [columnId]: [...(prev[columnId] ?? []), card] }));
    pushToast({ tone: "success", text: "Сделка добавлена (демо-режим, без записи в БД)." });
    setModal(null);
  };

  /* ---------- порядок колонок ---------- */

  // Актуальный порядок для обработчиков событий мыши (без замыканий на рендер).
  // Синхронизируется эффектом при любом изменении stages; applyReorder
  // дополнительно обновляет ref сразу (до следующего рендера).
  const stagesRef = useRef(stages);
  useEffect(() => {
    stagesRef.current = stages;
  }, [stages]);

  const persistOrder = (ids: string[]) => {
    // Порядок сохраняем на сервере; при ошибке — тост и перезагрузка конфигурации
    apiJson("/api/funnel/stages", { method: "PUT", body: JSON.stringify({ ids }) }).catch(() => {
      pushToast({ tone: "error", text: "Не удалось сохранить порядок колонок." });
      loadStages();
    });
  };

  // Перестановка: from/to — индексы в актуальном порядке (stagesRef). Возвращает
  // true, если переставили. persist: false — во время pointer-драга (порядок
  // сохраняется один раз по mouseup).
  const applyReorder = (from: number, to: number, options?: { persist?: boolean }) => {
    const current = stagesRef.current;
    if (from < 0 || to < 0 || to >= current.length || from === to) return false;
    const next = [...current];
    const [movedStage] = next.splice(from, 1);
    next.splice(to, 0, movedStage);
    stagesRef.current = next;
    setStages(next);
    if (options?.persist !== false) persistOrder(next.map((s) => s.id));
    return true;
  };

  // Кнопки ◀ ▶ в режиме редактирования — детерминированный способ переставить
  // колонку (и запасной для тех, кому drag неудобен)
  const shiftColumn = (id: string, delta: number) => {
    const from = stagesRef.current.findIndex((s) => s.id === id);
    applyReorder(from, from + delta);
  };

  // Разовый перенос колонки в позицию index (индекс в пространстве без
  // переносимой колонки — то же пространство, что у слота вставки)
  const moveColumnTo = (id: string, index: number) => {
    const current = stagesRef.current;
    const from = current.findIndex((s) => s.id === id);
    if (from < 0) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
    stagesRef.current = next;
    setStages(next);
    persistOrder(next.map((s) => s.id));
  };

  /* ---------- перетаскивание колонок (pointer-события, стиль Yougile) ---------- */

  // Колонка «поднимается»: клон летит за курсором, исходная колонка убирается
  // из доски, а в позиции вставки показывается пунктирный слот — та же схема,
  // что у карточек
  type ColumnDragSession = {
    id: string;
    startIndex: number;
    targetIndex: number;
    startX: number;
    startY: number;
    ghost: HTMLElement | null;
    onMove: (event: PointerEvent) => void;
    onUp: () => void;
    onCancel: () => void;
  };
  const columnDrag = useRef<ColumnDragSession | null>(null);

  // Слушатели pointer-драга снимаются в onUp каждой сессии; размонтирование
  // посреди драга (выход из аккаунта) оставит слушатели до ближайшего
  // pointerup — обновления стейта несмонтированного компонента React
  // игнорирует, это безопасно.

  // Общие помощники перетаскивания: авто-скролл у краёв доски и колонка под
  // курсором (координаты DOM берём заново на каждое движение — после
  // перестановок раскладка меняется, состояние стабилизируется само)
  const autoScrollBoard = (clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (clientX > rect.right - 48) scroller.scrollLeft += 12;
    else if (clientX < rect.left + 48) scroller.scrollLeft -= 12;
  };

  const columnIdAt = (clientX: number): string | null => {
    const sections = scrollRef.current?.querySelectorAll<HTMLElement>(".board-col");
    for (const section of sections ?? []) {
      const rect = section.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) return section.dataset.stageId ?? null;
    }
    return null;
  };

  // Позиция вставки внутри колонки: сколько карточек целиком выше курсора.
  // Если в колонке уже показан слот вставки, для карточек ниже него
  // компенсируем его высоту — сравнение идёт по «виртуальной» раскладке
  // без слота, иначе индекс дёргается на границах (слот сдвигает карточки)
  const insertionIndexAt = (colId: string, clientY: number): number => {
    const section = scrollRef.current?.querySelector<HTMLElement>(`[data-stage-id="${colId}"]`);
    const slot = section?.querySelector<HTMLElement>(".board-card-slot");
    const slotExtra = slot ? slot.getBoundingClientRect().height + 10 : 0;
    let index = 0;
    for (const card of section?.querySelectorAll<HTMLElement>(".board-col__body .board-card") ?? []) {
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2 - (slot && isAfterSlot(card, slot) ? slotExtra : 0);
      if (clientY > midY) index += 1;
    }
    return index;
  };

  const isAfterSlot = (card: HTMLElement, slot: Element): boolean => {
    let el: Element | null = card;
    while ((el = el.previousElementSibling)) {
      if (el === slot) return true;
    }
    return false;
  };

  // Позиция вставки колонки: сколько колонок целиком левее курсора. Уже
  // показанный слот компенсируется, как у карточек, — сравнение по
  // «виртуальной» раскладке без слота, чтобы индекс не дёргался
  const columnInsertIndexAt = (clientX: number): number => {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const slot = scroller.querySelector<HTMLElement>(".board-col-slot");
    const slotExtra = slot ? slot.getBoundingClientRect().width + 12 : 0;
    let index = 0;
    for (const section of scroller.querySelectorAll<HTMLElement>(".board-col")) {
      const rect = section.getBoundingClientRect();
      const centerX = rect.x + rect.width / 2 - (slot && isAfterSlot(section, slot) ? slotExtra : 0);
      if (clientX > centerX) index += 1;
    }
    return index;
  };

  // Драг стартует только с grip-иконки в шапке — в любом режиме (и вне
  // «Редактирования воронки»); остальная поверхность доски отдана скроллу
  const startColumnDrag = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    // Без preventDefault при движении указателя выделяется текст карточек
    event.preventDefault();

    // Клон-«летун» создаём лениво, при первом заметном сдвиге: клик по grip
    // не должен мигать призраком
    const section = (event.currentTarget as HTMLElement).closest<HTMLElement>(".board-col");
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    let ghost: HTMLElement | null = null;
    const ensureGhost = (x: number, y: number) => {
      if (!ghost) {
        ghost = section.cloneNode(true) as HTMLElement;
        ghost.classList.add("board-col--ghost");
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.appendChild(ghost);
        session.ghost = ghost;
      }
      ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(2.5deg)`;
    };

    const startIndex = stagesRef.current.findIndex((s) => s.id === id);

    const session: ColumnDragSession = {
      id,
      startIndex,
      targetIndex: Math.max(0, startIndex),
      startX: event.clientX,
      startY: event.clientY,
      ghost: null,
      onMove: (move) => {
        if (Math.abs(move.clientX - session.startX) > 3 || Math.abs(move.clientY - session.startY) > 3) {
          ensureGhost(move.clientX, move.clientY);
        }
        autoScrollBoard(move.clientX);
        const index = columnInsertIndexAt(move.clientX);
        if (index !== session.targetIndex) {
          session.targetIndex = index;
          setColOver({ index });
        }
      },
      onUp: () => {
        window.removeEventListener("pointermove", session.onMove);
        window.removeEventListener("pointerup", session.onUp);
        window.removeEventListener("pointercancel", session.onCancel);
        ghost?.remove();
        columnDrag.current = null;
        setColDragId(null);
        setColOver(null);
        // Перестановку применяем один раз при сбросе и сохраняем одним PUT
        if (session.targetIndex !== session.startIndex) moveColumnTo(session.id, session.targetIndex);
      },
      // Жест прерван системой (входящий звонок и т.п.) — применяем так же:
      // позиция уже показана слотом, сервер не должен с ней расходиться
      onCancel: () => session.onUp(),
    };
    columnDrag.current = session;
    setColDragId(id);
    window.addEventListener("pointermove", session.onMove);
    window.addEventListener("pointerup", session.onUp);
    window.addEventListener("pointercancel", session.onCancel);
  };

  /* ---------- перетаскивание карточек (pointer-события, стиль Yougile) ---------- */

  // Карточка «поднимается»: клон летит за курсором, исходная карточка
  // исчезает из колонки (фильтруется при рендере), а в позиции вставки
  // показывается пунктирный слот. Колонка целиком не подсвечивается
  type CardDragSession = {
    cardId: string;
    columnId: string;
    startIndex: number;
    targetCol: string;
    targetIndex: number;
    startX: number;
    startY: number;
    ghost: HTMLElement | null;
    onMove: (event: PointerEvent) => void;
    onUp: () => void;
    onCancel: () => void;
  };
  const cardDrag = useRef<CardDragSession | null>(null);

  // Перенос карточки в позицию index колонки toCol. Индекс приходит из
  // видимого списка (без переносимой карточки), поэтому после удаления
  // карточки из исходной колонки вставка идёт напрямую в index
  const moveCardTo = (cardId: string, fromCol: string, toCol: string, index: number) => {
    setColumns((prev) => {
      const card = (prev[fromCol] ?? []).find((c) => c.id === cardId);
      if (!card) return prev;
      const next = { ...prev };
      if (fromCol === toCol) {
        const rest = (prev[fromCol] ?? []).filter((c) => c.id !== cardId);
        rest.splice(Math.max(0, Math.min(index, rest.length)), 0, card);
        next[fromCol] = rest;
        return next;
      }
      next[fromCol] = (prev[fromCol] ?? []).filter((c) => c.id !== cardId);
      const target = [...(prev[toCol] ?? [])];
      target.splice(Math.max(0, Math.min(index, target.length)), 0, card);
      next[toCol] = target;
      return next;
    });
  };

  const startCardDrag = (event: React.PointerEvent, columnId: string, cardId: string) => {
    if (editing || event.button !== 0) return;
    // Только мышь: на touch палец на карточке должен скроллить тело колонки
    // по вертикали, а не тащить карточку
    if (event.pointerType !== "mouse") return;
    event.preventDefault();

    // Клон-«летун» создаём лениво, при первом заметном сдвиге: простой клик
    // по карточке не должен мигать призраком
    const source = event.currentTarget as HTMLElement;
    const rect = source.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    let ghost: HTMLElement | null = null;
    const ensureGhost = (x: number, y: number) => {
      if (!ghost) {
        ghost = source.cloneNode(true) as HTMLElement;
        ghost.classList.add("board-card--ghost");
        ghost.style.width = `${rect.width}px`;
        document.body.appendChild(ghost);
        session.ghost = ghost;
      }
      ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(2.5deg)`;
    };

    const startIndex = Math.max(0, (columns[columnId] ?? []).findIndex((c) => c.id === cardId));

    const session: CardDragSession = {
      cardId,
      columnId,
      startIndex,
      targetCol: columnId,
      targetIndex: startIndex,
      startX: event.clientX,
      startY: event.clientY,
      ghost: null,
      onMove: (move) => {
        if (Math.abs(move.clientX - session.startX) > 3 || Math.abs(move.clientY - session.startY) > 3) {
          ensureGhost(move.clientX, move.clientY);
        }
        autoScrollBoard(move.clientX);
        const target = columnIdAt(move.clientX);
        if (!target) return;
        const index = insertionIndexAt(target, move.clientY);
        if (target !== session.targetCol || index !== session.targetIndex) {
          session.targetCol = target;
          session.targetIndex = index;
          setCardOver({ col: target, index });
        }
      },
      onUp: () => {
        window.removeEventListener("pointermove", session.onMove);
        window.removeEventListener("pointerup", session.onUp);
        window.removeEventListener("pointercancel", session.onCancel);
        ghost?.remove();
        cardDrag.current = null;
        setCardDragId(null);
        setCardOver(null);
        if (session.targetCol !== session.columnId || session.targetIndex !== session.startIndex) {
          moveCardTo(session.cardId, session.columnId, session.targetCol, session.targetIndex);
        }
      },
      onCancel: () => session.onUp(),
    };
    cardDrag.current = session;
    setCardDragId(cardId);
    window.addEventListener("pointermove", session.onMove);
    window.addEventListener("pointerup", session.onUp);
    window.addEventListener("pointercancel", session.onCancel);
  };

  /* ---------- drag-скролл доски мышью и колесо ---------- */

  // Захват мышью за «пустое» место доски (фон, шапка колонки, тело колонки
  // вне карточек) протаскивает доску по горизонтали — как в Yougile.
  // Touch не перехватываем: на телефоне доска скроллится нативным свайпом.
  type ScrollDragSession = {
    startX: number;
    startScrollLeft: number;
    active: boolean;
    onMove: (event: PointerEvent) => void;
    onUp: () => void;
  };
  const scrollDrag = useRef<ScrollDragSession | null>(null);

  const startBoardScrollDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    // Кнопки, поля и карточки — не скролл (у карточек и grip свой драг)
    if (target.closest("button, input, textarea, a, .board-card")) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    const session: ScrollDragSession = {
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      active: false,
      onMove: (move) => {
        const dx = move.clientX - session.startX;
        if (!session.active) {
          // Пока сдвиг меньше порога, это ещё клик — не мешаем ему
          if (Math.abs(dx) < 4) return;
          session.active = true;
          setBoardScrolling(true);
        }
        scroller.scrollLeft = session.startScrollLeft - dx;
      },
      onUp: () => {
        window.removeEventListener("pointermove", session.onMove);
        window.removeEventListener("pointerup", session.onUp);
        window.removeEventListener("pointercancel", session.onUp);
        scrollDrag.current = null;
        if (!session.active) return;
        setBoardScrolling(false);
        // Гасим клик, следующий за протаскиванием, чтобы отпускание кнопки
        // не «нажало» что-нибудь под курсором
        const swallow = (click: MouseEvent) => {
          click.preventDefault();
          click.stopPropagation();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      },
    };
    scrollDrag.current = session;
    window.addEventListener("pointermove", session.onMove);
    window.addEventListener("pointerup", session.onUp);
    window.addEventListener("pointercancel", session.onUp);
  };

  // Колесо мыши скроллит доску по горизонтали — но если тело колонки под
  // курсором имеет вертикальную прокрутку, колесо остаётся ей. React вешает
  // onWheel пассивно (там preventDefault запрещён), поэтому нативный слушатель.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const body = (event.target as HTMLElement).closest<HTMLElement>(".board-col__body");
      if (body && body.scrollHeight > body.clientHeight + 1) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  const modalStage = modal?.kind === "delete" ? stages.find((s) => s.id === modal.id) : undefined;
  const modalCardsCount = modal?.kind === "delete" ? cardsOf(modal.id).length : 0;

  // Переносимая колонка «поднята» — из доски её убираем; позиции в этом
  // списке используются слотом вставки
  const visibleStages = colDragId ? stages.filter((s) => s.id !== colDragId) : stages;

  return (
    <div
      className={`board ${colDragId ? "is-col-dragging" : ""} ${cardDragId ? "is-card-dragging" : ""} ${
        boardScrolling ? "is-scrolling" : ""
      }`}
    >
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

      <div className="board__scroll" ref={scrollRef} onPointerDown={startBoardScrollDrag}>
        <div className="board__row">
          {stages.map((col, index) => {
            // «Поднятая» колонка летит клоном — в доске её не рисуем
            if (colDragId === col.id) return null;
            const vi = visibleStages.indexOf(col);
            const cards = cardsOf(col.id);
            const sum = cards.reduce((s, c) => s + c.price, 0);
            const over = cardOver && cardOver.col === col.id ? cardOver : null;
            // Переносимая карточка «поднята» — из списка колонки её убираем
            const visibleCards = cardDragId ? cards.filter((c) => c.id !== cardDragId) : cards;
            return (
              <Fragment key={col.id}>
              {colOver && colOver.index === vi && <div className="board-col-slot" aria-hidden="true" />}
              <section
                data-stage-id={col.id}
                className={`board-col ${over ? "is-over" : ""}`}
              >
                <header className="board-col__head">
                  <button
                    className="board-col__grip"
                    title="Перетащите, чтобы переставить колонку"
                    aria-label="Перетащить колонку"
                    type="button"
                    onPointerDown={(e) => startColumnDrag(e, col.id)}
                  >
                    <Icon name="grip" size={14} />
                  </button>
                  <div className="board-col__meta">
                    <div className="board-col__title" title={col.label}>
                      {inlineRenameId === col.id ? (
                        <Input
                          className="board-col__input"
                          defaultValue={col.label}
                          autoFocus
                          maxLength={100}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => finishInlineRename(col.id, col.label, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setInlineRenameId(null);
                          }}
                        />
                      ) : (
                        <span
                          className="board-col__label"
                          title="Двойной клик — переименовать"
                          onDoubleClick={() => setInlineRenameId(col.id)}
                        >
                          {col.label}
                        </span>
                      )}
                    </div>
                    <div className="board-col__count">
                      {cards.length ? `${sum ? money(sum) : ""} · ${cards.length} шт.` : "0 из 0"}
                    </div>
                  </div>
                  <div className="board-col__acts">
                    <button
                      className="board-col__act"
                      title="Добавить сделку"
                      type="button"
                      onClick={() => setModal({ kind: "add-deal", columnId: col.id, client: "", price: "" })}
                    >
                      <Icon name="plus" size={15} />
                    </button>
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
                    ) : null}
                  </div>
                </header>
                <div className="board-col__bar" style={{ background: col.color }} />
                <div className="board-col__body">
                  {visibleCards.map((c, i) => (
                    <Fragment key={c.id}>
                      {over && over.index === i && <div className="board-card-slot" aria-hidden="true" />}
                      <DealCardView card={c} onCardStart={(e) => startCardDrag(e, col.id, c.id)} />
                    </Fragment>
                  ))}
                  {over && over.index >= visibleCards.length && <div className="board-card-slot" aria-hidden="true" />}
                  {!visibleCards.length && !over && (
                    <div className="board-col__empty">
                      <Icon name="folder" size={44} />
                      <p>Перетащите существующую сделку в этот этап</p>
                    </div>
                  )}
                </div>
              </section>
              </Fragment>
            );
          })}

          {colOver && colOver.index >= visibleStages.length && <div className="board-col-slot" aria-hidden="true" />}

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

      {/* Добавление сделки вручную (демо-режим) */}
      <Modal
        open={modal?.kind === "add-deal"}
        onClose={() => setModal(null)}
        title="Новая сделка"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Отмена
            </Button>
            <Button onClick={addDeal} disabled={!modal || modal.kind !== "add-deal" || !modal.client.trim()}>
              Добавить
            </Button>
          </>
        }
      >
        <div className="board-modal-field">
          <label htmlFor="board-add-deal-client">Имя клиента</label>
          <Input
            id="board-add-deal-client"
            value={modal?.kind === "add-deal" ? modal.client : ""}
            onChange={(e) => setModal((prev) => (prev?.kind === "add-deal" ? { ...prev, client: e.target.value } : prev))}
            maxLength={100}
            placeholder="например, Анна Смирнова"
          />
        </div>
        <div className="board-modal-field">
          <label htmlFor="board-add-deal-price">Сумма, ₽</label>
          <Input
            id="board-add-deal-price"
            type="number"
            min={0}
            value={modal?.kind === "add-deal" ? modal.price : ""}
            onChange={(e) => setModal((prev) => (prev?.kind === "add-deal" ? { ...prev, price: e.target.value } : prev))}
            placeholder="0"
          />
        </div>
        <p className="board-modal-text board-modal-note">
          Демо-режим: сделка не сохраняется в базе — бэкенд сделок ещё не подключён.
        </p>
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
