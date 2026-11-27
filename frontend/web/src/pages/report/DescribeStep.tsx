import { motion } from 'framer-motion'
import { Camera, Check, ChevronLeft, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { firstIssue, reportDescriptionSchema, reportTitleSchema } from '@/lib/schemas'
import { stepMotion } from './ServiceStep'

export function DescribeStep({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  photoPreview,
  urgency,
  onToggleUrgency,
  onClearPhoto,
  onPhoto,
  canNext,
  direction,
  onBack,
  onNext,
}: {
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  photoPreview: string | null
  urgency: 'normal' | 'high'
  onToggleUrgency: () => void
  onClearPhoto: () => void
  onPhoto: (file: File | undefined) => void
  canNext: boolean
  direction: number
  onBack: () => void
  onNext: () => void
}) {
  const titleIssue = title.length > 0 ? firstIssue(reportTitleSchema, title) : null
  const descriptionIssue = description.length > 0 ? firstIssue(reportDescriptionSchema, description) : null
  return (
    <motion.section key="step-2" {...stepMotion(direction)}>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Describe the problem
      </h1>
      <p className="mt-2 text-muted-foreground">
        A short title and what you saw. A photo helps the team fix it faster.
      </p>
      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Broken street light near the market"
            maxLength={120}
          />
          {titleIssue && <p className="text-sm text-destructive">{titleIssue}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">What happened?</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe the problem and where exactly it is. At least 10 characters."
            rows={5}
          />
          {descriptionIssue && <p className="text-sm text-destructive">{descriptionIssue}</p>}
        </div>
        <div className="space-y-2">
          <Label>Photo (optional)</Label>
          {photoPreview ? (
            <div className="flex items-start gap-3">
              <img
                src={photoPreview}
                alt="Report photo preview"
                className="h-24 w-24 rounded-lg border border-border object-cover"
              />
              <Button type="button" variant="outline" size="sm" onClick={onClearPhoto}>
                <Trash /> Remove
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-card p-4 hover:bg-secondary/60">
              <Camera className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Add a photo</span>
              <span className="text-xs text-muted-foreground">JPG, PNG, or WebP, up to 10 MB — compressed automatically</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        <div className="space-y-2">
          <Label>How urgent is it?</Label>
          <button
            type="button"
            onClick={onToggleUrgency}
            aria-pressed={urgency === 'high'}
            className={
              'flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ' +
              (urgency === 'high'
                ? 'border-destructive/60 bg-destructive/5'
                : 'border-border bg-card hover:bg-secondary/60')
            }
          >
            <span
              className={
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ' +
                (urgency === 'high' ? 'border-destructive bg-destructive' : 'border-border')
              }
            >
              {urgency === 'high' && <Check className="h-3 w-3 text-white" />}
            </span>
            <span>
              <span className="block font-medium">This is urgent — risk to health or safety</span>
              <span className="block text-sm text-muted-foreground">
                Fires, live wires, contaminated water, unsafe structures.
              </span>
            </span>
          </button>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 mt-6 flex items-center justify-between border-t border-clay-line bg-background/95 p-4 backdrop-blur md:-mx-6">
        <Button variant="ghost" className="h-11" onClick={onBack}>
          <ChevronLeft /> Back
        </Button>
        <Button className="h-11" onClick={onNext} disabled={!canNext}>
          Next
        </Button>
      </div>
    </motion.section>
  )
}
