export async function handleImagine(req, env) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  try {
    // Pollinations.ai — free, no API key, no signup required
    // Returns image directly as binary, we proxy it as base64 data URL
    const encodedPrompt = encodeURIComponent(prompt)
    const seed = Math.floor(Math.random() * 999999)
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`

    // Fetch the image and convert to base64 so it works cross-origin in the browser
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Pollinations error ${imgRes.status}`)

    const buffer     = await imgRes.arrayBuffer()
    const base64     = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const dataUrl    = `data:${contentType};base64,${base64}`

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