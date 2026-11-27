export type TimelineItem = { status: string | null; message: string | null; at: string }

export type TrackResult = {
  id: string
  tracking_no: string
  status: string | null
  urgency: string | null
  title: string | null
  description: string | null
  institution: string | null
  department: string | null
  expected_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
  timeline: TimelineItem[]
}

export const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'received', label: 'Received' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'citizen_confirmation', label: 'Fix reported' },
  { key: 'closed', label: 'Closed' },
]

export const STATUS_STAGE: Record<string, number> = {
  submitted: 0,
  received: 1,
  assigned: 2,
  forwarded: 1,
  in_progress: 3,
  waiting_info: 3,
  escalated: 3,
  reopened: 2,
  citizen_confirmation: 4,
  resolved: 4,
  closed: 5,
}
