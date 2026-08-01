import { forwardRef, useState, useEffect, useRef } from 'react'

function renderMarkdown(text) {
  if (!text) return ''

  let t = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  t = t.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold / italic
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  const lines = t.split('\n')
  const out = []
  let inUl = false
  let inOl = false

  function closeList() {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  for (const line of lines) {
    const h3 = line.match(/^### (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h1 = line.match(/^# (.+)/)
    const ul = line.match(/^[\*\-\+] (.+)/)
    const ol = line.match(/^(\d+)\. (.+)/)

    if (h3) { closeList(); out.push(`<h3 style="margin:12px 0 6px;font-size:15px;font-weight:600">${h3[1]}</h3>`); continue }
    if (h2) { closeList(); out.push(`<h2 style="margin:14px 0 6px;font-size:16px;font-weight:600">${h2[1]}</h2>`); continue }
    if (h1) { closeList(); out.push(`<h1 style="margin:14px 0 8px;font-size:18px;font-weight:700">${h1[1]}</h1>`); continue }

    if (ul) {
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul style="margin:6px 0;padding-left:20px">'); inUl = true }
      out.push(`<li style="margin:3px 0">${ul[1]}</li>`)
      continue
    }
    if (ol) {
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol style="margin:6px 0;padding-left:20px">'); inOl = true }
      out.push(`<li style="margin:3px 0">${ol[2]}</li>`)
      continue
    }

    closeList()
    if (line.trim() === '') { out.push('<div style="height:8px"></div>'); continue }
    out.push(`<p style="margin:4px 0">${line}</p>`)
  }

  closeList()
  return out.join('')
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function AssistantLogo() {
  return (
    <div className="assistant-avatar">
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
        <path d="M16 4l10.4 6v12L16 28 5.6 22V10z" fill="white" opacity=".35"/>
        <path d="M16 7l2.4 6.2L25 11l-4.2 4.6 4.2 4.6-6.6-2.2L16 24l-2.4-6.2L7 20.2l4.2-4.6L7 11l6.6 2.2z" fill="white"/>
      </svg>
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function UserMessage({ msg }) {
  return (
    <div className="message-row user">
      {msg.file && (
        <div className="file-chip" style={{ marginBottom: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>{msg.file}</span>
        </div>
      )}
      {msg.text && <div className="msg-bubble">{msg.text}</div>}
      <div className="msg-meta">
        <span className="msg-time">{fmtTime(msg.ts)}</span>
      </div>
    </div>
  )
}

function AssistantMessage({ msg }) {
  const startRef  = useRef(msg.ts)
  const [elapsed, setElapsed] = useState(null)

  // Start a live timer while streaming, freeze when done
  useEffect(() => {
    if (!msg.status && msg.text) {
      // Response complete — show final elapsed
      const secs = ((Date.now() - startRef.current) / 1000).toFixed(1)
      setElapsed(secs)
      return
    }
    if (msg.status) {
      const id = setInterval(() => {
        setElapsed(((Date.now() - startRef.current) / 1000).toFixed(1))
      }, 100)
      return () => clearInterval(id)
    }
  }, [msg.status, msg.text])

  return (
    <div className="message-row assistant">
      <div className="assistant-header">
        <AssistantLogo />
        <span className="assistant-name">Stellar AI</span>
        {elapsed && (
          <span className="response-time">{elapsed}s</span>
        )}
      </div>

      {msg.status && (
        <div className="status-event">
          <div className="status-spinner"/>
          <span>{msg.status}</span>
        </div>
      )}

      {msg.imgUrl ? (
        <div className="msg-bubble">
          <p style={{ marginBottom: 10, color: '#555', fontSize: 13 }}>{msg.text}</p>
          <img src={msg.imgUrl} alt="Generated" style={{ borderRadius: 12, maxWidth: 400, width: '100%', border: '1px solid #e5e5e5' }} />
        </div>
      ) : msg.text ? (
        <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
      ) : !msg.status ? (
        <div className="msg-bubble">
          <span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/>
        </div>
      ) : null}

      {msg.text && !msg.status && (
        <div className="msg-meta">
          <span className="msg-time">{fmtTime(msg.ts)}</span>
          <div className="msg-actions">
            <button className="msg-action-btn" title="Copy" onClick={() => navigator.clipboard.writeText(msg.text)}>
              <CopyIcon />
            </button>
            <button className="msg-action-btn" title="Good response">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            </button>
            <button className="msg-action-btn" title="Bad response">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
                <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ChatArea = forwardRef(function ChatArea({ messages }, ref) {
  return (
    <div className="chat-area" ref={ref}>
      <div className="messages-wrap">
        {messages.map(msg =>
          msg.role === 'user'
            ? <UserMessage key={msg.id} msg={msg} />
            : <AssistantMessage key={msg.id} msg={msg} />
        )}
      </div>
    </div>
  )
})

export default ChatArea