import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/auth/current-member'

export const dynamic = 'force-dynamic'

const BUCKET = 'progress-photos'

const SUB_STAGE_TEAM: Record<string, string> = {
  installation: 'project_management',
  tnc: 'tnc',
}

interface Body {
  projectId?: string
  dataUrl?: string
  /** Brief 059 §4 — present only for a floor_sub_stages upload; omitted
   *  (undefined) preserves the original progress_updates/PIC-only body
   *  shape exactly. */
  stage?: string
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const contentType = /:(.*?);/.exec(head)?.[1] ?? 'application/octet-stream'
  return { buffer: Buffer.from(b64, 'base64'), contentType }
}

/**
 * Uploads Screen 6a / floor-sub-stage photo evidence to Supabase Storage
 * using the service-role client, so this app depends on zero
 * storage.objects RLS policies — Brief 057 §4, mirroring the CMMS's own
 * src/app/api/field/upload/route.ts wholesale.
 *
 * This route only stores the file and hands back its public URL; it does
 * NOT insert/update workflow.progress_updates or workflow.floor_sub_stages
 * itself — the caller's own Server Function does that (actions.ts's
 * submitProgressUpdate, floor-actions.ts's updateSubStageStatus), same as
 * it always has, now with photoUrl in that write. That keeps the failure
 * modes decoupled per Brief 057 §5: a failed photo upload never touches
 * the typed update, and a failed save never orphans the photo silently —
 * the caller still has the URL and can retry the save.
 *
 * Brief 059 §4 — minimal generalization, not a duplicate route: an
 * omitted `stage` keeps the original progress_updates/PIC-only gate
 * exactly as Brief 057 shipped it. A `stage` of 'installation' or 'tnc'
 * switches the gate to the SAME stage-conditional team check migration
 * 022's RLS policy already enforces on the floor_sub_stages write itself
 * (Project team for installation rows, TNC team for tnc rows) — this
 * route has no floor_sub_stages row to check pic_id against in the first
 * place, so the PIC gate was never the right check for that caller.
 */
export async function POST(request: Request) {
  const { user, member } = await getCurrentMember()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const projectId = body.projectId?.trim()
  const dataUrl = body.dataUrl
  const stage = body.stage?.trim()
  if (!projectId || !dataUrl) {
    return Response.json({ error: 'projectId and dataUrl are required' }, { status: 400 })
  }

  if (stage) {
    const requiredTeam = SUB_STAGE_TEAM[stage]
    if (!requiredTeam) {
      return Response.json({ error: 'Invalid stage.' }, { status: 400 })
    }
    if (!member || member.teamCode !== requiredTeam) {
      const teamLabel = stage === 'installation' ? 'Project' : 'TNC'
      return Response.json({ error: `Only the ${teamLabel} team can attach evidence here.` }, { status: 403 })
    }
  } else {
    // Original Brief 057 gate, unchanged: only this project's PIC can
    // attach evidence to a progress_updates row. A project the caller
    // can't see (RLS) or isn't PIC on reads as not-found/forbidden, no
    // existence leak beyond what the RLS-gated select already allows.
    const supabase = await createClient()
    const { data: project } = await supabase.from('projects').select('pic_id').eq('id', projectId).maybeSingle()
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
    if (project.pic_id !== user.id) {
      return Response.json({ error: 'Only this project’s PIC can attach evidence here.' }, { status: 403 })
    }
  }

  const { buffer, contentType } = dataUrlToBuffer(dataUrl)
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const path = stage ? `projects/${projectId}/sub-stages/${stamp}.jpg` : `projects/${projectId}/${stamp}.jpg`

  const svc = createServiceClient()
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (upErr) {
    return Response.json({ error: `storage upload failed: ${upErr.message}` }, { status: 502 })
  }

  const url = svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return Response.json({ url, path })
}
