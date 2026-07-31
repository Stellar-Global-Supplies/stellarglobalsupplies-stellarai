export async function handleImagine(req) {
  const { prompt, model } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  try {
    const gradioUrl = req.env.GRADIO_URL  // e.g. https://your-space.hf.space

    // Gradio REST API call (Stable Diffusion space)
    const res = await fetch(`${gradioUrl}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fn_index: 0,
        data: [prompt, '', 7.5, 50],  // [prompt, negative, guidance, steps]
      }),
    })

    if (!res.ok) throw new Error(`Gradio error ${res.status}`)
    const data = await res.json()

    // Gradio returns base64 image in data[0]
    const imgData = data?.data?.[0]
    if (!imgData) throw new Error('No image returned')

    // Return as data URL or extract URL if Gradio returned a path
    const url = imgData.startsWith('data:') ? imgData : `${gradioUrl}/file=${imgData}`

    return new Response(JSON.stringify({ url, prompt }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
