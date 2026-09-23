import { reportUsage, estimateTokens } from '../revenium.js'

export async function handleImagine(req, env, ctx) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  const aiCallStart = Date.now()

  try {
    const response = await env.AI.run(
      '@cf/black-forest-labs/flux-1-schnell',
      { prompt, num_steps: 4 }
    )

    // Workers AI returns { image: base64string } for image models — use it directly
    const base64 = response.image
    if (!base64) throw new Error('No image returned from Workers AI')

    const dataUrl = `data:image/png;base64,${base64}`

    // Image models return no token usage — meter the prompt only (estimated)
    // so image-generation activity still shows up in Revenium, distinguishable
    // by operationType. outputTokenCount stays 0 since there's no text output.
    const promptTokenEstimate = estimateTokens(prompt)
    ctx?.waitUntil(reportUsage(env, {
      model: '@cf/black-forest-labs/flux-1-schnell',
      sessionId: req.user?.id,
      usage: {
        inputTokenCount: promptTokenEstimate,
        outputTokenCount: 0,
        totalTokenCount: promptTokenEstimate,
      },
      operationType: 'IMAGE',
      requestStartTime: aiCallStart,
    }))

    return new Response(JSON.stringify({ url: dataUrl, prompt }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Imagine error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
