import { useState, useEffect, useRef } from 'react'

const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',  desc: 'Best quality · Versatile' },
  { id: 'llama3-8b-8192',          name: 'Llama 3 8B',      desc: 'Fast · Lightweight'       },
  { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B',    desc: 'Long context · 32K'       },
  { id: 'gemma2-9b-it',            name: 'Gemma 2 9B',       desc: 'Google · Efficient'       },
]

export default function Topbar({ sidebarOpen, onToggleSidebar, model, onModelChange, entData, onToggleEnt, imgGen, onToggleImg }) {
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)
  const currentModel = MODELS.find(m => m.id === model) || MODELS[0]

  useEffect(() => {
    const handler = (e) => { if (!dropRef.current?.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
        </button>

        <div style={{ position: 'relative' }} ref={dropRef}>
          <button className="model-selector" onClick={() => setDropOpen(o => !o)}>
            <div className="model-dot"/>
            <span>{currentModel.name}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {dropOpen && (
            <div className="model-dropdown" style={{ display: 'block' }}>
              {MODELS.map(m => (
                <div
                  key={m.id}
                  className={`model-option${m.id === model ? ' selected' : ''}`}
                  onClick={() => { onModelChange(m.id); setDropOpen(false) }}
                >
                  <svg className="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ opacity: m.id === model ? 1 : 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <div>
                    <div className="model-name">{m.name}</div>
                    <div className="model-desc">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <div className={`toggle-pill${entData ? ' active' : ''}`} onClick={onToggleEnt} title="Query internal org data">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
          </svg>
          <span>Ent data</span>
          <div className="toggle-switch"/>
        </div>

        <div className={`toggle-pill${imgGen ? ' active' : ''}`} onClick={onToggleImg} title="Generate images">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Image gen</span>
          <div className="toggle-switch"/>
        </div>

        <button className="icon-btn" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
