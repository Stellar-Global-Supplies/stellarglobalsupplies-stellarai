export async function handleImagine(req, env) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  try {
    const response = await env.AI.run(
      '@cf/black-forest-labs/flux-1-schnell',
      { prompt, num_steps: 4 }
    )

    // Workers AI returns { image: base64string } for image models — use it directly
    const base64 = response.image
    if (!base64) throw new Error('No image returned from Workers AI')

    const dataUrl = `data:image/png;base64,${base64}`

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