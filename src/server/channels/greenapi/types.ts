// Типы Green API. Спецификации сверены с официальной документацией
// green-api.com/docs (createInstance, qr, getStateInstance, sendMessage,
// setSettings и форматы вебхуков) — см. план C1.
// Расхождение с research-доком проекта: `typeInstance` — только поле ОТВЕТА
// createInstance (whatsapp | telegram | v3 — для MAX); в теле запроса его нет.

/** Состояние инстанса: getStateInstance и stateInstanceChanged. */
export type GreenApiInstanceState =
  | "notAuthorized"
  | "authorized"
  | "blocked"
  | "sleepMode" // устаревший (WhatsApp)
  | "starting"
  | "yellowCard" // устаревший, заменён на suspended (WhatsApp)
  | "suspended"
  | "pendingPassword"; // MAX: включена 2FA — после сканирования QR нужен пароль

/** Ответ метода qr: GET {{apiUrl}}/waInstance{{idInstance}}/qr/{{apiTokenInstance}}. */
export type GreenApiQrResponse = {
  type: "qrCode" | "timeout" | "error" | "passkeyRequired" | "alreadyLogged" | "already_registered";
  /** qrCode — PNG в base64 (для <img> с префиксом data:image/png;base64,); иначе текст. */
  message: string;
};

/** Настройки инстанса/вебхуков: тело createInstance и setSettings. */
export type GreenApiInstanceSettings = {
  name?: string;
  webhookUrl?: string;
  webhookUrlToken?: string;
  /** 500–600000 мс; рекомендуется ≤300000. */
  delaySendMessagesMilliseconds?: number;
  markIncomingMessagesReaded?: "yes" | "no";
  markIncomingMessagesReadedOnReply?: "yes" | "no";
  /** Статусы отправленных сообщений (outgoingMessageStatus). */
  outgoingWebhook?: "yes" | "no";
  /** Сообщения, отправленные с телефона/web/desktop. */
  outgoingMessageWebhook?: "yes" | "no";
  /** Сообщения, отправленные из API. */
  outgoingAPIMessageWebhook?: "yes" | "no";
  /** Изменение состояния авторизации инстанса. */
  stateWebhook?: "yes" | "no";
  /** Входящие сообщения и файлы. */
  incomingWebhook?: "yes" | "no";
  pollMessageWebhook?: "yes" | "no";
  incomingCallWebhook?: "yes" | "no";
  editedMessageWebhook?: "yes" | "no";
  deletedMessageWebhook?: "yes" | "no";
  keepOnlineStatus?: "yes" | "no";
  enableLidMode?: "yes" | "no";
};

/** Ответ партнёрского createInstance. */
export type GreenApiCreateInstanceResponse = {
  apiTokenInstance: string;
  apiUrl: string;
  idInstance: number;
  mediaUrl: string;
  typeInstance: string;
};

/** Тело sendMessage (текст, до 20000 символов). */
export type GreenApiSendMessageRequest = {
  chatId: string;
  message: string;
};

/** Ответ sendMessage. */
export type GreenApiSendMessageResponse = {
  idMessage: string;
};

/** Ошибка в теле ответа с HTTP 200 (createInstance и др.). */
export type GreenApiErrorBody = {
  code: number;
  description: string;
};

/** Ответ sendAuthorizationPassword (MAX, 2FA). Ошибки приходят с HTTP 200. */
export type GreenApiSendAuthorizationPasswordResponse = {
  status: boolean;
  data?: {
    status: "success" | "fail";
    reason?:
      | "already_registered"
      | "invalid_password"
      | "rate_limit_exceeded"
      | "authorization_not_started"
      | "timeout"
      | "attempts_exceeded"
      | "time_limit_expired_logout";
  };
};

/** instanceData — общий объект всех вебхуков. */
export type GreenApiInstanceData = {
  idInstance: number;
  wid: string;
  typeInstance: string;
};

/** Входящее сообщение (текстовое; остальные typeMessage — по мере надобности). */
export type GreenApiIncomingMessageReceived = {
  typeWebhook: "incomingMessageReceived";
  instanceData: GreenApiInstanceData;
  timestamp: number;
  idMessage: string;
  senderData: {
    chatId: string;
    sender: string;
    chatName: string | null;
    senderName: string | null;
    senderContactName: string | null;
    // поля MAX (typeInstance "v3"): тип чата/отправителя и телефон из книги
    chatType?: string;
    senderType?: string;
    senderPhoneNumber?: number;
  };
  messageData: {
    typeMessage: string;
    textMessageData?: { textMessage: string };
  };
};

/** Статус отправленного сообщения (outgoingMessageStatus). */
export type GreenApiOutgoingMessageStatus = {
  typeWebhook: "outgoingMessageStatus";
  instanceData: GreenApiInstanceData;
  timestamp: number;
  chatId: string;
  idMessage: string;
  status:
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "yellowCard"
    | "suspended"
    | "noAccount"
    | "notInGroup";
  description?: string;
  sendByApi?: boolean;
};

/** Изменение состояния авторизации инстанса (stateInstanceChanged). */
export type GreenApiStateInstanceChanged = {
  typeWebhook: "stateInstanceChanged";
  instanceData: GreenApiInstanceData;
  timestamp: number;
  stateInstance: GreenApiInstanceState;
};

/** Вебхуки Green API, обрабатываемые адаптером. */
export type GreenApiWebhook =
  | GreenApiIncomingMessageReceived
  | GreenApiOutgoingMessageStatus
  | GreenApiStateInstanceChanged;
