// Временная входная точка до лендинга D6: просто ведёт в разделы приложения.
export default function Home() {
  return (
    <main>
      <h1>Messengo V2</h1>
      <nav>
        <ul>
          <li>
            <a href="/chats">Чаты</a>
          </li>
          <li>
            <a href="/channels">Каналы связи</a>
          </li>
          <li>
            <a href="/payments">Оплаты</a>
          </li>
          <li>
            <a href="/funnel">Воронка</a>
          </li>
          <li>
            <a href="/tasks">Задачи</a>
          </li>
          <li>
            <a href="/settings">Настройки</a>
          </li>
        </ul>
      </nav>
    </main>
  );
}
