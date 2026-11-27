import { useEffect, useRef, useState } from "react"
import { AnimatePresence, useInView, useReducedMotion } from "motion/react"
import { SCREEN_DURATION, SCREENS } from "@/components/phone/shared"
import PhoneCaseTop, { PhoneCaseStatusBar } from "@/components/phone/PhoneCaseTop"
import PhoneCaseBadge from "@/components/phone/PhoneCaseBadge"
import PhoneCaseProgress from "@/components/phone/PhoneCaseProgress"

export default function PhoneCase() {
  const reduce = useReducedMotion()
  const shellRef = useRef<HTMLDivElement>(null)
  const inView = useInView(shellRef, { amount: 0.25 })
  const [screen, setScreen] = useState(0)
  const progress = useRef(0)

  useEffect(() => {
    if (inView) {
      progress.current = 0
      setScreen(0)
    }
  }, [inView])

  useEffect(() => {
    if (reduce || !inView) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      progress.current += now - last
      last = now
      if (progress.current >= SCREEN_DURATION) {
        progress.current = 0
        setScreen((s) => (s + 1) % SCREENS.length)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, inView])

  const Current = SCREENS[screen]

  return (
    <div ref={shellRef} className={`relative ${reduce ? "" : "phone-shell"}`} aria-hidden="true">
      {/* Frame */}
      <div className="w-52 rounded-[24px] border border-white/15 bg-zinc-950 p-2 shadow-[0_20px_50px_-18px_rgba(42,27,16,0.45)]">
        <div className="overflow-hidden rounded-[16px] bg-[#1C130B]">
          {/* Screen top: camera pill + Gambia flag */}
          <PhoneCaseTop flag={reduce ? "dim" : "full"} />

          {/* Status bar */}
          <PhoneCaseStatusBar />

          {/* Channel badge (below the notch) */}
          <PhoneCaseBadge screen={Current} />

          {/* Rotating channel screens, one full-width app at a time */}
          <div className="relative h-[336px]">
            {reduce ? (
              <Current.Component static />
            ) : (
              <AnimatePresence initial={false}>
                <Current.Component key={Current.id} />
              </AnimatePresence>
            )}
          </div>

          {/* Story-style progress segments */}
          <PhoneCaseProgress active={screen} />
        </div>
      </div>
    </div>
  )
}
