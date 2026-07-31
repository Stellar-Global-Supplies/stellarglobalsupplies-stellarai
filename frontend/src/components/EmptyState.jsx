const SUGGESTIONS = [
  { title: 'Analyse supplier data',        sub: 'Upload a CSV or Excel file to get insights'         },
  { title: 'Compare raw material prices',  sub: 'Search current market rates and trends'             },
  { title: 'Query internal inventory',     sub: "Turn on Ent data to search your org's stock"        },
  { title: 'Generate a product image',     sub: 'Turn on Image gen and describe what you need'       },
]

export default function EmptyState({ onSuggestion }) {
  return (
    <div className="empty-state">
      <div className="empty-logo">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <defs>
            <linearGradient id="elg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#c9a84c"/>
              <stop offset="100%" stopColor="#3a7d44"/>
            </linearGradient>
            <linearGradient id="elg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#e8c96b"/>
              <stop offset="100%" stopColor="#4a9e57"/>
            </linearGradient>
          </defs>
          <path d="M28 4L51.2 17v26L28 56 4.8 43V17z" fill="url(#elg1)" opacity=".12"/>
          <path d="M28 4L51.2 17v26L28 56 4.8 43V17z" stroke="url(#elg1)" strokeWidth="2" fill="none"/>
          <path d="M28 11l4.2 10.8L43 17l-7.3 8.7 7.3 8.7-11.5-3.8L28 42l-4.2-10.8L12.5 34.4l7.3-8.7L12.5 17l11.3 4.8z" fill="url(#elg2)"/>
          <circle cx="28" cy="26" r="4" fill="#fff"/>
        </svg>
        <div className="empty-logo-text">How can I help you today?</div>
      </div>
      <p className="empty-sub">Ask about industrial supplies, analyse data files, search the web, or query your org's internal data.</p>
      <div className="suggestions">
        {SUGGESTIONS.map(s => (
          <button key={s.title} className="suggestion-card" onClick={() => onSuggestion(s.title)}>
            <div className="s-title">{s.title}</div>
            <div className="s-sub">{s.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
