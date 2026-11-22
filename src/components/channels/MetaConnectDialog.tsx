"use client";

// Диалог подключения Facebook / Instagram (план D3 п.2, механика V1 meta-dialog):
// OAuth через Facebook → выбор страницы (для IG — только страницы с привязанным
// аккаунтом, фильтрует бэкенд) → подписка вебхуков → ACTIVE. Рендерится
// условно (workspace) — состояние свежее на маунте.
import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import Select from "../ui/Select";
import Modal from "../ui/Modal";
import { ApiError, apiJson } from "../../lib/api-client";
import { apiErrorText } from "./labels";

type MetaAccountItem = { pageId: string; name: string; igAccountId: string | null; igUsername: string | null };

// Чистая загрузка страниц — setState только в колбэках вызывающей стороны
const fetchMetaAccounts = async (
  connectionId: string,
): Promise<{ ok: true; accounts: MetaAccountItem[] } | { ok: false; message: string }> => {
  try {
    const data = await apiJson<{ accounts: MetaAccountItem[] }>(
      `/api/channels/meta/accounts?connectionId=${encodeURIComponent(connectionId)}`,
    );
    return { ok: true, accounts: data.accounts };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? apiErrorText(error.message) : "Не удалось загрузить список страниц.",
    };
  }
};

export default function MetaConnectDialog({
  platform,
  pendingConnectionId,
  onClose,
  onConnected,
}: {
  platform: "facebook" | "instagram";
  /** Подключение после первого OAuth-перехода (?meta=connection:<id>) — сразу выбор страницы. */
  pendingConnectionId?: string;
  onClose: () => void;
  onConnected: (name: string) => void;
}) {
  const [accounts, setAccounts] = useState<MetaAccountItem[]>([]);
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isInstagram = platform === "instagram";

  // Возврат из OAuth с созданным подключением — сразу грузим страницы
  useEffect(() => {
    if (!pendingConnectionId) return;
    fetchMetaAccounts(pendingConnectionId).then((result) => {
      if (result.ok) setAccounts(result.accounts);
      else setError(result.message);
    });
  }, [pendingConnectionId]);

  const startOauth = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await apiJson<{ url: string }>(`/api/channels/meta/connect?platform=${platform}`);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось начать авторизацию Facebook.");
      setBusy(false);
    }
  }, [platform]);

  const submitAccount = useCallback(async () => {
    if (!pendingConnectionId || !pageId) return;
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/channels/meta/select-account", {
        method: "POST",
        body: JSON.stringify({ connectionId: pendingConnectionId, pageId }),
      });
      onConnected(isInstagram ? "Instagram" : "Facebook");
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось выбрать страницу.");
      setBusy(false);
    }
  }, [pendingConnectionId, pageId, onConnected, isInstagram]);

  return (
    <Modal open onClose={onClose} title={isInstagram ? "Подключение Instagram" : "Подключение Facebook"}>
      {!pendingConnectionId ? (
        <>
          <p className="ch-dlg__text">
            Вы войдёте через <b>Facebook</b>
            {isInstagram
              ? " и выберете страницу, к которой привязан профессиональный аккаунт Instagram."
              : " и выберете страницу, сообщения которой появятся в едином окне."}
          </p>
          {error && <p className="ch-dlg__error">{error}</p>}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void startOauth()} disabled={busy}>
              Войти через Facebook
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="ch-dlg__text">
            Аккаунт Facebook подключён. Выберите страницу
            {isInstagram ? " с привязанным аккаунтом Instagram" : ""}:
          </p>
          {error && <p className="ch-dlg__error">{error}</p>}
          {accounts.length > 0 ? (
            <div className="ch-field">
              <span className="ch-field__label">Страница</span>
              <Select
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                options={[
                  { value: "", label: "Выберите страницу…" },
                  ...accounts.map((account) => ({
                    value: account.pageId,
                    label: isInstagram && account.igUsername ? `@${account.igUsername} (${account.name})` : account.name,
                  })),
                ]}
              />
            </div>
          ) : (
            !error && <p className="ch-dlg__text">Загружаем страницы…</p>
          )}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Позже
            </Button>
            <Button onClick={() => void submitAccount()} disabled={busy || !pageId}>
              Подключить
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
