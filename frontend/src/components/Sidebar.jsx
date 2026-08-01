import { useState, useRef, useEffect } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="lg1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c9a84c"/><stop offset="100%" stopColor="#3a7d44"/>
      </linearGradient>
      <linearGradient id="lg2" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e8c96b"/><stop offset="100%" stopColor="#4a9e57"/>
      </linearGradient>
    </defs>
    <path d="M16 2L28.12 9v14L16 30 3.88 23V9z" fill="url(#lg1)" opacity=".15"/>
    <path d="M16 2L28.12 9v14L16 30 3.88 23V9z" stroke="url(#lg1)" strokeWidth="1.5" fill="none"/>
    <path d="M16 6l2.4 6.2L25 10l-4.2 5 4.2 5-6.6-2.2L16 24l-2.4-6.2L7 20l4.2-5L7 10l6.6 2.2z" fill="url(#lg2)"/>
    <circle cx="16" cy="15" r="2.5" fill="#fff"/>
  </svg>
)

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function HistoryItem({ item, onSelect, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handler(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={`history-item${item.active ? ' active' : ''}`} onClick={() => onSelect(item.id)}>
      <span>{item.title}</span>
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          className="item-menu"
          style={{ display: 'flex' }}
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="item-dropdown">
            <button
              className="item-dropdown-btn danger"
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(item.id) }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Delete chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ open, mobileOpen, history, user, token, onLogout, onNewChat, onSelectHistory, onDeleteHistory }) {
  const [search, setSearch] = useState('')

  const filtered = history.filter(h => h.title.toLowerCase().includes(search.toLowerCase()))

  const now = Date.now()
  const DAY = 86400000
  const today     = filtered.filter(h => !h.ts || now - new Date(h.ts).getTime() < DAY)
  const yesterday = filtered.filter(h => h.ts && now - new Date(h.ts).getTime() >= DAY && now - new Date(h.ts).getTime() < 2 * DAY)
  const older     = filtered.filter(h => h.ts && now - new Date(h.ts).getTime() >= 2 * DAY)
  const groups    = [{ label: 'Today', items: today }, { label: 'Yesterday', items: yesterday }, { label: 'Older', items: older }]

  async function handleDelete(id) {
    // Optimistic remove
    onDeleteHistory(id)
    try {
      await fetch(`${WORKER_URL}/api/history/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-top">
        <div className="sidebar-header">
          <a className="logo-mark" href="#">
            <Logo />
            <span className="logo-text">Stellar AI</span>
          </a>
        </div>
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New chat
        </button>
      </div>

      <div className="sidebar-search">
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="sidebar-history">
        {filtered.length === 0 && (
          <div style={{ padding: '16px 8px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>No chat history yet</div>
        )}
        {groups.map(({ label, items }) => {
          if (!items.length) return null
          return (
            <div className="history-section" key={label}>
              <div className="history-label">{label}</div>
              {items.map(item => (
                <HistoryItem key={item.id} item={item} onSelect={onSelectHistory} onDelete={handleDelete} />
              ))}
            </div>
          )
        })}
      </div>

      <div className="sidebar-bottom">
        <div className="profile-card" onClick={onLogout} title="Sign out">
          <div className="avatar">{getInitials(user?.name || user?.email)}</div>
          <div className="profile-info">
            <div className="profile-name">{user?.name || user?.email}</div>
            <div className="profile-sub">Sign out</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
      </div>
    </aside>
  )
}