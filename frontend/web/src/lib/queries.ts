import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiCall } from '@/lib/api'
import { fetchInstitutions, type CategoryInfo } from '@/lib/gamfix'
import type { Complaint } from '@/lib/types'

export const queryKeys = {
  institutions: ['institutions'] as const,
  categories: ['categories'] as const,
  myComplaints: (userId: string) => ['complaints', 'mine', userId] as const,
  recentComplaints: (userId: string) => ['complaints', 'recent', userId] as const,
  institution: (id: string) => ['institution', id] as const,
  track: (trackingNo: string) => ['track', trackingNo] as const,
  canConfirm: (trackingNo: string) => ['can-confirm', trackingNo] as const,
}

export const FEED_PAGE_SIZE = 50

export type ComplaintRecord = Complaint & {
  created?: string
  updated?: string
}

export function mapComplaintRow(row: ComplaintRecord): Complaint {
  return {
    ...row,
    created_at: row.created ?? '',
    updated_at: row.updated ?? null,
  }
}

export function useInstitutions() {
  return useQuery({ queryKey: queryKeys.institutions, queryFn: fetchInstitutions })
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async (): Promise<CategoryInfo[]> => {
      try {
        const res = await apiCall<{ categories: CategoryInfo[] }>('/api/categories', 'GET')
        return [...(res.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name))
      } catch (error) {
        console.error('categories fetch failed:', error)
        toast.error('Could not load the problem list. Check your connection and try again.')
        return []
      }
    },
  })
}

export function useMyComplaints(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myComplaints(userId ?? 'anonymous'),
    queryFn: async () => {
      const res = await apiCall<{ complaints: ComplaintRecord[] }>('/api/complaints', 'GET')
      return (res.complaints ?? []).map(mapComplaintRow)
    },
    enabled: !!userId,
  })
}

export function useRecentComplaints(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recentComplaints(userId ?? 'anonymous'),
    queryFn: async () => {
      const res = await apiCall<{ complaints: ComplaintRecord[] }>('/api/complaints', 'GET')
      return (res.complaints ?? []).slice(0, 3).map(mapComplaintRow)
    },
    enabled: !!userId,
  })
}

export function useInstitution(institutionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.institution(institutionId ?? ''),
    queryFn: async (): Promise<string | null> => {
      const res = await apiCall<{ institutions: Array<{ id: string; logo_url: string | null }> }>('/api/institutions', 'GET')
      const row = (res.institutions ?? []).find((i) => i.id === institutionId)
      return row?.logo_url?.trim() || null
    },
    enabled: !!institutionId,
    staleTime: 10 * 60_000,
  })
}
