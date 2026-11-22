"use client";

// Диалог подключения ВКонтакте (план D3 п.2, механика V1 vk-dialog/vk-onboarding):
// OAuth-редирект → выбор сообщества из списка админ-сообществ → разрешение
// сообществу писать (второй OAuth-переход, уже за пользователя делает бэкенд).
// Рендерится условно (workspace), поэтому состояние всегда «свежее» на маунте.
import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Select from "../ui/Select";
import Modal from "../ui/Modal";
import { ApiError, apiJson } from "../../lib/api-client";
import { apiErrorText } from "./labels";

type CommunityItem = { id: string; name: string };

// Чистая загрузка сообществ — setState только в колбэках вызывающей стороны
const fetchCommunities = async (
  connectionId: string,
  offset: number,
): Promise<{ ok: true; items: CommunityItem[]; nextOffset: number | null } | { ok: false; message: string }> => {
  try {
    const data = await apiJson<{ items: CommunityItem[]; nextOffset: number | null }>(
      `/api/channels/vk/communities?connectionId=${encodeURIComponent(connectionId)}&offset=${offset}`,
    );
    return { ok: true, items: data.items, nextOffset: data.nextOffset };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? apiErrorText(error.message) : "Не удалось загрузить список сообществ.",
    };
  }
};

export default function VkConnectDialog({
  pendingConnectionId,
  onClose,
}: {
  /** Подключение после первого OAuth-перехода (?vk=connection:<id>) — сразу выбор сообщества. */
  pendingConnectionId?: string;
  onClose: () => void;
}) {
  const [communities, setCommunities] = useState<CommunityItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [groupId, setGroupId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Возврат из OAuth с созданным подключением — сразу грузим сообщества
  useEffect(() => {
    if (!pendingConnectionId) return;
    fetchCommunities(pendingConnectionId, 0).then((result) => {
      if (result.ok) {
        setCommunities(result.items);
        setNextOffset(result.nextOffset);
      } else {
        setError(result.message);
      }
    });
  }, [pendingConnectionId]);

  const startOauth = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await apiJson<{ url: string }>("/api/channels/vk/connect");
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось начать авторизацию VK.");
      setBusy(false);
    }
  }, []);

  const submitCommunity = useCallback(async () => {
    if (!pendingConnectionId || !groupId) return;
    setBusy(true);
    setError("");
    try {
      const { url } = await apiJson<{ url: string }>("/api/channels/vk/select-community", {
        method: "POST",
        body: JSON.stringify({
          connectionId: pendingConnectionId,
          groupId,
          ...(senderName.trim() ? { senderName: senderName.trim() } : {}),
        }),
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось выбрать сообщество.");
      setBusy(false);
    }
  }, [pendingConnectionId, groupId, senderName]);

  const loadMore = useCallback(() => {
    if (!pendingConnectionId || nextOffset === null) return;
    fetchCommunities(pendingConnectionId, nextOffset).then((result) => {
      if (result.ok) {
        setCommunities((current) => [...current, ...result.items]);
        setNextOffset(result.nextOffset);
      } else {
        setError(result.message);
      }
    });
  }, [pendingConnectionId, nextOffset]);

  return (
    <Modal open onClose={onClose} title="Подключение ВКонтакте">
      {!pendingConnectionId ? (
        <>
          <p className="ch-dlg__text">
            Вы перейдёте на страницу авторизации VK ID, затем выберете сообщество, от имени которого
            Messengo будет получать и отправлять сообщения.
          </p>
          {error && <p className="ch-dlg__error">{error}</p>}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void startOauth()} disabled={busy}>
              Войти через VK
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="ch-dlg__text">
            Аккаунт VK подключён. Выберите сообщество, сообщения которого появятся в едином окне.
          </p>
          {error && <p className="ch-dlg__error">{error}</p>}
          {communities.length > 0 ? (
            <div className="ch-field">
              <span className="ch-field__label">Сообщество</span>
              <Select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                options={[
                  { value: "", label: "Выберите сообщество…" },
                  ...communities.map((community) => ({ value: community.id, label: community.name })),
                ]}
              />
            </div>
          ) : (
            !error && <p className="ch-dlg__text">Загружаем сообщества…</p>
          )}
          {nextOffset !== null && (
            <div className="ch-dlg__row">
              <Button variant="soft" size="sm" onClick={loadMore} disabled={busy}>
                Показать ещё
              </Button>
            </div>
          )}
          <div className="ch-field">
            <span className="ch-field__label">Имя отправителя (необязательно)</span>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Как подписывать исходящие сообщения"
            />
          </div>
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Позже
            </Button>
            <Button onClick={() => void submitCommunity()} disabled={busy || !groupId}>
              Разрешить сообщения
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
