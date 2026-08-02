export async function handleImagine(req, env) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  try {
    // Cloudflare Workers AI — free daily budget, no external API needed
    // Model: FLUX.1-schnell — fast, high quality
    const response = await env.AI.run(
      '@cf/black-forest-labs/flux-1-schnell',
      {
        prompt,
        num_steps: 4,  // schnell is optimised for 4 steps
      }
    )

    // Response is a ReadableStream of the raw image bytes (PNG)
    const buffer   = await new Response(response.image).arrayBuffer()
    const base64   = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    const dataUrl  = `data:image/png;base64,${base64}`

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