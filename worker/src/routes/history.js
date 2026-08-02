export async function handleHistory(req, env) {
  const url       = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')

  if (sessionId) {
    const messages = await env.DB.prepare(
      `SELECT id, role, content, model, created_at FROM messages
       WHERE session_id = ? ORDER BY created_at ASC LIMIT 200`
    ).bind(sessionId).all()
    return Response.json({ messages: messages.results })
  }

  const sessions = await env.DB.prepare(
    `SELECT id, title, created_at, updated_at FROM sessions
     WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
  ).bind(req.user.id).all()

  return Response.json({ sessions: sessions.results })
}

export async function handleDeleteSession(req, env) {
  const { id } = req.params
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 })

  // Ensure the session belongs to this user
  const session = await env.DB.prepare(
    'SELECT id FROM sessions WHERE id = ? AND user_id = ?'
  ).bind(id, req.user.id).first()

  if (!session) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id),
  ])

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}

export async function handleDeleteAllSessions(req, env) {
  const sessions = await env.DB.prepare(
    'SELECT id FROM sessions WHERE user_id = ?'
  ).bind(req.user.id).all()

  if (sessions.results?.length) {
    const ids = sessions.results.map(s => s.id)
    // Delete messages first (FK), then sessions
    for (const id of ids) {
      await env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(id).run()
    }
    await env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ?`
    ).bind(req.user.id).run()
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
}