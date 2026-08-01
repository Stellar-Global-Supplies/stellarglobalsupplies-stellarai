import { tavilySearch } from '../tavily.js'

async function resolveSecret(binding) {
  return typeof binding?.get === 'function' ? await binding.get() : binding
}

export async function handleSearch(req, env) {
  const { query } = await req.json()
  if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400 })

  const tavilyKey = await resolveSecret(env.TAVILY_API_KEY)
  const results = await tavilySearch(query, tavilyKey)
  return Response.json({ results })
}