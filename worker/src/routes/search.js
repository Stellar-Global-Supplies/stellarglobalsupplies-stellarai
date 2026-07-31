import { tavilySearch } from '../tavily.js'

export async function handleSearch(req) {
  const { query } = await req.json()
  if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400 })

  const results = await tavilySearch(query, req.env.TAVILY_API_KEY)
  return Response.json({ results })
}
