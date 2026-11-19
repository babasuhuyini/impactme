// Privacy Policy and Terms: readable without signing in. The wording comes
// from Tayyib; these are placeholders with the section headings only.
// Do not write policy text here.

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useBack } from '../../components/account/AuthLayout.jsx'
import { ArrowLeftIcon } from '../../components/icons.jsx'

const PRIVACY = [
  ['collect', 'What we collect'],
  ['health', 'Journal, mood and energy entries (health information)'],
  ['why', 'Why we collect it'],
  ['where', 'Where it is stored'],
  ['processors', 'Who processes it for us: Supabase, Resend, Google, Cloudflare'],
  ['retention', 'How long we keep it'],
  ['rights', 'Your rights and how to use them'],
  ['age', 'Age'],
  ['contact', 'Contact'],
  ['changes', 'Changes to this policy'],
]

const TERMS = [
  ['about', 'About ImpactMe'],
  ['account', 'Your account'],
  ['use', 'Using ImpactMe'],
  ['content', 'Your content'],
  ['availability', 'Availability and changes'],
  ['ending', 'Ending your account'],
  ['liability', 'Liability'],
  ['law', 'Governing law'],
  ['contact', 'Contact'],
  ['changes', 'Changes to these terms'],
]

function LegalPage({ title, sections }) {
  const back = useBack('/')
  const { search } = useLocation()

  // ?section=health scrolls to that part (anchors can't be used with hash routing).
  useEffect(() => {
    const id = new URLSearchParams(search).get('section')
    if (id) document.getElementById(`legal-${id}`)?.scrollIntoView()
  }, [search])

  return (
    <div className="legal">
      <div className="legal-page">
        <button type="button" className="auth-back" onClick={back} aria-label="Back">
          <ArrowLeftIcon width={22} height={22} />
        </button>
        <h1 className="auth-title">{title}</h1>
        <p className="legal-placeholder">[TO BE WRITTEN BY TAYYIB]</p>
        {sections.map(([id, heading]) => (
          <section key={id} id={`legal-${id}`}>
            <h2>{heading}</h2>
            <p className="legal-placeholder">[TO BE WRITTEN BY TAYYIB]</p>
          </section>
        ))}
      </div>
    </div>
  )
}

export const PrivacyPolicy = () => <LegalPage title="Privacy Policy" sections={PRIVACY} />
export const Terms = () => <LegalPage title="Terms" sections={TERMS} />
