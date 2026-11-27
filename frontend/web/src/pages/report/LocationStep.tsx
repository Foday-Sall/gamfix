import { motion } from 'framer-motion'
import { ChevronLeft, Loader2, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { COUNCIL_AREAS } from '@/lib/gamfix'
import { stepMotion } from './ServiceStep'
import type { LocationState } from './types'

export function LocationStep({
  location,
  onLocationChange,
  gpsState,
  onGps,
  canNext,
  direction,
  onBack,
  onNext,
}: {
  location: LocationState
  onLocationChange: (update: (l: LocationState) => LocationState) => void
  gpsState: 'idle' | 'locating' | 'ok' | 'error'
  onGps: () => void
  canNext: boolean
  direction: number
  onBack: () => void
  onNext: () => void
}) {
  return (
    <motion.section key="step-3" {...stepMotion(direction)}>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Where is it?
      </h1>
      <p className="mt-2 text-muted-foreground">
        Your location helps the team find the problem. Use GPS or pick your area.
      </p>
      <div className="mt-6 space-y-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Use my location</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {gpsState === 'ok' && location.lat != null
                  ? `Found: ${location.lat.toFixed(5)}, ${location.lng?.toFixed(5)}`
                  : 'Your browser will ask for permission.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGps}
              disabled={gpsState === 'locating'}
            >
              {gpsState === 'locating' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <LocateFixed />
              )}
              {gpsState === 'locating' ? 'Locating…' : 'Detect'}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Council area</Label>
          <Select
            value={location.area || undefined}
            onValueChange={(v) => onLocationChange((l) => ({ ...l, mode: 'area', area: v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick your area" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Municipal Councils (2)</SelectLabel>
                {COUNCIL_AREAS.filter((area) => area.group === 'municipal').map((area) => (
                  <SelectItem key={area.value} value={area.value}>{area.label}</SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Area Councils (6)</SelectLabel>
                {COUNCIL_AREAS.filter((area) => area.group === 'area').map((area) => (
                  <SelectItem key={area.value} value={area.value}>{area.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Required if you did not use GPS.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="landmark">Nearest landmark (optional)</Label>
          <Input
            id="landmark"
            value={location.landmark}
            onChange={(e) => onLocationChange((l) => ({ ...l, landmark: e.target.value }))}
            placeholder="e.g. opposite the mosque, Westfield junction"
          />
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
