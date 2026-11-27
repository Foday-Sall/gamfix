import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gamfix, handleAuthExpired, isAuthError, isNetworkError } from '@/lib/api'
import { useSession } from '@/hooks/useSession'
import { queryKeys } from '@/lib/queries'
import type { TrackResult } from './types'

async function fetchTrack(trackingNo: string): Promise<TrackResult | null> {
  try {
    return await gamfix<TrackResult | null>('/api/gamfix/track', { p_tracking_no: trackingNo })
  } catch (error) {
    if (isAuthError(error)) {
      toast.error('Your session has expired. Please sign in again.')
      await handleAuthExpired()
    }
    throw error
  }
}

export function useTracking() {
  const [params, setParams] = useSearchParams()
  const [value, setValue] = useState('')
  const [searchedNo, setSearchedNo] = useState<string | null>(null)
  const [manualRefresh, setManualRefresh] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [citizenActionError, setCitizenActionError] = useState<string | null>(null)
  const { session } = useSession()
  const queryClient = useQueryClient()

  const trackQuery = useQuery({
    queryKey: queryKeys.track(searchedNo ?? ''),
    queryFn: () => fetchTrack(searchedNo as string),
    enabled: searchedNo !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data ? 30_000 : false),
    refetchOnWindowFocus: false,
    gcTime: 0,
  })

  const result = trackQuery.data ?? null
  const loading = trackQuery.isPending
  const notFound = trackQuery.isSuccess && trackQuery.data === null
  const searched = result !== null
  const refreshingStatus = manualRefresh

  const wasError = useRef(false)
  useEffect(() => {
    if (trackQuery.isError && !wasError.current && !manualRefresh) {
      if (!isAuthError(trackQuery.error)) {
        toast.error(
          isNetworkError(trackQuery.error)
            ? 'Network problem. Check your connection and try again.'
            : 'Could not look up this report. Check the number and try again.',
        )
      }
    }
    wasError.current = trackQuery.isError
  }, [trackQuery.isError, trackQuery.error, manualRefresh])

  useEffect(() => {
    const ref = params.get('ref')
    if (ref && searchedNo === null) {
      setValue(ref)
      void runLookup(ref)
    }
  }, [params])

  useEffect(() => {
    if (result && searchedNo) setParams({ ref: searchedNo }, { replace: true })
  }, [result?.tracking_no])

  useEffect(() => {
    setCitizenActionError(null)
  }, [result?.tracking_no, result?.status])

  async function runLookup(ref?: string) {
    const raw = (ref ?? value).trim()
    if (!raw) return
    if (!navigator.onLine) {
      toast.error("You're offline. Reconnect and try again.")
      return
    }
    if (raw === searchedNo) {
      void queryClient.resetQueries({ queryKey: queryKeys.track(raw), exact: true })
      return
    }
    setSearchedNo(raw)
  }

  async function refreshStatus(trackingNo?: string, quiet = false) {
    const no = trackingNo ?? searchedNo
    if (!no) return
    if (!navigator.onLine) {
      if (!quiet) toast.error("You're offline. Reconnect and try again.")
      return
    }
    setManualRefresh(true)
    try {
      const res = await trackQuery.refetch()
      if (!quiet && res.error && !isAuthError(res.error)) {
        toast.error('Could not refresh this report. Check your connection and try again.')
      }
    } finally {
      setManualRefresh(false)
    }
  }

  const canConfirmQuery = useQuery({
    queryKey: queryKeys.canConfirm(result?.id ?? ''),
    queryFn: () => gamfix<unknown>('/api/gamfix/can-confirm', { p_complaint_id: result?.id }),
    enabled:
      !!session?.id &&
      !!result?.id &&
      ['citizen_confirmation', 'resolved'].includes(result.status ?? ''),
    retry: false,
    staleTime: 30_000,
  })
  const canConfirm = canConfirmQuery.data === true

  const respond = useMutation({
    mutationFn: (action: 'confirm' | 'reopen') => {
      if (!result) return Promise.reject(new Error('No report loaded'))
      return action === 'confirm'
        ? gamfix<unknown>('/api/gamfix/confirm', { p_complaint_id: result.id })
        : gamfix<unknown>('/api/gamfix/reopen', {
            p_complaint_id: result.id,
            p_reason: reopenReason.trim(),
          })
    },
    onSuccess: (data, action) => {
      if (data !== true) {
        setCitizenActionError(
          action === 'confirm'
            ? 'We could not close this report. Refresh and try again, or contact the handling service.'
            : 'We could not reopen this report. Refresh and try again, or contact the handling service.',
        )
        return
      }
      setReopenReason('')
      toast.success(
        action === 'confirm' ? 'Thank you. This report is now closed.' : 'The report has been reopened.',
      )
      if (result) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.track(result.tracking_no) })
      }
    },
    onError: () => {
      setCitizenActionError('We could not update this report. Check your connection and try again.')
    },
  })

  async function respondToFix(action: 'confirm' | 'reopen') {
    if (!result || respond.isPending) return
    if (action === 'reopen' && reopenReason.trim().length < 5) {
      setCitizenActionError('Please explain what still needs attention (at least 5 characters).')
      return
    }
    setCitizenActionError(null)
    respond.mutate(action)
  }

  return {
    value,
    setValue,
    loading,
    result,
    notFound,
    searched,
    refreshingStatus,
    canConfirm,
    citizenAction: respond.isPending ? (respond.variables ?? null) : null,
    reopenReason,
    setReopenReason,
    citizenActionError,
    signedIn: !!session,
    runLookup,
    refreshStatus,
    respondToFix,
  }
}
