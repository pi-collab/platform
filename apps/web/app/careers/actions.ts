'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountEmail } from '@/lib/email'
import { renderAccountEmail } from '@/lib/email-template'
import { BRAND_NAME } from '@/lib/content'
import { roleBySlug } from '@/lib/careers'

export type ApplyResult = { status: 'ok' } | { status: 'error'; message: string }

/** 4 MB. Comfortably inside Resend's payload ceiling once base64 inflates it. */
const MAX_BYTES = 4 * 1024 * 1024

const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
])

/**
 * Receive an application and mail it to the team.
 *
 * The CV is attached to the email and NOT stored. Nothing here needs a copy of
 * someone's CV at rest, and not keeping one means no bucket, no retention
 * policy and no deletion request to service later. The audit row records that
 * an application arrived and from whom — never the file.
 */
export async function submitApplication(formData: FormData): Promise<ApplyResult> {
  const slug = String(formData.get('role') ?? '')
  const role = await roleBySlug(slug)
  if (!role) return { status: 'error', message: 'That role is no longer open.' }

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const resume = formData.get('resume')

  // Validated here rather than trusting the form: a server action is directly
  // callable, so the browser's `required` is convenience, not a boundary.
  if (!name) return { status: 'error', message: 'Your name is required.' }
  if (name.length > 120) return { status: 'error', message: 'That name is too long.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { status: 'error', message: 'Enter a valid email address.' }
  }
  if (phone.length > 32) return { status: 'error', message: 'That phone number is too long.' }
  if (note.length > 4000) return { status: 'error', message: 'Please keep the note under 4000 characters.' }

  if (!(resume instanceof File) || resume.size === 0) {
    return { status: 'error', message: 'Attach your CV.' }
  }
  if (resume.size > MAX_BYTES) {
    return { status: 'error', message: 'That file is over 4 MB. Please attach a smaller one.' }
  }
  // Type checked by MIME and extension both: a browser can report an empty or
  // wrong type, and an extension alone is trivially renamed.
  const ext = resume.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED.has(resume.type) && !['pdf', 'doc', 'docx'].includes(ext)) {
    return { status: 'error', message: 'CV must be a PDF or Word document.' }
  }

  const to = process.env.CAREERS_NOTIFY_EMAIL || process.env.OPS_NOTIFY_EMAIL
  if (!to) {
    console.error('[careers] neither CAREERS_NOTIFY_EMAIL nor OPS_NOTIFY_EMAIL is set')
    return { status: 'error', message: 'We could not receive that just now. Please email us instead.' }
  }

  // Recorded before the send, so an application still leaves a trace if the
  // mail fails. The file itself is never written down.
  const admin = createAdminClient()
  await admin.from('events').insert({
    event_type: 'careers.application_received',
    detail: {
      role: role.slug,
      name,
      email,
      phone: phone || null,
      resume_filename: resume.name,
      resume_bytes: resume.size,
    },
  })

  const buffer = Buffer.from(await resume.arrayBuffer())

  const { html, text } = renderAccountEmail({
    heading: `${name} applied for ${role.title}`,
    body: [
      `${name} applied for ${role.title} (${role.team}).`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : 'Phone: not given',
      note ? `\nTheir note:\n${note}` : '\nNo note included.',
      '\nTheir CV is attached.',
    ],
    footerNote: `Sent to the careers address for ${BRAND_NAME}.`,
  })

  const res = await sendAccountEmail({
    to: [to],
    subject: `Application: ${role.title} — ${name}`,
    html,
    text,
    // Replying to the notification replies to the applicant, which is what
    // anyone reading it will try to do.
    replyTo: email,
    attachments: [{
      filename: resume.name,
      content: buffer.toString('base64'),
      contentType: resume.type || 'application/octet-stream',
    }],
  })

  if (!res.ok) {
    console.error(`[careers] send failed role=${role.slug}: ${res.reason}`)
    // The application IS recorded. Saying it failed would invite a resend of
    // something we already have.
    return { status: 'ok' }
  }

  return { status: 'ok' }
}
