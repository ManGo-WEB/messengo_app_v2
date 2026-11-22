"use client";

// QR-мастер Green API-каналов: WhatsApp (C2) и MAX (C3). План D3 п.2:
// показать QR, статус «ожидаем сканирование», 2FA-поле для MAX, успех/ошибка.
// QR обновляется опросом статуса раз в 2 с (по документации Green API код
// меняется каждые 20 с); при подключённом SSE событие channel.status
// инициирует внеочередную проверку. Рендерится условно (workspace) —
// состояние свежее на маунте.
import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Checkbox from "../ui/Checkbox";
import Modal from "../ui/Modal";
import { ApiError, apiJson } from "../../lib/api-client";
import { apiErrorText, channelName } from "./labels";
import type { ChannelStatusEvent } from "./types";

const POLL_MS = 2_000; // C2 п.1: опрос статуса возвращает и свежий QR

type ConnectResult = { connectionId: string; qr: string | null; expiresAt: string };
type StatusResult = {
  id: string;
  status: string;
  stateInstance?: string;
  qr?: string;
  reason?: string;
  twoFaRequired?: boolean;
};

// Чистый запрос статуса подключения — setState только в колбэках вызывающей стороны
const fetchGreenApiStatus = async (
  channel: "WHATSAPP" | "MAX",
  id: string,
): Promise<StatusResult | null> => {
  try {
    return await apiJson<StatusResult>(`/api/channels/${channel === "MAX" ? "max" : "whatsapp"}/${id}/status`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    // сетевые сбои не роняют опрос — следующий тик повторит
    return { id, status: "PENDING" };
  }
};

export default function GreenApiDialog({
  channel,
  pendingConnectionId,
  channelEvent,
  onClose,
  onConnected,
}: {
  channel: "WHATSAPP" | "MAX";
  /** Продолжение незавершённого подключения (PENDING из списка). */
  pendingConnectionId?: string;
  channelEvent: ChannelStatusEvent | null;
  onClose: () => void;
  onConnected: (name: string) => void;
}) {
  const [phase, setPhase] = useState<"intro" | "qr">(pendingConnectionId ? "qr" : "intro");
  const [connectionId, setConnectionId] = useState<string | null>(pendingConnectionId ?? null);
  const [qr, setQr] = useState<string | null>(null);
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [twoFaSent, setTwoFaSent] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [errorText, setErrorText] = useState("");
  const [useOwnInstance, setUseOwnInstance] = useState(false);
  const [idInstance, setIdInstance] = useState("");
  const [apiTokenInstance, setApiTokenInstance] = useState("");
  const [busy, setBusy] = useState(false);

  const isMax = channel === "MAX";

  /** Применить результат тика опроса (setState — здесь допустимо: колбэк). */
  const applyStatus = useCallback(
    (data: StatusResult | null) => {
      if (!data) {
        setErrorText("Подключение не найдено. Начните заново.");
        return;
      }
      if (data.status === "ACTIVE") {
        onConnected(channelName(channel));
        return;
      }
      if (data.status === "ERROR") {
        setErrorText(
          data.reason === "QR_EXPIRED"
            ? "Время действия QR-кода истекло. Подключите канал заново."
            : "Инстанс заблокирован или сброшен. Подключите канал заново.",
        );
        return;
      }
      setTwoFaRequired(data.twoFaRequired === true);
      if (data.twoFaRequired !== true) setTwoFaSent(false);
      if (data.qr) setQr(data.qr);
    },
    [channel, onConnected],
  );

  // Опрос статуса, пока открыт QR-шаг (setState — только в колбэках опроса)
  useEffect(() => {
    if (phase !== "qr" || !connectionId) return;
    fetchGreenApiStatus(channel, connectionId).then(applyStatus);
    const timer = setInterval(() => {
      fetchGreenApiStatus(channel, connectionId).then(applyStatus);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, connectionId, channel, applyStatus]);

  // SSE: событие своего подключения — внеочередная проверка статуса
  useEffect(() => {
    if (phase !== "qr" || !connectionId || channelEvent?.connectionId !== connectionId) return;
    fetchGreenApiStatus(channel, connectionId).then(applyStatus);
  }, [phase, connectionId, channelEvent, channel, applyStatus]);

  const startQr = useCallback(async () => {
    setBusy(true);
    setErrorText("");
    try {
      const body =
        useOwnInstance && idInstance.trim() && apiTokenInstance.trim()
          ? { idInstance: idInstance.trim(), apiTokenInstance: apiTokenInstance.trim() }
          : {};
      const data = await apiJson<ConnectResult>(`/api/channels/${isMax ? "max" : "whatsapp"}/connect`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setConnectionId(data.connectionId);
      setQr(data.qr);
      setPhase("qr");
    } catch (err) {
      setErrorText(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось создать инстанс.");
    } finally {
      setBusy(false);
    }
  }, [isMax, useOwnInstance, idInstance, apiTokenInstance]);

  /** Повтор подключения после ошибки (QR истёк / инстанс сломан): старое подключение закрывается. */
  const restart = useCallback(async () => {
    if (connectionId) {
      await apiJson(`/api/channels/${connectionId}`, { method: "DELETE" }).catch(() => {});
    }
    setPhase("intro");
    setConnectionId(null);
    setQr(null);
    setTwoFaRequired(false);
    setTwoFaSent(false);
    setTwoFaPassword("");
    setTwoFaError("");
    setErrorText("");
  }, [connectionId]);

  const submitTwoFa = useCallback(async () => {
    if (!connectionId || !twoFaPassword.trim()) return;
    setTwoFaError("");
    setBusy(true);
    try {
      const data = await apiJson<{ success: boolean; reason?: string }>(
        `/api/channels/max/${connectionId}/twofa`,
        { method: "POST", body: JSON.stringify({ password: twoFaPassword.trim() }) },
      );
      if (!data.success) {
        setTwoFaError(
          data.reason === "time_limit_expired_logout"
            ? "Время ввода пароля истекло — MAX разлогинил инстанс. Отсканируйте QR заново."
            : `MAX отклонил пароль (${data.reason ?? "fail"}). Попробуйте ещё раз.`,
        );
        return;
      }
      // Пароль принят: следующий опрос увидит authorized → ACTIVE (maxConnectStatus)
      setTwoFaSent(true);
    } catch (err) {
      setTwoFaError(err instanceof ApiError ? apiErrorText(err.message) : "Не удалось отправить пароль.");
    } finally {
      setBusy(false);
    }
  }, [connectionId, twoFaPassword]);

  return (
    <Modal open onClose={onClose} title={`Подключение ${channelName(channel)}`}>
      {phase === "intro" ? (
        <>
          <p className="ch-dlg__text">
            {isMax
              ? "Отсканируйте QR-код в приложении MAX — канал подключится как новое устройство."
              : "Откройте WhatsApp → «Настройки» → «Связанные устройства» → «Привязка устройства» и отсканируйте QR-код."}
          </p>
          <div className="ch-dlg__row">
            <Checkbox checked={useOwnInstance} onChange={setUseOwnInstance} label="Указать инстанс вручную (свой тариф Developer)" />
          </div>
          {useOwnInstance && (
            <>
              <div className="ch-field">
                <span className="ch-field__label">idInstance</span>
                <Input value={idInstance} onChange={(e) => setIdInstance(e.target.value)} placeholder="Например, 123456789" />
              </div>
              <div className="ch-field">
                <span className="ch-field__label">apiTokenInstance</span>
                <Input type="password" value={apiTokenInstance} onChange={(e) => setApiTokenInstance(e.target.value)} autoComplete="off" />
              </div>
            </>
          )}
          {errorText && <p className="ch-dlg__error">{errorText}</p>}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void startQr()} disabled={busy || (useOwnInstance && (!idInstance.trim() || !apiTokenInstance.trim()))}>
              Показать QR-код
            </Button>
          </div>
        </>
      ) : (
        <>
          {errorText ? (
            <p className="ch-dlg__error">{errorText}</p>
          ) : twoFaRequired ? (
            twoFaSent ? (
              <p className="ch-dlg__text">Пароль принят — проверяем вход в MAX…</p>
            ) : (
              <>
                <p className="ch-dlg__text">
                  На аккаунте MAX включена <b>двухфакторная аутентификация</b>. Введите пароль 2FA,
                  чтобы подтвердить вход.
                </p>
                <div className="ch-field">
                  <span className="ch-field__label">Пароль 2FA</span>
                  <Input
                    type="password"
                    value={twoFaPassword}
                    onChange={(e) => setTwoFaPassword(e.target.value)}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitTwoFa();
                    }}
                  />
                </div>
                {twoFaError && <p className="ch-dlg__error">{twoFaError}</p>}
              </>
            )
          ) : (
            <div className="ch-qr">
              {qr ? (
                <div className="ch-qr__frame">
                  {/* data:image/png;base64 — PNG-код из ответа Green API (C1); next/image для data URL не применяется */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QR-код подключения ${channelName(channel)}`} />
                </div>
              ) : (
                <div className="ch-qr__frame">
                  <div className="ch-qr__wait">Готовим QR-код…</div>
                </div>
              )}
              <p className="ch-qr__caption">
                Ожидаем сканирование… QR обновляется автоматически.{" "}
                {isMax ? "MAX → сканер QR-кодов." : "WhatsApp → Связанные устройства → Привязка устройства."}
              </p>
            </div>
          )}
          <div className="ch-dlg__footer">
            <span className="ch-dlg__spacer" />
            {(errorText || twoFaError) && (
              <Button variant="soft" onClick={() => void restart()}>
                Подключить заново
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Позже
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
