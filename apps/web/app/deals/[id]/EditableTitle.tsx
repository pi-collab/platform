'use client'

import { useState, useRef, useEffect } from 'react'
import { updateDealTitle } from './deal-actions'

export default function EditableTitle({ dealId, title, creatorFirstName }: { dealId: string; title: string; creatorFirstName: string }) {
  const defaultTitle = `Deal with ${creatorFirstName}`
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title || defaultTitle)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  async function save() {
    const trimmed = value.trim()
    if (!trimmed) {
      setValue(title || defaultTitle)
      setEditing(false)
      return
    }
    if (trimmed === title) {
      setEditing(false)
      return
    }
    setSaving(true)
    const res = await updateDealTitle(dealId, trimmed)
    setSaving(false)
    if (res.status === 'ok') {
      setEditing(false)
    } else {
      setValue(title || defaultTitle)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        title="Rename deal"
      >
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.4vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: 0, color: 'var(--ink)' }}>
          {value}
        </h1>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') { setValue(title || defaultTitle); setEditing(false) }
      }}
      onBlur={save}
      disabled={saving}
      placeholder={defaultTitle}
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(26px, 3.4vw, 34px)',
        fontWeight: 700,
        letterSpacing: '-0.025em',
        margin: 0,
        padding: '2px 0',
        border: 'none',
        borderBottom: '2px solid var(--neon-deep)',
        background: 'transparent',
        outline: 'none',
        color: 'var(--ink)',
        width: '100%',
        minWidth: 200,
        opacity: saving ? 0.5 : 1,
      }}
    />
  )
}
