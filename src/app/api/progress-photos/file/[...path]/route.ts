import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/auth/current-member'
import { PROGRESS_PHOTO_BUCKET, photoProjectId, photoStoragePath } from '@/lib/media/photo-link'

export const dynamic = 'force-dynamic'

/** Long enough to load the image, short enough that a copied link soon stops working. */
export const SIGNED_LINK_SECONDS = 300

/**
 * ADTECH_WF_Brief_107 Part B — the only way a progress photo is opened.
 * Same pattern as the CMMS's /api/files route: a signed-in member who can
 * see the photo's project (the projects row read through RLS — is_member /
 * can_view_project decide, exactly as for the project itself) is
 * redirected to a short-lived signed Storage link. Anyone else gets
 * nothing: 401 signed out, 404 for a project they can't see (no leak that
 * the photo exists).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { user, member } = await getCurrentMember()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!member) return Response.json({ error: 'Not found' }, { status: 404 })

  const { path: segments } = await ctx.params
  const path = photoStoragePath((segments ?? []).join('/'))
  const projectId = path ? photoProjectId(path) : null
  if (!path || !projectId) return Response.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await createServiceClient().storage.from(PROGRESS_PHOTO_BUCKET).createSignedUrl(path, SIGNED_LINK_SECONDS)
  if (error || !data?.signedUrl) return Response.json({ error: 'Not found' }, { status: 404 })
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' } })
}
