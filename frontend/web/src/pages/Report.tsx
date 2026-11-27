import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DiscardReportDialog, SubmitReportDialog } from '@/components/ConfirmDialogs'
import { rememberTracking } from '@/pages/MyReports'
import { COUNCIL_AREAS, councilForLatLng } from '@/lib/gamfix'
import { useCategories, useInstitutions } from '@/lib/queries'
import { reportDetailsSchema } from '@/lib/schemas'
import { useReportSubmit } from './report/useReportSubmit'
import { CategoryStep } from './report/CategoryStep'
import { DescribeStep } from './report/DescribeStep'
import { LocationStep } from './report/LocationStep'
import { ReviewStep } from './report/ReviewStep'
import { ServiceStep } from './report/ServiceStep'
import { StepProgress } from './report/StepProgress'
import { SuccessScreen } from './report/SuccessScreen'
import { SummaryPanel } from './report/SummaryPanel'
import { pickPhoto, clearPhoto } from './report/photo'
import { EMPTY_LOCATION, type LocationState } from './report/types'

export default function Report() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const prevStepRef = useRef(0)
  const stepDirection = step >= prevStepRef.current ? 1 : -1
  prevStepRef.current = step

  useEffect(() => {
    document.title = 'New report · GamFix'
  }, [])
  const institutionsQuery = useInstitutions()
  const categoriesQuery = useCategories()
  const institutions = institutionsQuery.data ?? null
  const categories = categoriesQuery.data ?? null
  const [instId, setInstId] = useState<string | null>(null)
  const [catId, setCatId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<'normal' | 'high'>('normal')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [location, setLocation] = useState<LocationState>(EMPTY_LOCATION)
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ok' | 'error'>('idle')
  const centralId = useMemo(() => institutions?.find((i) => i.code === 'CENTRAL')?.id ?? '', [institutions])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  function startFresh() {
    setStep(0)
    setInstId(null)
    setCatId(null)
    setTitle('')
    setDescription('')
    setUrgency('normal')
    setPhotoFile(null)
    setPhotoPreview(null)
    setLocation(EMPTY_LOCATION)
    submitFlow.reset()
    setConfirmOpen(false)
    setDiscardOpen(false)
  }

  const isDirty =
    step > 0 &&
    step < 5 &&
    (title.trim().length >= 3 ||
      description.trim().length >= 10 ||
      !!photoFile ||
      !!location.area ||
      location.mode === 'gps' ||
      !!catId)

  function requestExit() {
    if (isDirty) setDiscardOpen(true)
    else navigate('/home')
  }

  useEffect(() => {
    const onExit = () => requestExit()
    window.addEventListener('gamfix:exit-report', onExit)
    return () => window.removeEventListener('gamfix:exit-report', onExit)
  })

  const institution = useMemo(
    () => institutions?.find((i) => i.id === instId) ?? null,
    [institutions, instId],
  )
  const category = useMemo(
    () => categories?.find((c) => c.id === catId) ?? null,
    [categories, catId],
  )
  const visibleCategories = useMemo(() => {
    if (!categories || !instId) return []
    const inst = institutions?.find((i) => i.id === instId)
    if (!inst) return []
    if (inst.code === 'CENTRAL') {
      return categories.filter(
        (c) => c.default_institution_id === null || c.default_institution_id === centralId,
      )
    }
    return categories.filter((c) => c.default_institution_id === instId)
  }, [categories, instId, institutions, centralId])

  const submitFlow = useReportSubmit({
    getDraft: () => ({ institution, category, title, description, urgency, location, photoFile }),
    onSubmitted: (res) => {
      rememberTracking(res.tracking_no)
      setStep(5)
      window.scrollTo(0, 0)
    },
  })
  const {
    submitting,
    result,
    photoUploadFailed,
    photoUploadFailureCode,
    retryingPhotoUpload,
    copied,
    submit,
    retryPhotoAttachment,
    copyTracking,
    clearPhotoIssue,
  } = submitFlow

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return !!instId
      case 1:
        return !!catId
      case 2:
        return reportDetailsSchema.safeParse({ title, description }).success
      case 3:
        return location.mode === 'gps' || !!location.area
      default:
        return true
    }
  }, [step, instId, catId, title, description, location])

  function goNext() {
    if (step === 3 && location.mode === 'gps' && location.lat != null && location.lng != null) {
      const area = councilForLatLng(location.lat, location.lng)
      if (area) setLocation((l) => ({ ...l, area }))
    }
    setStep((s) => Math.min(4, s + 1))
    window.scrollTo(0, 0)
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1))
    window.scrollTo(0, 0)
  }

  function pickInstitution(id: string) {
    if (instId !== id) {
      setInstId(id)
      setCatId(null)
    }
    setStep(1)
    window.scrollTo(0, 0)
  }

  function pickCategory(id: string) {
    setCatId(id)
    setStep(2)
    window.scrollTo(0, 0)
  }

  async function handlePhoto(file: File | undefined) {
    const picked = await pickPhoto(file, photoPreview)
    if (!picked) return
    setPhotoFile(picked.file)
    setPhotoPreview(picked.preview)
    clearPhotoIssue()
  }

  function removePhoto() {
    clearPhoto(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    clearPhotoIssue()
  }

  async function doGps() {
    if (!('geolocation' in navigator)) {
      setGpsState('error')
      toast.error('Your browser cannot share location. Pick your area below instead.')
      return
    }
    setGpsState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsState('ok')
        setLocation((l) => ({
          ...l,
          mode: 'gps',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }))
      },
      () => {
        setGpsState('error')
        toast.error('Location permission denied — choose your area manually below.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const stepIndex = Math.min(step, 4)

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 min-[1024px]:max-w-[1200px] md:px-6">
      <main className="w-full">
        <div className="grid grid-cols-1 gap-8 min-[1024px]:grid-cols-12">
        <div className={step === 5 ? 'min-[1024px]:col-span-12' : 'min-[1024px]:col-span-7'}>
        {step < 5 && <StepProgress stepIndex={stepIndex} />}

        <AnimatePresence mode="wait" initial={false}>
        {step === 0 && (
          <ServiceStep
            key="step-0"
            institutions={institutions}
            direction={stepDirection}
            onPick={pickInstitution}
          />
        )}

        {step === 1 && (
          <CategoryStep
            key="step-1"
            institution={institution}
            showSensitiveNote={!!category?.is_sensitive}
            visibleCategories={visibleCategories}
            direction={stepDirection}
            onPick={pickCategory}
            onBack={goBack}
          />
        )}

        {step === 2 && (
          <DescribeStep
            key="step-2"
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            photoPreview={photoPreview}
            urgency={urgency}
            onToggleUrgency={() => setUrgency((u) => (u === 'high' ? 'normal' : 'high'))}
            onClearPhoto={removePhoto}
            onPhoto={handlePhoto}
            canNext={canNext}
            direction={stepDirection}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 3 && (
          <LocationStep
            key="step-3"
            location={location}
            onLocationChange={setLocation}
            gpsState={gpsState}
            onGps={doGps}
            canNext={canNext}
            direction={stepDirection}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {step === 4 && (
          <ReviewStep
            key="step-4"
            institution={institution}
            category={category}
            title={title}
            description={description}
            photoPreview={photoPreview}
            location={location}
            urgency={urgency}
            submitting={submitting}
            direction={stepDirection}
            onSend={() => setConfirmOpen(true)}
            onBack={goBack}
          />
        )}

        {/* STEP 5: success — the ONE gold moment (spec G1) */}
        {step === 5 && result && (
          <SuccessScreen
            key="step-success"
            result={result}
            photoUploadFailed={photoUploadFailed}
            photoUploadFailureCode={photoUploadFailureCode}
            retryingPhotoUpload={retryingPhotoUpload}
            hasPhoto={!!photoFile}
            copied={copied}
            onRetryPhoto={() => void retryPhotoAttachment()}
            onCopy={copyTracking}
            onNewReport={startFresh}
          />
        )}
        </AnimatePresence>
        </div>

        {/* Desktop: live summary panel (spec 3b') */}
        {step < 5 && (
          <SummaryPanel
            institution={institution}
            category={category}
            title={title}
            urgency={urgency}
            location={location}
            photoPreview={photoPreview}
          />
        )}
        </div>
      </main>

      <DiscardReportDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false)
          navigate('/home')
        }}
      />

      <SubmitReportDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!submitting) setConfirmOpen(open)
        }}
        onConfirm={submit}
        busy={submitting}
        summary={
          institution
            ? `Send "${title.trim()}" to ${institution.name}${
                location.area
                  ? ` (${COUNCIL_AREAS.find((a) => a.value === location.area)?.label ?? location.area})`
                  : ''
              }?`
            : null
        }
      />
    </div>
  )
}
