'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, FolderOpen, ImagePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { fileToImageDataUrl } from './image-utils'

interface ImageIntakeProps {
  /** Called with the image (as a data URL) once the user has added one. */
  onImage: (dataUrl: string) => void
}

/**
 * The image-centered starting screen: take a photo with the camera or
 * import an image from the file folder (button or drag & drop).
 */
export function ImageIntake({ onImage }: ImageIntakeProps) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const { toast } = useToast()

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      try {
        onImage(await fileToImageDataUrl(file))
      } catch {
        toast({
          description: 'That file is not a receipt we can use. Try a JPG or PNG.',
        })
      }
    },
    [onImage, toast]
  )

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  /* Start/stop the camera stream alongside the dialog. */
  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch {
        if (!cancelled) {
          setCameraOpen(false)
          toast({
            description:
              'Camera is not available right now. You can still import a receipt from your files.',
          })
        }
      }
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraOpen, toast, stopCamera])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, 1280 / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCameraOpen(false)
    onImage(canvas.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div className="w-full max-w-xl">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFile(e.dataTransfer.files?.[0])
        }}
        className={`flex flex-col items-center gap-5 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver
            ? 'border-muted-foreground/60 bg-accent'
            : 'border-border bg-secondary/40 hover:border-muted-foreground/50'
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-foreground">
          <ImagePlus className="size-7" strokeWidth={1.6} />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Add a receipt</p>
          <p className="text-sm text-muted-foreground">
            Take a photo of your receipt, import one from your files, or drag &amp; drop it here
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setCameraOpen(true)}
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
          >
            <Camera className="size-4" strokeWidth={1.8} />
            Take photo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium hover:bg-accent"
          >
            <FolderOpen className="size-4" strokeWidth={1.8} />
            Import receipt
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Take a photo</DialogTitle>
            <DialogDescription>Frame your shot, then capture it.</DialogDescription>
          </DialogHeader>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[4/3] w-full rounded-xl bg-black object-cover"
            aria-label="Camera preview"
          />
          <DialogFooter className="gap-2">
            <button
              onClick={() => setCameraOpen(false)}
              className="h-10 rounded-full border border-border px-5 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={capture}
              className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-85"
            >
              <Camera className="size-4" strokeWidth={1.8} />
              Capture
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
