import { motion } from 'framer-motion'
import { CircleHelp } from 'lucide-react'
import GamFixMark from '@/components/GamFixMark'
import type { InstitutionInfo } from '@/lib/gamfix'

const MOTION = {
  initial: (direction: number) => ({ opacity: 0, x: 32 * direction }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -24 * direction }),
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
}

export function stepMotion(direction: number) {
  return {
    initial: MOTION.initial(direction),
    animate: MOTION.animate,
    exit: MOTION.exit(direction),
    transition: MOTION.transition,
  }
}

export { CircleHelp, motion }

export function ServiceStep({
  institutions,
  direction,
  onPick,
}: {
  institutions: InstitutionInfo[] | null
  direction: number
  onPick: (id: string) => void
}) {
  return (
    <motion.section key="step-0" {...stepMotion(direction)}>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Who should handle it?
      </h1>
      <p className="mt-2 text-muted-foreground">
        Pick the service your report is for. This decides where it goes — you choose,
        we deliver.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {institutions === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div className="h-12 w-12 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))
          : institutions.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => onPick(inst.id)}
                className="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
              >
                {inst.logo ? (
                  <img
                    src={inst.logo}
                    alt=""
                    className="h-12 w-12 rounded-md border border-border/60 object-contain"
                  />
                ) : (
                  <GamFixMark className="h-12 w-12" />
                )}
                <span className="min-w-0">
                  <span className="block font-semibold leading-tight">{inst.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{inst.blurb}</span>
                </span>
              </button>
            ))}
      </div>
    </motion.section>
  )
}
