// Data + actions for institutional users (staff) inside the citizen app.
// The officers collection ties an auth user to an institution; its complaints
// feed is the institute dashboard's source. Staff actions go through the
// app's own gamfix server routes (staff-admin.pb.js / staff-actions.pb.js)
// via pb.send — the server re-checks the caller's role and institution scope.
import { pb, gamfix } from '@/lib/pocketbase'
import { toast } from 'sonner'

export type InstituteUser = {
  officerId: string
  institutionId: string
  institutionName: string
}

export type InstituteDashboardStats = {
  institution: { id: string; code: string; name: string }
  total: number
  today: number
  open: number
  resolved_week: number
  overdue: number
  avg_resolution_hours: number
  by_status: Array<{ status: string; count: number }>
  by_category: Array<{ category: string; count: number }>
  by_channel: Array<{ channel: string; count: number }>
  by_urgency: Array<{ urgency: string; count: number }>
  daily: Array<{ date: string; received: number; resolved: number }>
}

/** Look up the signed-in user's officers record; null when they are not staff. */
export async function getInstituteUser(userId: string): Promise<InstituteUser | null> {
  try {
    const officer = await pb.collection('officers').getFirstListItem(
      pb.filter('user_id = {:uid}', { uid: userId }),
      { expand: 'institution' },
    )
    const inst = officer.expand?.institution as { name?: string } | undefined
    return {
      officerId: officer.id,
      institutionId: String(officer.institution ?? ''),
      institutionName: inst?.name ?? 'Institution',
    }
  } catch {
    return null
  }
}

/** Load aggregate metrics for the signed-in officer's institution only. */
export async function getInstituteDashboardStats(): Promise<InstituteDashboardStats | null> {
  try {
    const data = await gamfix<InstituteDashboardStats>('/api/gamfix/staff/stats')
    if (!data || (data as { ok?: boolean }).ok === false) return null
    return data
  } catch (error) {
    console.error('institution dashboard stats failed:', error)
    return null
  }
}

const NOTE_MIN = 10

function requireNote(action: string): string | null {
  const note = window.prompt(`Describe the "${action}" note (at least ${NOTE_MIN} characters):`)
  if (!note || note.trim().length < NOTE_MIN) {
    toast.error(`A ${action} needs a note of at least ${NOTE_MIN} characters.`)
    return null
  }
  return note.trim()
}

/** Call one staff action route; surface a friendly toast on failure. */
async function callStaffRoute(
  path: string,
  action: string,
  args: Record<string, unknown>,
  complaintId: string,
): Promise<boolean> {
  try {
    const outcome = await gamfix<boolean>(path, { p_complaint_id: complaintId, ...args })
    if (outcome !== true) {
      toast.error(`Could not ${action}. Open the report again and retry.`)
      return false
    }
    return true
  } catch (error) {
    toast.error(`Could not ${action}: ${error instanceof Error ? error.message : 'try again'}`)
    return false
  }
}

export async function officerAccept(complaintId: string): Promise<boolean> {
  return callStaffRoute('/api/gamfix/staff/accept', 'accept', {}, complaintId)
}

export async function officerReject(complaintId: string): Promise<boolean> {
  const reason = requireNote('Reject')
  if (!reason) return false
  return callStaffRoute('/api/gamfix/staff/reject', 'reject', { p_reason: reason }, complaintId)
}

export async function officerRequestInfo(complaintId: string): Promise<boolean> {
  const message = requireNote('Request info')
  if (!message) return false
  return callStaffRoute('/api/gamfix/staff/request-info', 'request info', { p_message: message }, complaintId)
}

export async function officerSetStatus(
  complaintId: string,
  status: 'in_progress' | 'resolved',
  opts?: { withNote?: boolean },
): Promise<boolean> {
  let citizenMessage: string | null = null
  if (opts?.withNote) {
    citizenMessage = requireNote(status === 'resolved' ? 'Resolution note' : 'Progress note')
    if (!citizenMessage) return false
  }
  return callStaffRoute(
    '/api/gamfix/staff/status',
    'update the status',
    { p_status: status, p_citizen_message: citizenMessage },
    complaintId,
  )
}

export async function officerAttachProof(complaintId: string): Promise<boolean> {
  const url = window.prompt('Paste the public URL of the resolution proof photo:')
  if (!url) return false
  return callStaffRoute('/api/gamfix/staff/proof', 'attach the proof photo', { p_photo_url: url.trim() }, complaintId)
}

export async function officerForward(
  complaintId: string,
  institutions: Array<{ id: string; name: string }>,
): Promise<boolean> {
  if (institutions.length === 0) {
    toast.error('No other institutions are available to forward to.')
    return false
  }
  const list = institutions.map((i, idx) => `${idx + 1}. ${i.name}`).join('\n')
  const picked = window.prompt(`Forward to which institution?\n\n${list}\n\nEnter the number:`)
  if (!picked) return false
  const target = institutions[Number(picked) - 1]
  if (!target) {
    toast.error('Pick a number from the list.')
    return false
  }
  const reason = requireNote('Forward')
  if (!reason) return false
  return callStaffRoute(
    '/api/gamfix/staff/forward',
    'forward the report',
    { p_institution_id: target.id, p_reason: reason },
    complaintId,
  )
}
