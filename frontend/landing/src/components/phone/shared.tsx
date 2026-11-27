import { MessageCircle, MessageSquare, Send, Globe } from "lucide-react"
import WhatsAppScreen from "./WhatsAppScreen"
import SmsScreen from "./SmsScreen"
import TelegramScreen from "./TelegramScreen"
import WebAppScreen from "./WebAppScreen"

export const SCREEN_DURATION = 2800

import { EASE } from "@/components/sections/shared"

export { EASE }

export type PhoneScreenProps = { static?: boolean }

export const SCREEN_VARIANTS = {
  enter: { x: "100%" },
  center: { x: "0%" },
  exit: { x: "-32%", opacity: 0 },
}
export const SCREEN_TRANSITION = { duration: 0.45, ease: EASE }

export const SCREENS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    accent: "#25D366",
    badge: "live chat",
    Component: WhatsAppScreen,
  },
  {
    id: "sms",
    label: "SMS",
    icon: MessageSquare,
    accent: "#9C6A00",
    badge: "any phone",
    Component: SmsScreen,
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: Send,
    accent: "#229ED9",
    badge: "instant alerts",
    Component: TelegramScreen,
  },
  {
    id: "web",
    label: "Web",
    icon: Globe,
    accent: "#9C6A00",
    badge: "in browser",
    Component: WebAppScreen,
  },
] as const

export type PhoneScreen = (typeof SCREENS)[number]
