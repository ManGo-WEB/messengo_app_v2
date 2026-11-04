import { useState } from 'react'
import Icon from '../components/icons/Icon.jsx'
import ChannelIcon from '../components/icons/ChannelIcon.jsx'
import { Avatar } from '../components/ui/ui.jsx'
import './chat.css'

export default function ChatPanel({ dialog, onClose }) {
  const [messages, setMessages] = useState(dialog.messages)
  const [text, setText] = useState('')

  const send = () => {
    if (!text.trim()) return
    setMessages([...messages, { from: 'me', text: text.trim(), time: 'Сейчас' }])
    setText('')
  }

  return (
    <aside className="chat">
      <header className="chat__head">
        <Avatar name={dialog.client} size={38} />
        <div className="chat__who">
          <div className="chat__name">{dialog.client}</div>
          <div className="chat__meta">
            <ChannelIcon id={dialog.channel} size={14} />
            {dialog.source}
          </div>
        </div>
        <button className="chat__act" title="Информация">
          <Icon name="info" size={17} />
        </button>
        <button className="chat__act" title="Закрыть" onClick={onClose}>
          <Icon name="close" size={17} />
        </button>
      </header>

      <div className="chat__body">
        <div className="chat__day">Сегодня</div>
        {messages.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.from}`}>
            <div className="chat__bubble">{m.text}</div>
            <div className="chat__time">{m.time}</div>
          </div>
        ))}
      </div>

      <footer className="chat__input">
        <button className="chat__act" title="Прикрепить">
          <Icon name="paperclip" size={18} />
        </button>
        <textarea
          rows={1}
          placeholder="Напишите сообщение..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button className="chat__send" onClick={send} title="Отправить">
          <Icon name="send" size={16} />
        </button>
      </footer>
    </aside>
  )
}
