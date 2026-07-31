import { forwardRef } from 'react'

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
}

function fmtTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function UserMessage({ msg }) {
  return (
    <div className="message-row user">
      {msg.file && (
        <div className="file-chip" style={{ marginBottom: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>{msg.file}</span>
        </div>
      )}
      {msg.text && <div className="msg-bubble">{msg.text}</div>}
      <div className="msg-meta">
        <span className="msg-time">{fmtTime()}</span>
        <div className="msg-actions">
          <button className="msg-action-btn" title="Copy" onClick={() => navigator.clipboard.writeText(msg.text)}>
            <CopyIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function AssistantMessage({ msg }) {
  return (
    <div className="message-row assistant">
      <div className="assistant-header">
        <AssistantLogo />
        <span className="assistant-name">Stellar AI</span>
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
          <span className="typing-dot"/>
          <span className="typing-dot"/>
          <span className="typing-dot"/>
        </div>
      ) : null}

      {msg.text && !msg.status && (
        <div className="msg-meta">
          <span className="msg-time">{fmtTime()}</span>
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
