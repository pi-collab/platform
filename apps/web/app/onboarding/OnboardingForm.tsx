'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { submitOnboarding, type OnboardingState } from './actions'
import FormError from '@/components/FormError'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={styles.btn}>
      {pending ? 'Setting up…' : 'Create brand'}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  )
}

export default function OnboardingForm() {
  const [state, action] = useFormState<OnboardingState, FormData>(submitOnboarding, null)

  return (
    <form action={action} style={styles.form}>
      {state?.error && <FormError>{state.error}</FormError>}

      <Field label="Brand name *">
        <input name="name" required style={styles.input} placeholder="e.g. Groww" />
      </Field>

      <Field label="Category *">
        <select name="category" required style={styles.select}>
          <option value="">Select…</option>
          <option value="BFSI/Fintech">BFSI / Fintech</option>
          <option value="D2C">D2C</option>
          <option value="EdTech">EdTech</option>
          <option value="Gaming">Gaming</option>
          <option value="Other">Other</option>
        </select>
      </Field>

      <Field label="Company size *">
        <select name="company_size" required style={styles.select}>
          <option value="">Select…</option>
          <option value="1–10">1–10</option>
          <option value="11–50">11–50</option>
          <option value="51–200">51–200</option>
          <option value="201–500">201–500</option>
          <option value="500+">500+</option>
        </select>
      </Field>

      <Field label="Website">
        <input name="website" type="url" style={styles.input} placeholder="https://…" />
      </Field>

      <Field label="Contact name">
        <input name="contact_name" style={styles.input} placeholder="Your name" />
      </Field>

      <Field label="Instagram handle">
        <input name="instagram" style={styles.input} placeholder="@handle" />
      </Field>

      <Field label="LinkedIn handle">
        <input name="linkedin" style={styles.input} placeholder="company/name" />
      </Field>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#7A6D61', cursor: 'pointer' }}>
        <input type="checkbox" name="terms_accepted" value="yes" required style={{ marginTop: '0.2rem' }} />
        <span>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#16100B', fontWeight: 600, textDecoration: 'underline' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#16100B', fontWeight: 600, textDecoration: 'underline' }}>Privacy Policy</a>
        </span>
      </label>

      <SubmitButton />
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form:  { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  label: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9B8E82' },
  input: { padding: '0.625rem 0.875rem', border: '1px solid #DDD3BE', borderRadius: 8, fontSize: '0.9375rem', fontFamily: 'inherit', background: '#fff', color: '#16100B', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '0.625rem 0.875rem', border: '1px solid #DDD3BE', borderRadius: 8, fontSize: '0.9375rem', fontFamily: 'inherit', background: '#fff', color: '#16100B', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn:   { padding: '0.75rem 2rem', background: '#16100B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: '0.5rem', opacity: 1 },
  error: { fontSize: '0.875rem', color: '#B91C1C', background: '#FEF2F2', padding: '0.625rem 1rem', borderRadius: 8, margin: 0 },
}
