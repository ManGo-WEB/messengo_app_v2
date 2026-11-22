// Общие константы и валидация для API этапов воронки (GET/POST/PUT и [id]).
import { ValidationError } from "../../../../server/auth/validate";

// Дефолтные этапы воронки — из прототипа (design/prototype/src/data/mock.js,
// раздел FUNNEL). Засеиваются организации при первом GET.
export const DEFAULT_STAGES = [
  { label: "Непринятые диалоги", color: "#eb5757" },
  { label: "Первичный контакт", color: "#27ae60" },
  { label: "Вторичный контакт", color: "#f2994a" },
  { label: "Принимает решение", color: "#bb6bd9" },
  { label: "Успешно завершено", color: "#2f80ed" },
  { label: "Не успешно завершено", color: "#eb5757" },
  { label: "Спам", color: "#eb5757" },
];

const COLOR_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

export function parseStageColor(value: unknown): string {
  if (typeof value !== "string" || !COLOR_RE.test(value)) {
    throw new ValidationError("Цвет — hex-код вида #2F80ED.");
  }
  return value.toLowerCase();
}
