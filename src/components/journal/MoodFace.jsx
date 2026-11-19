// A mood drawn as a face (1 Awful … 5 Great), replacing the emoji.
// Colours come from --mood-1…5, so dark mode adjusts them.
const MOUTHS = {
  1: 'M10 22 Q16 16 22 22',
  2: 'M10 21 Q16 18.5 22 21',
  3: 'M10.5 20 L21.5 20',
  4: 'M10 18.5 Q16 23 22 18.5',
  5: 'M9 17.5 Q16 25.5 23 17.5',
}

export default function MoodFace({ mood, size = 40, ...props }) {
  if (!MOUTHS[mood]) return null
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mood-face" {...props}>
      <circle cx="16" cy="16" r="15" fill={`var(--mood-${mood})`} />
      <circle cx="11.5" cy="13" r="1.7" fill="#14201b" fillOpacity="0.8" />
      <circle cx="20.5" cy="13" r="1.7" fill="#14201b" fillOpacity="0.8" />
      <path
        d={MOUTHS[mood]}
        fill="none"
        stroke="#14201b"
        strokeOpacity="0.8"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
