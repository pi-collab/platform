'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOps } from '@/lib/ops-capabilities'
import { logOpsEvent } from '@/lib/ops-audit'
import { LEAD_STAGES, isLeadStage, FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '@/lib/pipeline'

/**
 * Pipeline writes.
 *
 * Every one of these is audited. That is not decoration here: one of the three
 * people holding this role works at an adjacent company, and `ops_events` is
 * what makes their activity reviewable after the fact. Per CLAUDE.md the audit
 * write is not best-effort — `logOpsEvent` throws on failure and the action
 * fails with it, so there is no path that changes a row without a record.
 */

type Result = { ok: true } | { ok: false; error: string }

const KINDS = new Set(['brand', 'creator'])

function clean(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export async function createLead(form: FormData): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }

  const kind = clean(form.get('kind'))
  const name = clean(form.get('name'))
  if (!kind || !KINDS.has(kind)) return { ok: false, error: 'Pick brand or creator.' }
  if (!name) return { ok: false, error: 'A name is required.' }

  const stage = clean(form.get('stage')) ?? 'contacted'
  if (!isLeadStage(stage)) return { ok: false, error: 'Unknown stage.' }

  // followers is a bigint; a non-numeric string would be a database error
  // surfaced as a stack trace rather than a message anyone can act on.
  const followersRaw = clean(form.get('followers'))
  const followers = followersRaw ? Number(followersRaw.replace(/[,\s]/g, '')) : null
  if (followers !== null && (!Number.isFinite(followers) || followers < 0)) {
    return { ok: false, error: 'Followers must be a number.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pipeline_leads')
    .insert({
      kind,
      name,
      handle: clean(form.get('handle')),
      contact_email: clean(form.get('contact_email')),
      contact_phone: clean(form.get('contact_phone')),
      platform: clean(form.get('platform')),
      followers: followers === null ? null : Math.round(followers),
      niche: clean(form.get('niche')),
      notes: clean(form.get('notes')),
      stage,
      owner_email: clean(form.get('owner_email')) ?? actor.user.email ?? null,
      source: clean(form.get('source')),
      created_by: actor.user.email ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  await logOpsEvent(actor.user, 'pipeline.lead_created', 'pipeline_leads', data.id, {
    kind, name, stage, role: actor.role,
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

export async function updateLead(form: FormData): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }

  const id = clean(form.get('id'))
  if (!id) return { ok: false, error: 'Missing lead.' }

  const admin = createAdminClient()
  // Read first so the audit entry can record what changed, not just what it
  // became. "Stage set to lost" is much less useful than "interested → lost".
  const { data: before } = await admin
    .from('pipeline_leads')
    .select('stage, owner_email, source, notes, name')
    .eq('id', id)
    .maybeSingle()
  if (!before) return { ok: false, error: 'Lead not found.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const stage = clean(form.get('stage'))
  if (stage) {
    if (!isLeadStage(stage)) return { ok: false, error: 'Unknown stage.' }
    patch.stage = stage
  }
  for (const field of ['name', 'handle', 'contact_email', 'contact_phone', 'platform', 'niche', 'notes', 'owner_email', 'source'] as const) {
    if (form.has(field)) patch[field] = clean(form.get(field))
  }
  if (form.has('followers')) {
    const raw = clean(form.get('followers'))
    const n = raw ? Number(raw.replace(/[,\s]/g, '')) : null
    if (n !== null && (!Number.isFinite(n) || n < 0)) return { ok: false, error: 'Followers must be a number.' }
    patch.followers = n === null ? null : Math.round(n)
  }

  /* Any edit is a touch. This is what makes "nothing has happened here for
     three weeks" answerable, which is the one column a pipeline actually gets
     managed by. */
  patch.last_touch_at = new Date().toISOString()

  const { error } = await admin.from('pipeline_leads').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logOpsEvent(actor.user, 'pipeline.lead_updated', 'pipeline_leads', id, {
    role: actor.role,
    name: before.name,
    ...(patch.stage && patch.stage !== before.stage
      ? { stage_from: before.stage, stage_to: patch.stage }
      : {}),
    fields: Object.keys(patch).filter((k) => k !== 'updated_at' && k !== 'last_touch_at'),
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

/**
 * Link a lead to the real row it became.
 *
 * Kept as an explicit action rather than automatic matching on email or handle.
 * A wrong automatic link would attach one company's outreach history to
 * another's record, and nothing downstream would look wrong enough to catch it.
 */
export async function linkLead(leadId: string, targetId: string): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('pipeline_leads').select('id, kind, name').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead not found.' }

  // Confirm the target exists and is the right kind before writing. The CHECK
  // constraint stops a creator lead pointing at a brand, but it cannot tell us
  // the id refers to anything at all.
  const table = lead.kind === 'brand' ? 'brands' : 'creators'
  const { data: target } = await admin.from(table).select('id').eq('id', targetId).maybeSingle()
  if (!target) return { ok: false, error: `No ${lead.kind} with that id.` }

  const patch = lead.kind === 'brand'
    ? { brand_id: targetId, creator_id: null }
    : { creator_id: targetId, brand_id: null }

  const { error } = await admin
    .from('pipeline_leads')
    .update({ ...patch, stage: 'signed_up', last_touch_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  await logOpsEvent(actor.user, 'pipeline.lead_linked', 'pipeline_leads', leadId, {
    role: actor.role, kind: lead.kind, name: lead.name, target_id: targetId,
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

export async function deleteLead(leadId: string): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('pipeline_leads').select('kind, name, stage').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'Lead not found.' }

  const { error } = await admin.from('pipeline_leads').delete().eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  /* Deleting a lead touches nothing outside this table — no brand, no creator,
     no deal — so it is safe for the outreach role in a way that
     `deleteCreator` is not. The row is still worth recording on the way out,
     since it is the one write here that destroys history. */
  await logOpsEvent(actor.user, 'pipeline.lead_deleted', 'pipeline_leads', leadId, {
    role: actor.role, kind: lead.kind, name: lead.name, stage: lead.stage,
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

// ── Feedback log ────────────────────────────────────────────────────────────

export async function logFeedback(form: FormData): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }

  const kind = clean(form.get('kind'))
  const body = clean(form.get('body'))
  const category = clean(form.get('category')) ?? 'other'
  if (!kind || !KINDS.has(kind)) return { ok: false, error: 'Pick brand or creator.' }
  if (!body) return { ok: false, error: 'Write what they said.' }
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: 'Unknown category.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pipeline_feedback')
    .insert({
      kind,
      body,
      category,
      lead_id: clean(form.get('lead_id')),
      source_name: clean(form.get('source_name')),
      logged_by: actor.user.email ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  await logOpsEvent(actor.user, 'pipeline.feedback_logged', 'pipeline_feedback', data.id, {
    role: actor.role, kind, category,
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

export async function setFeedbackStatus(id: string, status: string): Promise<Result> {
  const actor = await requireOps('pipeline.write')
  if (!actor) return { ok: false, error: 'Not authorised.' }
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Unknown status.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pipeline_feedback')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  await logOpsEvent(actor.user, 'pipeline.feedback_status', 'pipeline_feedback', id, {
    role: actor.role, status,
  })
  revalidatePath('/ops/pipeline')
  return { ok: true }
}

/** Exported for the filter UI so the stage list has one definition. */
export async function stageOptions() {
  return LEAD_STAGES
}
