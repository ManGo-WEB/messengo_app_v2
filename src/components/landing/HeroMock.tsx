// Макет окна приложения для первого экрана лендинга (план D6 п.1): общий
// список диалогов со значками мессенджеров, диалог с клиентом и подсказка
// «ИИ-черновик» с кнопками «Принять» и «Изменить». Это статичная картинка в
// визуальном языке инбокса (D2), а не живые данные: данные вымышленные,
// кнопки внутри не нажимаются — весь блок объявлен одной картинкой.
// Значки WhatsApp, Instagram и Facebook в макете не показываются — решение
// владельца от 2026-11-28 (как и в блоке возможностей).
import Avatar from "../ui/Avatar";
import ChannelIcon from "../icons/ChannelIcon";
import Icon from "../icons/Icon";

const CLIENT = { name: "Анна Смирнова", channel: "telegram", channelName: "Telegram" };

const DIALOGS = [
  { name: "Анна Смирнова", channel: "telegram", preview: "Здравствуйте! Сколько стоит доставка в Казань?", time: "14:02" },
  { name: "Игорь Волков", channel: "max", preview: "Спасибо, завтра пришлю макет", time: "13:47" },
  { name: "Мария Ковалёва", channel: "telegram", preview: "Можно оплатить по счёту?", time: "13:20" },
  { name: "Пётр Соколов", channel: "vk", preview: "Добрый день, запись на следующую неделю", time: "12:55" },
  { name: "Елена Орлова", channel: "max", preview: "Отлично, жду расчёт", time: "12:31" },
];

export default function HeroMock() {
  return (
    <div
      className="ld-mock"
      role="img"
      aria-label="Окно Messengo: общий список диалогов из разных мессенджеров и ИИ-черновик ответа клиенту"
    >
      <div className="ld-mock__list">
        <div className="ld-mock__search">
          <Icon name="search" size={14} />
          Поиск
        </div>
        {DIALOGS.map((dialog, index) => (
          // Первый диалог открыт — строка подсвечена, как в инбоксе
          <div key={dialog.name} className={`ld-mock__row ${index === 0 ? "is-selected" : ""}`}>
            <Avatar name={dialog.name} size={32} />
            <div className="ld-mock__who">
              <div className="ld-mock__top">
                <span className="ld-mock__name">{dialog.name}</span>
                <ChannelIcon id={dialog.channel} size={13} />
                <span className="ld-mock__time">{dialog.time}</span>
              </div>
              <div className="ld-mock__preview">{dialog.preview}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ld-mock__chat">
        <div className="ld-mock__head">
          <Avatar name={CLIENT.name} size={30} />
          <div>
            <div className="ld-mock__head-name">{CLIENT.name}</div>
            <div className="ld-mock__head-channel">
              <ChannelIcon id={CLIENT.channel} size={13} />
              {CLIENT.channelName}
            </div>
          </div>
        </div>
        <div className="ld-mock__body">
          <div className="ld-mock__bubble">Здравствуйте! Сколько стоит доставка в Казань?</div>
          <div className="ld-draft">
            <div className="ld-draft__label">
              <Icon name="spark" size={14} />
              ИИ-черновик
            </div>
            <div className="ld-draft__text">Здравствуйте! Доставка в Казань — 350 ₽, отправим в день заказа.</div>
            <div className="ld-draft__source">Подготовлено по документу «Прайс-лист 2026»</div>
            <div className="ld-draft__actions">
              <span className="btn btn--primary btn--sm">Принять</span>
              <span className="btn btn--outline btn--sm">Изменить</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
