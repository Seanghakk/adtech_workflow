import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const BUCKET = 'progress-photos'

interface Body {
  projectId?: string
  dataUrl?: string
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const contentType = /:(.*?);/.exec(head)?.[1] ?? 'application/octet-stream'
  return { buffer: Buffer.from(b64, 'base64'), contentType }
}

/**
 * Uploads Screen 6a photo evidence to Supabase Storage using the
 * service-role client, so this app depends on zero storage.objects RLS
 * policies — Brief 057 §4, mirroring the CMMS's own
 * src/app/api/field/upload/route.ts wholesale.
 *
 * This route only stores the file and hands back its public URL; it does
 * NOT insert into workflow.progress_updates itself — actions.ts's
 * submitProgressUpdate does that, same as it always has, now with
 * photoUrl in the insert. That keeps the failure modes decoupled per
 * Brief 057 §5: a failed photo upload never touches the typed update, and
 * a failed update save never orphans the photo silently — the caller
 * still has the URL and can retry the save.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const projectId = body.projectId?.trim()
  const dataUrl = body.dataUrl
  if (!projectId || !dataUrl) {
    return Response.json({ error: 'projectId and dataUrl are required' }, { status: 400 })
  }

  // Same write gate as actions.ts's submitProgressUpdate — only this
  // project's PIC can attach evidence to it. A project the caller can't
  // see (RLS) or isn't PIC on reads as not-found/forbidden, no existence
  // leak beyond what the RLS-gated select already allows.
  const { data: project } = await supabase.from('projects').select('pic_id').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  if (project.pic_id !== user.id) {
    return Response.json({ error: 'Only this project’s PIC can attach evidence here.' }, { status: 403 })
  }

  const { buffer, contentType } = dataUrlToBuffer(dataUrl)
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const path = `projects/${projectId}/${stamp}.jpg`

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
