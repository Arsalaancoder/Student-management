import { cn } from "@/lib/utils"

interface EduTrackLogoProps {
  className?: string
  iconOnly?: boolean
  compact?: boolean
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number
}

export default function EduTrackLogo({
  className,
  iconOnly = false,
  compact = false,
  size = "md",
}: EduTrackLogoProps) {
  const isIconOnly = iconOnly || compact

  const getLogoHeight = () => {
    if (typeof size === "number") return `${size}px`
    switch (size) {
      case "xs": return "40px"
      case "sm": return "56px"
      case "md": return "76px"
      case "lg": return "100px"
      case "xl": return "136px"
      default: return "76px"
    }
  }

  const height = getLogoHeight()

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {isIconOnly ? (
        <div 
          className="relative overflow-hidden rounded-xl bg-white/90 dark:bg-slate-800 p-1 flex items-center justify-center shadow-xs"
          style={{ height, width: height }}
        >
          <img
            src="/edutrack-logo.png"
            alt="EduTrack"
            className="w-full h-full object-contain"
            style={{ objectPosition: "left center" }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <img
            src="/edutrack-logo.png"
            alt="EduTrack"
            className="object-contain max-w-full dark:brightness-110 dark:drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]"
            style={{ height }}
          />
        </div>
      )}
    </div>
  )
}
