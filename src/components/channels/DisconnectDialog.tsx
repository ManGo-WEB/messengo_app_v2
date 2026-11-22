"use client";

// Подтверждение отключения канала (план D3 п.3). Для Meta после отключения
// возвращается ссылка на флоу удаления данных (B4) — показываем оператору.
// Рендерится условно (workspace) — состояние свежее на маунте.
import { useCallback, useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { ApiError, apiJson } from "../../lib/api-client";
import { channelName } from "./labels";
import type { ConnectionRow, ToastItem } from "./types";

export default function DisconnectDialog({
  connection,
  onClose,
  onDisconnected,
  pushToast,
}: {
  connection: ConnectionRow;
  onClose: () => void;
  onDisconnected: () => void;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiJson<{ status: string; dataDeletionUrl?: string }>(
        `/api/channels/${connection.id}`,
        { method: "DELETE" },
      );
      onDisconnected();
      pushToast({
        tone: "success",
        text: `${channelName(connection.type)} «${connection.externalName}» отключён.`,
      });
      if (result.dataDeletionUrl) {
        pushToast({
          tone: "info",
          text: "Meta: при необходимости запросите удаление данных оператора по ссылке.",
          link: { href: result.dataDeletionUrl, label: "Открыть" },
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "Подключение уже не существует."
          : "Не удалось отключить канал. Попробуйте ещё раз.",
      );
      setBusy(false);
    }
  }, [connection, onDisconnected, pushToast]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Отключить канал?"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            Отключить
          </Button>
        </>
      }
    >
      <p className="ch-dlg__text">
        Канал <b>{channelName(connection.type)} «{connection.externalName}»</b> перестанет получать и
        отправлять сообщения. История диалогов останется в системе. Подключить канал снова можно в
        любой момент — это новый сеанс подключения.
      </p>
      {(connection.type === "FACEBOOK" || connection.type === "INSTAGRAM") && (
        <p className="ch-dlg__text">
          Данные оператора у Meta можно удалить по ссылке, которую мы покажем после отключения.
        </p>
      )}
      {error && <p className="ch-dlg__error">{error}</p>}
    </Modal>
  );
}
