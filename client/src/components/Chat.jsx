import { useEffect, useRef, useState } from 'react'

export default function Chat({ messages, myId, onSend }) {
  const [text, setText] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const submit = (event) => {
    event.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <div className="chat">
      <ul className="chat__messages" ref={listRef}>
        {messages.length === 0 && <li className="chat__empty">No messages yet.</li>}

        {messages.map((message) => (
          <li
            key={message.id}
            className={`chat__message ${message.from === myId ? 'is-mine' : ''}`}
          >
            <span className="chat__author">
              {message.from === myId ? 'You' : message.fromName}
            </span>
            <span className="chat__text">{message.text}</span>
          </li>
        ))}
      </ul>

      <form className="chat__form" onSubmit={submit}>
        <input
          placeholder="Type a message"
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
