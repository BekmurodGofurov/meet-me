import { Fragment, useEffect, useRef, useState } from 'react'

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi

function renderMessageContent(text) {
  // Anything but a string (e.g. a crafted message) would throw on .split and
  // take the whole page down for everyone who received it.
  if (typeof text !== 'string' || !text) return null

  const parts = text.split(URL_REGEX)

  return parts.map((part, index) => {
    if (!part) return null

    if (/^(https?:\/\/|www\.)/i.test(part)) {
      let url = part
      let trailing = ''
      const trailingPunctMatch = url.match(/[.,!?:;]+$/)
      if (trailingPunctMatch) {
        trailing = trailingPunctMatch[0]
        url = url.slice(0, -trailing.length)
      }

      if (url.endsWith(')') && !url.includes('(')) {
        trailing = ')' + trailing
        url = url.slice(0, -1)
      }

      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`

      return (
        <Fragment key={index}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="chat__link"
          >
            {url}
          </a>
          {trailing}
        </Fragment>
      )
    }

    return part
  })
}

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

        {messages.map((message) =>
          message.kind === 'system' ? (
            <li key={message.id} className={`chat__system chat__system--${message.tone}`}>
              {renderMessageContent(message.text)}
            </li>
          ) : (
            <li
              key={message.id}
              className={`chat__message ${message.from === myId ? 'is-mine' : ''}`}
            >
              <span className="chat__author">
                {message.from === myId ? 'You' : message.fromName}
              </span>
              <span className="chat__text">{renderMessageContent(message.text)}</span>
            </li>
          ),
        )}
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
