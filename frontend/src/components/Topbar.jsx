import { useState, useEffect, useRef } from 'react'

// Model IDs must match CF_MODEL_MAP keys in worker/src/routes/chat.js
const MODELS = [
  {
    id:    'llama-3.3-70b',
    name:  'Llama 3.3 · 70B',
    desc:  'Best quality · Recommended',
    badge: null,
  },
  {
    id:    'llama-4-scout',
    name:  'Llama 4 Scout · 17B',
    desc:  'Multimodal · Reads images',
    badge: '👁️ Vision',
  },
  {
    id:    'gpt-oss-120b',
    name:  'GPT-OSS · 120B',
    desc:  'Powerful reasoning · OpenAI model',
    badge: null,
  },
  {
    id:    'qwq-32b',
    name:  'QwQ · 32B',
    desc:  'Deep analysis · Finance & data',
    badge: '🧠 Reasoning',
  },
  {
    id:    'glm-4.7-flash',
    name:  'GLM 4.7 Flash',
    desc:  'Fast · 131k context · Hindi/English',
    badge: '⚡ Flash',
  },
  {
    id:    'llama-3.1-8b',
    name:  'Llama 3.1 · 8B',
    desc:  'Fastest · Simple queries',
    badge: null,
  },
]

export default function Topbar({
  sidebarOpen, onToggleSidebar,
  model, onModelChange,
  entData, onToggleEnt,
  imgGen, onToggleImg,
  onClearAll, onLogout,
}) {
  const [modelOpen,    setModelOpen]   = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const modelRef    = useRef(null)
  const settingsRef = useRef(null)

  const currentModel = MODELS.find(m => m.id === model) || MODELS[0]

  useEffect(() => {
    function handler(e) {
      if (!modelRef.current?.contains(e.target))    setModelOpen(false)
      if (!settingsRef.current?.contains(e.target)) { setSettingsOpen(false); setConfirmClear(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleClearAll() {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    setSettingsOpen(false)
    onClearAll?.()
  }

  function handleLogout() {
    setSettingsOpen(false)
    onLogout?.()
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
        </button>

        {/* Model selector */}
        <div style={{ position: 'relative' }} ref={modelRef}>
          <button className="model-selector" onClick={() => setModelOpen(o => !o)}>
            <div className="model-dot"/>
            <span>{currentModel.name}</span>
            {currentModel.badge && (
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                borderRadius: '99px', background: 'rgba(0,0,0,0.07)',
                color: '#555', marginLeft: 2,
              }}>
                {currentModel.badge}
              </span>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {modelOpen && (
            <div className="model-dropdown">
              {MODELS.map(m => (
                <div
                  key={m.id}
                  className={`model-option${m.id === model ? ' selected' : ''}`}
                  onClick={() => { onModelChange(m.id); setModelOpen(false) }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ opacity: m.id === model ? 1 : 0, flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="model-name">{m.name}</span>
                      {m.badge && (
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                          borderRadius: '99px', background: 'rgba(0,0,0,0.07)',
                          color: '#666', whiteSpace: 'nowrap',
                        }}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="model-desc">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {/* Ent data toggle */}
        <div className={`toggle-pill${entData ? ' active' : ''}`} onClick={onToggleEnt} title="Query internal org data">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
          </svg>
          <span>Ent data</span>
          <div className="toggle-switch"/>
        </div>

        {/* Image gen toggle */}
        <div className={`toggle-pill${imgGen ? ' active' : ''}`} onClick={onToggleImg} title="Generate images">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Image gen</span>
          <div className="toggle-switch"/>
        </div>

        {/* Settings gear */}
        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button
            className={`icon-btn${settingsOpen ? ' active' : ''}`}
            onClick={() => { setSettingsOpen(o => !o); setConfirmClear(false) }}
            title="Settings"
            style={settingsOpen ? { background: '#f0f0f0' } : {}}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {settingsOpen && (
            <div className="settings-dropdown">
              <div className="settings-label">Settings</div>

              <button className="settings-item" onClick={handleClearAll}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                {confirmClear
                  ? <span style={{ color: '#e53e3e', fontWeight: 600 }}>Tap again to confirm</span>
                  : <span>Clear all chats</span>
                }
              </button>

              <div className="settings-divider"/>

              <button className="settings-item danger" onClick={handleLogout}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}