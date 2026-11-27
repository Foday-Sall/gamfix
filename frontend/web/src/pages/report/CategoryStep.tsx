import { motion } from 'framer-motion'
import { ChevronLeft, CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CategoryInfo, InstitutionInfo } from '@/lib/gamfix'
import { CATEGORY_ICON_COMPONENTS } from './categoryIcons'
import { stepMotion } from './ServiceStep'
import { SENSITIVE_NOTE } from './types'

export function CategoryStep({
  institution,
  showSensitiveNote,
  visibleCategories,
  direction,
  onPick,
  onBack,
}: {
  institution: InstitutionInfo | null
  showSensitiveNote: boolean
  visibleCategories: CategoryInfo[]
  direction: number
  onPick: (id: string) => void
  onBack: () => void
}) {
  return (
    <motion.section key="step-1" {...stepMotion(direction)}>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        What kind of problem?
      </h1>
      <p className="mt-2 text-muted-foreground">
        Reporting to <span className="font-semibold text-foreground">{institution?.name}</span>.
        Choose the type that fits best.
      </p>
      {showSensitiveNote && (
        <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          {SENSITIVE_NOTE}
        </div>
      )}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibleCategories.map((cat) => {
          const Icon = CATEGORY_ICON_COMPONENTS[cat.slug] ?? CircleHelp
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onPick(cat.id)}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{cat.name}</span>
                {cat.is_sensitive && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Reviewed by the Central Desk
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-6">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft /> Back
        </Button>
      </div>
    </motion.section>
  )
}
