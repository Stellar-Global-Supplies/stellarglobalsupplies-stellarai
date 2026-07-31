/**
 * Tavily search — designed for LLM consumption.
 * Returns clean structured results ready to inject into Groq context.
 */
export async function tavilySearch(query, apiKey, maxResults = 5) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:      apiKey,
      query,
      search_depth: 'basic',
      max_results:  maxResults,
      include_answer: true,
    }),
  })

  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const data = await res.json()

  return (data.results || []).map(r => ({
    title:   r.title,
    url:     r.url,
    content: r.content?.slice(0, 600) || '',   // trim per source
  }))
}
