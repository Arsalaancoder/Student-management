import { useState, useEffect, useRef } from "react"
import EduTrackLogo from "@/components/EduTrackLogo"

interface IntroVideoProps {
  onComplete: () => void
}

export default function IntroVideo({ onComplete }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fadingOut, setFadingOut] = useState(false)
  const [videoLoading, setVideoLoading] = useState(true)

  useEffect(() => {
    // Attempt autoPlay programmatically to ensure playback begins
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.warn("Autoplay playback error, proceeding with video:", err)
      })
    }
  }, [])

  const handleFinish = () => {
    if (fadingOut) return
    setFadingOut(true)
    setTimeout(() => {
      onComplete()
    }, 400) // 400ms smooth fade out transition
  }

  return (
    <div 
      className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden transition-opacity duration-500 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        onCanPlay={() => setVideoLoading(false)}
        onEnded={handleFinish}
        onError={(e) => {
          console.error("Intro video loading error, falling back to login:", e)
          handleFinish()
        }}
        className="w-full h-full object-cover"
      />

      {/* Loading fallback overlay while video prepares */}
      {videoLoading && (
        <div className="absolute inset-0 bg-[#0A192F] flex flex-col items-center justify-center z-20 text-white gap-4">
          <EduTrackLogo size="xl" />
          <div className="flex items-center gap-2 text-white/70 text-sm font-semibold mt-2">
            <span className="h-2 w-2 rounded-full bg-[#1E5EFF] animate-ping" />
            Loading intro...
          </div>
        </div>
      )}

      {/* Skip Intro Button */}
      <button
        type="button"
        onClick={handleFinish}
        className="absolute bottom-6 right-6 z-30 px-5 py-2.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-bold tracking-wider uppercase border border-white/20 transition-all shadow-xl flex items-center gap-2 group cursor-pointer"
      >
        <span>Skip Intro</span>
        <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
      </button>
    </div>
  )
}
