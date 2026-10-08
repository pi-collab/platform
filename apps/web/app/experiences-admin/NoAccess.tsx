import { container, h1, heroCard } from './ui'

/** What anyone outside the Guapd team sees on any console URL. */
export default function NoAccess({ reason }: { reason: 'not_ops' | 'no_operational_access' }) {
  return (
    <div style={container}>
      <section style={{ ...heroCard, maxWidth: 560 }}>
        <h1 style={{ ...h1, fontSize: 30 }}>No access to Experiences</h1>
        <p className="t-body" style={{ margin: '10px 0 0' }}>
          {reason === 'not_ops'
            ? 'Guapd Experiences is for the Guapd team.'
            : 'Experience access is granted per person by a Guapd admin, and has not been turned on for your account.'}
        </p>
      </section>
    </div>
  )
}
