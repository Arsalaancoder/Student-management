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
      case "xs": return "32px"
      case "sm": return "44px"
      case "md": return "60px"
      case "lg": return "80px"
      case "xl": return "104px"
      default: return "60px"
    }
  }

  const height = getLogoHeight()

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {isIconOnly ? (
        <div 
          className="relative overflow-hidden rounded-xl bg-white/90 p-1 flex items-center justify-center shadow-sm"
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
            className="object-contain max-w-full"
            style={{ height }}
          />
        </div>
      )}
    </div>
  )
}
