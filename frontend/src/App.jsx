import { useState, useRef, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ChatArea from './components/ChatArea'
import InputArea from './components/InputArea'
import EmptyState from './components/EmptyState'
import Login from './components/Login'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

function getStoredAuth() {
  try {
    const token = localStorage.getItem('token')
    const user  = JSON.parse(localStorage.getItem('user') || 'null')
    return token && user ? { token, user } : null
  } catch { return null }
}

export default function App() {
  const stored = getStoredAuth()

  const [auth, setAuth]             = useState(stored)          // { token, user } | null
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [model, setModel]           = useState('llama-3.3-70b-versatile')
  const [entData, setEntData]       = useState(false)
  const [imgGen, setImgGen]         = useState(false)
  const [webSearch, setWebSearch]   = useState(false)
  const [messages, setMessages]     = useState([])
  const [isTyping, setIsTyping]     = useState(false)
  const [history, setHistory]       = useState([])
  const chatRef                     = useRef(null)

  const token = auth?.token || ''

  // ── Load real history from worker ──
  useEffect(() => {
    if (!token) return
    fetch(`${WORKER_URL}/api/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sessions) {
          setHistory(data.sessions.map(s => ({
            id: s.id,
            title: s.title || 'Untitled chat',
            active: false,
            ts: s.updated_at,
          })))
        }
      })
      .catch(() => {})
  }, [token])

  const scrollToBottom = useCallback(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }])
  }, [])

  const updateLastAssistant = useCallback((updater) => {
    setMessages(prev => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') { next[i] = updater(next[i]); break }
      }
      return next
    })
  }, [])

  function handleLogin(newToken, user) {
    setAuth({ token: newToken, user })
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setAuth(null)
    setMessages([])
    setHistory([])
  }

  const sendMessage = useCallback(async ({ text, file, imgPrompt }) => {
    if (isTyping) return

    addMessage({ role: 'user', text, file: file?.name, ts: Date.now() })

    if (text) {
      const title = text.length > 36 ? text.slice(0, 36) + '…' : text
      setHistory(prev => {
        const hasActive = prev.some(h => h.active)
        if (hasActive) return prev  // continue existing session, don't add new entry
        return [{ id: Date.now(), title, active: true }, ...prev.map(h => ({ ...h, active: false }))]
      })
    }

    setIsTyping(true)

    // Image gen branch
    if (imgGen && imgPrompt) {
      addMessage({ role: 'assistant', text: '', status: 'Generating image…', imgPrompt, ts: Date.now() })
      try {
        const res = await fetch(`${WORKER_URL}/api/imagine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt: imgPrompt, model })
        })
        const data = await res.json()
        updateLastAssistant(m => ({ ...m, status: null, imgUrl: data.url, text: `Image generated for: "${imgPrompt}"` }))
      } catch {
        updateLastAssistant(m => ({ ...m, status: null, text: 'Image generation failed. Please try again.' }))
      }
      setIsTyping(false)
      return
    }

    // Chat branch — SSE streaming
    addMessage({ role: 'assistant', text: '', status: 'Launching worker…', ts: Date.now() })

    try {
      let body, headers = { Authorization: `Bearer ${token}` }

      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('message', text || '')
        fd.append('model', model)
        fd.append('entData', entData)
        fd.append('webSearch', webSearch)
        fd.append('history', JSON.stringify(messages.slice(-10).filter(m => m.text).map(m => ({ role: m.role, content: m.text }))))
        body = fd
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({ message: text, model, entData, webSearch, history: messages.slice(-10).filter(m => m.text).map(m => ({ role: m.role, content: m.text })) })
      }

      const res = await fetch(`${WORKER_URL}/api/chat`, { method: 'POST', headers, body })

      if (res.status === 401) {
        handleLogout()
        return
      }
      if (!res.ok) throw new Error(`Worker error ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'status')      updateLastAssistant(m => ({ ...m, status: evt.text }))
            else if (evt.type === 'token')  updateLastAssistant(m => ({ ...m, status: null, text: (m.text || '') + evt.delta }))
            else if (evt.type === 'done')   updateLastAssistant(m => ({ ...m, status: null }))
          } catch {}
        }
      }
    } catch (err) {
      updateLastAssistant(m => ({ ...m, status: null, text: `Error: ${err.message}` }))
    }

    setIsTyping(false)
  }, [isTyping, model, entData, imgGen, webSearch, messages, token, addMessage, updateLastAssistant])

  // ── Not logged in → show login page ──
  if (!auth) return <Login onLogin={handleLogin} />

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        history={history}
        user={auth.user}
        token={token}
        onLogout={handleLogout}
        onNewChat={() => setMessages([])}
        onSelectHistory={id => setHistory(prev => prev.map(h => ({ ...h, active: h.id === id })))}
        onDeleteHistory={id => setHistory(prev => prev.filter(h => h.id !== id))}
      />
      <main className="main">
        <Topbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          model={model}
          onModelChange={setModel}
          entData={entData}
          onToggleEnt={() => setEntData(v => !v)}
          imgGen={imgGen}
          onToggleImg={() => setImgGen(v => !v)}
        />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {messages.length === 0
            ? <EmptyState onSuggestion={text => sendMessage({ text })} />
            : <ChatArea ref={chatRef} messages={messages} />
          }
        </div>
        <InputArea
          onSend={sendMessage}
          isTyping={isTyping}
          imgGen={imgGen}
          webSearch={webSearch}
          onToggleWebSearch={() => setWebSearch(v => !v)}
        />
      </main>
    </div>
  )
}