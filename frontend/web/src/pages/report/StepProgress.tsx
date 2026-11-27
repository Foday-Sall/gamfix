import { STEP_LABELS } from './types'
import { Progress } from '@/components/ui/progress'

export function StepProgress({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">
          Step {stepIndex + 1} of {STEP_LABELS.length}: {STEP_LABELS[stepIndex]}
        </span>
        <span className="text-muted-foreground tabular">
          {Math.round(((stepIndex + 1) / STEP_LABELS.length) * 100)}%
        </span>
      </div>
      <Progress className="h-1.5" value={((stepIndex + 1) / STEP_LABELS.length) * 100} />
      <div className="mt-1.5 flex justify-between text-[11px]" aria-hidden="true">
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            className={i === stepIndex ? 'font-semibold text-primary' : 'text-muted-foreground'}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
