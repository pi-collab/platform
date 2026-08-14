'use client'

import { useState, useTransition } from 'react'
import { createInvite, revokeInvite, removeTeamMember, toggleAdmin } from './actions'

interface Member {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  joinedAt: string
  isCurrentUser: boolean
}

interface PendingInvite {
  id: string
  email: string
  expiresAt: string
}

interface Props {
  brandName: string
  isAdmin: boolean
  members: Member[]
  pendingInvites: PendingInvite[]
}

export default function TeamPage({ brandName, isAdmin, members, pendingInvites }: Props) {
  const [showInviteModal, setShowInviteModal] = useState(false)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Team</h1>
          <p style={styles.subtitle}>Manage who has access to {brandName}</p>
        </div>
        {isAdmin && (
          <button style={styles.primaryBtn} onClick={() => setShowInviteModal(true)}>
            Invite team member
          </button>
        )}
      </div>

      {/* Members table */}
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Member</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Joined</th>
              {isAdmin && <th style={{ ...styles.th, width: 100 }}></th>}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <MemberRow key={m.id} member={m} isAdmin={isAdmin} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invites — admin only */}
      {isAdmin && pendingInvites.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={styles.sectionTitle}>Pending invites</h2>
          <div style={styles.card}>
            {pendingInvites.map(inv => (
              <InviteRow key={inv.id} invite={inv} />
            ))}
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}
    </div>
  )
}

// ── Member Row ────────────────────────────────────────────────────

function MemberRow({ member, isAdmin }: { member: Member; isAdmin: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleToggleRole = () => {
    setError('')
    startTransition(async () => {
      const res = await toggleAdmin(member.id)
      if (res.error) setError(res.error)
    })
  }

  const handleRemove = () => {
    if (!confirm(`Remove ${member.email} from the team?`)) return
    setError('')
    startTransition(async () => {
      const res = await removeTeamMember(member.id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <tr style={styles.tr}>
      <td style={styles.td}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, color: '#16100B' }}>
            <span data-ph-mask>{member.name || member.email}</span>
            {member.isCurrentUser && <span style={{ color: '#7A6D61', fontWeight: 400 }}> (you)</span>}
          </span>
          {member.name && (
            <span style={{ fontSize: '0.8125rem', color: '#7A6D61' }}>{member.email}</span>
          )}
          {error && <span style={{ fontSize: '0.8125rem', color: '#c53030' }}>{error}</span>}
        </div>
      </td>
      <td style={styles.td}>
        <span style={{
          ...styles.badge,
          background: member.isAdmin ? '#16100B' : '#F0EBE1',
          color: member.isAdmin ? '#fff' : '#7A6D61',
        }}>
          {member.isAdmin ? 'Admin' : 'Member'}
        </span>
      </td>
      <td style={{ ...styles.td, color: '#7A6D61', fontSize: '0.875rem' }}>
        {new Date(member.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      {isAdmin && (
        <td style={{ ...styles.td, textAlign: 'right' }}>
          {!member.isCurrentUser && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={styles.smallBtn}
                onClick={handleToggleRole}
                disabled={pending}
                title={member.isAdmin ? 'Demote to member' : 'Promote to admin'}
              >
                {member.isAdmin ? 'Demote' : 'Promote'}
              </button>
              <button
                style={{ ...styles.smallBtn, color: '#c53030' }}
                onClick={handleRemove}
                disabled={pending}
              >
                Remove
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

// ── Invite Row ────────────────────────────────────────────────────

function InviteRow({ invite }: { invite: PendingInvite }) {
  const [pending, startTransition] = useTransition()
  const [revoked, setRevoked] = useState(false)

  const handleRevoke = () => {
    startTransition(async () => {
      const res = await revokeInvite(invite.id)
      if (!res.error) setRevoked(true)
    })
  }

  if (revoked) return null

  const daysLeft = Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #F0EBE1' }}>
      <div>
        <span style={{ fontSize: '0.9375rem', color: '#16100B' }}>{invite.email}</span>
        <span style={{ fontSize: '0.8125rem', color: '#7A6D61', marginLeft: 8 }}>
          expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
        </span>
      </div>
      <button style={styles.smallBtn} onClick={handleRevoke} disabled={pending}>
        Revoke
      </button>
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────────

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ inviteUrl?: string; error?: string; email?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await createInvite(email)
      setResult(res)
    })
  }

  const handleCopy = () => {
    if (result?.inviteUrl) {
      navigator.clipboard.writeText(result.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.125rem', fontWeight: 700, color: '#16100B', margin: '0 0 0.5rem' }}>
          Invite team member
        </h2>

        {!result?.inviteUrl ? (
          <>
            <p style={{ fontSize: '0.875rem', color: '#7A6D61', margin: '0 0 1rem' }}>
              They'll get a link to join your brand. The invite expires in 7 days.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={styles.input}
                autoFocus
              />
              {result?.error && (
                <p style={{ fontSize: '0.8125rem', color: '#c53030', margin: '0.5rem 0 0' }}>{result.error}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.secondaryBtn} onClick={onClose}>Cancel</button>
                <button type="submit" style={styles.primaryBtn} disabled={pending}>
                  {pending ? 'Sending...' : 'Send invite'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', color: '#16100B', margin: '0 0 0.75rem' }}>
              Invite created for <strong>{result.email}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                readOnly
                value={result.inviteUrl}
                style={{ ...styles.input, flex: 1, fontSize: '0.8125rem', color: '#7A6D61' }}
                onFocus={e => e.target.select()}
              />
              <button style={styles.primaryBtn} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#7A6D61', margin: '0.75rem 0 0' }}>
              Share this link via Slack, WhatsApp, or email. It expires in 7 days.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={styles.secondaryBtn} onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  title: { fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 700, color: '#16100B', margin: 0 },
  subtitle: { fontSize: '0.9375rem', color: '#7A6D61', margin: '0.25rem 0 0' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: '1rem', fontWeight: 700, color: '#16100B', margin: '0 0 0.75rem' },
  card: { background: '#fff', border: '1px solid #DDD3BE', borderRadius: 12, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left' as const, padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#7A6D61', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #F0EBE1' },
  tr: { borderBottom: '1px solid #F0EBE1' },
  td: { padding: '0.75rem 1rem', fontSize: '0.9375rem', verticalAlign: 'middle' as const },
  badge: { display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 },
  primaryBtn: { padding: '0.5rem 1rem', background: '#16100B', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '0.5rem 1rem', background: '#F0EBE1', color: '#16100B', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' },
  smallBtn: { padding: '0.25rem 0.5rem', background: 'transparent', border: '1px solid #DDD3BE', borderRadius: 6, fontSize: '0.8125rem', color: '#7A6D61', cursor: 'pointer' },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  input: { width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #DDD3BE', borderRadius: 8, fontSize: '0.9375rem', outline: 'none', boxSizing: 'border-box' as const },
}
