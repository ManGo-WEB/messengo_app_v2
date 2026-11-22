"use client";

// Экран «Настройки» (план D5 п.3): профиль оператора и организации (имя —
// редактируется), смена пароля (POST /api/auth/change-password), управление
// API-ключом LLM — заглушка до Фазы E (кнопка disabled с подписью
// «Появится на этапе RAG»). Визуал — порт SettingsPage.jsx прототипа:
// вкладки «Профиль»/«Уведомления», строки-поля, тумблеры (локальный стейт —
// TODO-бэкенд уведомлений). Email не редактируется: смена email требует
// своего потока подтверждения (вне фазы D5).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "../icons/Icon";
import { Avatar, Button, Input, Modal, Tabs, Toast, ToastStack, Toggle, type ToastTone } from "../ui";
import { ApiError, apiJson } from "@/lib/api-client";
import "./settings.css";

type Me = {
  user: { id: string; email: string; name: string; role: string };
  organization: { id: string; name: string };
};

type ToastItem = { id: number; tone: ToastTone; text: string };

type ModalKind = "name" | "org" | "password" | null;

const NOTIFICATIONS = [
  { id: "new", label: "Новые диалоги", hint: "Пуши при входящем сообщении" },
  { id: "mention", label: "Упоминания и ответы", hint: "Когда вас упоминают в диалоге" },
  { id: "sound", label: "Звук уведомлений", hint: "" },
  { id: "digest", label: "Email-дайджест", hint: "Сводка за день на почту" },
];

const ROLE_LABELS: Record<string, string> = { ADMIN: "Администратор" };

function FieldRow({
  icon,
  label,
  hint,
  children,
  onEdit,
}: {
  icon: IconName;
  label: string;
  hint?: boolean;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="set-row">
      <span className="set-row__ic">
        <Icon name={icon} size={18} />
      </span>
      <span className="set-row__label">
        {label}
        {hint && (
          <span title="Появится позже">
            <Icon name="info" size={13} className="dim set-row__hint" />
          </span>
        )}
      </span>
      <div className="set-row__value">{children}</div>
      {onEdit && (
        <button className="set-row__edit" onClick={onEdit} title="Изменить" type="button">
          <Icon name="pencil" size={15} />
        </button>
      )}
    </div>
  );
}

export default function SettingsWorkspace() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState("profile");
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [topMenu, setTopMenu] = useState(false);
  const [notif, setNotif] = useState({ new: true, mention: true, sound: false, digest: true });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  // Формы
  const [nameValue, setNameValue] = useState("");
  const [orgValue, setOrgValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  useEffect(() => {
    apiJson<Me>("/api/auth/me")
      .then(setMe)
      .catch(() => pushToast({ tone: "error", text: "Не удалось загрузить профиль." }));
  }, [pushToast]);

  const openNameModal = () => {
    if (me) setNameValue(me.user.name);
    setModalError("");
    setModal("name");
  };

  const openOrgModal = () => {
    if (me) setOrgValue(me.organization.name);
    setModalError("");
    setModal("org");
  };

  const openPasswordModal = () => {
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
    setModalError("");
    setModal("password");
  };

  const closeModal = () => {
    setModal(null);
    setModalError("");
  };

  const saveProfile = async () => {
    if (!me) return;
    setBusy(true);
    setModalError("");
    try {
      const body = modal === "name" ? { name: nameValue } : { organizationName: orgValue };
      const updated = await apiJson<Me>("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
      setMe(updated);
      pushToast({ tone: "success", text: modal === "name" ? "Имя обновлено." : "Название организации обновлено." });
      closeModal();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setBusy(true);
    setModalError("");
    try {
      if (newPassword.length < 8) throw new Error("Новый пароль — минимум 8 символов.");
      if (newPassword !== repeatPassword) throw new Error("Пароли не совпадают.");
      await apiJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      pushToast({ tone: "success", text: "Пароль изменён." });
      closeModal();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" } });
    router.push("/login");
  };

  return (
    <div>
      <h1 className="page-title">Настройки</h1>

      <Tabs
        items={[
          { id: "profile", label: "Профиль" },
          { id: "notif", label: "Уведомления" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "profile" && (
        <>
          <div className="set-profile">
            <Avatar name={me?.user.name ?? ""} size={56} className="set-profile__avatar" />
            <div className="set-profile__who">
              <div className="set-profile__name">{me?.user.name ?? "…"}</div>
              <div className="set-profile__role">{ROLE_LABELS[me?.user.role ?? ""] ?? "Оператор"}</div>
            </div>
            <Button variant="outline" icon="logout" onClick={() => void logout()}>
              Выйти
            </Button>
          </div>

          <div className="set-fields">
            <FieldRow icon="user" label="Имя" onEdit={openNameModal}>
              {me?.user.name ?? "…"}
            </FieldRow>
            <FieldRow icon="users" label="Организация" onEdit={openOrgModal}>
              {me?.organization.name ?? "…"}
            </FieldRow>
            <FieldRow icon="envelope" label="Почта" hint>
              <span title="Смена email появится позже">{me?.user.email ?? "…"}</span>
            </FieldRow>
            <FieldRow icon="lock" label="Пароль" onEdit={openPasswordModal}>
              ••••••••
            </FieldRow>
            {/* Телефон в модели оператора не хранится — мок прототипа. */}
            {/* TODO: поле телефона и его изменение — вне фазы D5. */}
            <FieldRow icon="phone" label="Телефон">
              +7 964 410-60-18
            </FieldRow>
          </div>

          <h3 className="set-subtitle">Дополнительно</h3>

          <div className="set-fields">
            <FieldRow icon="home" label="Стартовая страница" hint>
              Дашборд
            </FieldRow>
            <FieldRow icon="globe" label="Язык">
              Русский
            </FieldRow>
          </div>

          <h3 className="set-subtitle">AI (RAG)</h3>

          <div className="set-row set-row--llm">
            <span className="set-row__ic">
              <Icon name="key" size={18} />
            </span>
            <span className="set-row__label">API-ключ LLM</span>
            <div className="set-row__value set-llm">
              <Input placeholder="sk-…" disabled className="set-llm__input" />
              <Button variant="outline" size="sm" disabled>
                Проверить ключ
              </Button>
              <div className="dim set-llm__hint">Появится на этапе RAG (фаза E).</div>
            </div>
          </div>

          <div className="set-toggle-row card">
            <span className="set-row__label">
              Верхнее меню в чате
              <Icon name="info" size={13} className="dim set-row__hint" />
            </span>
            <Toggle checked={topMenu} onChange={setTopMenu} />
          </div>
        </>
      )}

      {tab === "notif" && (
        <div className="set-notif">
          {NOTIFICATIONS.map((n) => (
            <div key={n.id} className="set-toggle-row card">
              <span>
                <span className="set-row__label" style={{ display: "inline-flex" }}>
                  {n.label}
                </span>
                {n.hint && <div className="dim set-notif__hint">{n.hint}</div>}
              </span>
              <Toggle checked={notif[n.id as keyof typeof notif]} onChange={(v) => setNotif((prev) => ({ ...prev, [n.id]: v }))} />
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal === "name" || modal === "org"}
        onClose={closeModal}
        title={modal === "name" ? "Изменить имя" : "Изменить организацию"}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Отмена
            </Button>
            <Button onClick={() => void saveProfile()} disabled={busy}>
              Сохранить
            </Button>
          </>
        }
      >
        {modalError && <div className="set-modal-error">{modalError}</div>}
        {modal === "name" ? (
          <div className="set-modal-field">
            <label htmlFor="set-name">Ваше имя</label>
            <Input id="set-name" value={nameValue} onChange={(e) => setNameValue(e.target.value)} maxLength={100} />
          </div>
        ) : (
          <div className="set-modal-field">
            <label htmlFor="set-org">Название организации</label>
            <Input id="set-org" value={orgValue} onChange={(e) => setOrgValue(e.target.value)} maxLength={100} />
          </div>
        )}
      </Modal>

      <Modal
        open={modal === "password"}
        onClose={closeModal}
        title="Смена пароля"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Отмена
            </Button>
            <Button onClick={() => void changePassword()} disabled={busy || !currentPassword || !newPassword}>
              Сменить пароль
            </Button>
          </>
        }
      >
        {modalError && <div className="set-modal-error">{modalError}</div>}
        <div className="set-modal-field">
          <label htmlFor="set-pass-current">Текущий пароль</label>
          <Input id="set-pass-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="set-modal-field">
          <label htmlFor="set-pass-new">Новый пароль</label>
          <Input id="set-pass-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="минимум 8 символов" />
        </div>
        <div className="set-modal-field">
          <label htmlFor="set-pass-repeat">Повторите новый пароль</label>
          <Input id="set-pass-repeat" type="password" autoComplete="new-password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} />
        </div>
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
