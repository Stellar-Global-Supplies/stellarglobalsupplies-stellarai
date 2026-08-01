async function resolveSecret(binding) {
  return typeof binding?.get === 'function' ? await binding.get() : binding
}

export async function handleImagine(req, env) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  try {
    const gradioUrl = await resolveSecret(env.GRADIO_URL)
    const res = await fetch(`${gradioUrl}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn_index: 0, data: [prompt, '', 7.5, 50] }),
    })

    if (!res.ok) throw new Error(`Gradio error ${res.status}`)
    const data = await res.json()
    const imgData = data?.data?.[0]
    if (!imgData) throw new Error('No image returned')
    const url = imgData.startsWith('data:') ? imgData : `${gradioUrl}/file=${imgData}`

    return new Response(JSON.stringify({ url, prompt }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}