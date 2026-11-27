import { COUNCIL_AREAS } from '@/lib/gamfix'

export const SENSITIVE_NOTE = 'These reports are reviewed by the GamFix Central Desk first.'

export const STEP_LABELS = ['Service', 'Problem', 'Describe', 'Location', 'Review']

export type LocationState = {
  mode: 'none' | 'gps' | 'area'
  lat: number | null
  lng: number | null
  area: string
  landmark: string
}

export const EMPTY_LOCATION: LocationState = {
  mode: 'none',
  lat: null,
  lng: null,
  area: '',
  landmark: '',
}

export type SubmitResult = {
  tracking_no: string
  complaint_id: string
  institution: string
  institution_name: string
}

export function regionForArea(area: string): string {
  return COUNCIL_AREAS.find((council) => council.value === area)?.region ?? ''
}

export function friendlySubmitError(err: { message?: string } | null): string {
  const msg = err?.message ?? ''
  if (msg.includes('title_required_min_3_chars')) return 'Give the report a short title first.'
  if (msg.includes('description_required_min_10'))
    return 'Describe the problem in a little more detail (at least 10 characters).'
  if (msg.includes('category_required') || msg.includes('unknown_category'))
    return 'Choose a problem type and try again.'
  return 'Could not file the report. Check your connection and try again.'
}
