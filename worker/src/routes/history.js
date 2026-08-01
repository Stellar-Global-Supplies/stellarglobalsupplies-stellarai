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