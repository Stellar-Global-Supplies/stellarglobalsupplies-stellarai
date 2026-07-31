import { useState, useRef } from 'react'

export default function InputArea({ onSend, isTyping, imgGen, webSearch, onToggleWebSearch }) {
  const [text, setText]         = useState('')
  const [file, setFile]         = useState(null)
  const [imgPrompt, setImgPrompt] = useState('')
  const textareaRef             = useRef(null)
  const fileInputRef            = useRef(null)

  const canSend = (text.trim() || file) && !isTyping

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) submit()
    }
  }

  function submit() {
    onSend({ text: text.trim(), file, imgPrompt: imgGen ? imgPrompt : '' })
    setText('')
    setFile(null)
    setImgPrompt('')
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }
  }

  return (
    <div className="input-area">
      <div className="input-box">
        {/* Image gen panel */}
        {imgGen && (
          <div className="img-gen-panel show">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <input
              className="img-gen-input"
              type="text"
              placeholder="Describe the image you want to create…"
              value={imgPrompt}
              onChange={e => setImgPrompt(e.target.value)}
            />
            <button className="img-gen-btn" onClick={() => onSend({ text: '', file: null, imgPrompt })}>
              Generate
            </button>
          </div>
        )}

        {/* File chip */}
        {file && (
          <div className="file-chips-row">
            <div className="file-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>{file.name}</span>
              <button className="file-chip-remove" onClick={() => setFile(null)}>✕</button>
            </div>
          </div>
        )}

        <div className="input-top">
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder="Message Stellar AI…"
            rows={1}
            value={text}
            onChange={e => { setText(e.target.value); autoResize(e.target) }}
            onKeyDown={handleKey}
          />
          <button className="send-btn" onClick={submit} disabled={!canSend}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>

        <div className="input-bottom">
          <label className="attach-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach file
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".csv,.xlsx,.xls,.pdf,.docx,.txt"
              onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]) }}
            />
          </label>

          <div className="input-toggles">
            <div className={`mini-toggle${webSearch ? ' on' : ''}`} onClick={onToggleWebSearch}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              Web search
            </div>
          </div>
        </div>
      </div>
      <div className="input-hint">Stellar AI can make mistakes. Verify important information.</div>
    </div>
  )
}
