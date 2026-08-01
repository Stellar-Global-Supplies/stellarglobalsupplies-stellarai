async function resolveSecret(binding) {
  return typeof binding?.get === 'function' ? await binding.get() : binding
}

export async function handleImagine(req, env) {
  const { prompt } = await req.json()
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  const gradioUrl = (await resolveSecret(env.GRADIO_URL) || '').replace(/\/$/, '')
  if (!gradioUrl) return new Response(JSON.stringify({ error: 'GRADIO_URL not configured' }), { status: 500 })

  try {
    // Try Gradio 4.x queue API first (used by FLUX and newer spaces)
    const joinRes = await fetch(`${gradioUrl}/queue/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [prompt],
        fn_index: 0,
        session_hash: Math.random().toString(36).slice(2),
      }),
    })

    if (joinRes.ok) {
      const { event_id } = await joinRes.json()

      // Poll the data stream for result
      const dataRes = await fetch(`${gradioUrl}/queue/data?session_hash=${event_id}`, {
        headers: { Accept: 'text/event-stream' },
      })

      const text = await dataRes.text()
      const lines = text.split('\n').filter(l => l.startsWith('data:'))

      for (const line of lines) {
        try {
          const evt = JSON.parse(line.slice(5))
          if (evt.msg === 'process_completed') {
            const imgData = evt.output?.data?.[0]
            if (!imgData) throw new Error('No image in response')
            const url = typeof imgData === 'string'
              ? (imgData.startsWith('data:') ? imgData : `${gradioUrl}/file=${imgData}`)
              : imgData?.url || imgData?.path
            return new Response(JSON.stringify({ url, prompt }), {
              headers: { 'Content-Type': 'application/json' }
            })
          }
          if (evt.msg === 'process_errored') {
            throw new Error(evt.output?.error || 'Generation failed')
          }
        } catch {}
      }
    }

    // Fallback: try legacy /api/predict endpoint (older spaces)
    const predictRes = await fetch(`${gradioUrl}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn_index: 0, data: [prompt] }),
    })

    if (!predictRes.ok) throw new Error(`Gradio error ${predictRes.status}`)

    const data = await predictRes.json()
    const imgData = data?.data?.[0]
    if (!imgData) throw new Error('No image returned')

    const url = typeof imgData === 'string'
      ? (imgData.startsWith('data:') ? imgData : `${gradioUrl}/file=${imgData}`)
      : imgData?.url || imgData?.path

    return new Response(JSON.stringify({ url, prompt }), {
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