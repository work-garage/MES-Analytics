'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, X, Loader2 } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'

interface PhotoCaptureProps {
    onCapture: (file: File) => void
    label?: string
    required?: boolean
}

export default function PhotoCapture({ onCapture, label = "Take Photo", required = false }: PhotoCaptureProps) {
    const [preview, setPreview] = useState<string | null>(null)
    const [isCompressing, setIsCompressing] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0]
            setIsCompressing(true)

            try {
                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1280,
                    useWebWorker: true,
                    fileType: 'image/jpeg'
                }

                // Explicitly allow PNG/JPG/JPEG input even if compression converts to JPEG
                const compressedFile = await imageCompression(file, options)
                const objectUrl = URL.createObjectURL(compressedFile)

                setPreview(objectUrl)
                onCapture(compressedFile)
            } catch (error) {
                console.error('Compression failed', error)
                toast.error("Image processing failed", { description: "Using original file instead." })

                // Fallback to original file if compression fails (e.g. specialized formats)
                const objectUrl = URL.createObjectURL(file)
                setPreview(objectUrl)
                onCapture(file)
            } finally {
                setIsCompressing(false)
            }
        }
    }

    const clear = () => {
        setPreview(null)
        if (inputRef.current) inputRef.current.value = ''
    }

    return (
        <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50 flex flex-col items-center justify-center min-h-[160px]">
            <input
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                capture="environment"
                ref={inputRef}
                onChange={handleFileChange}
                className="hidden"
            />

            {preview ? (
                <div className="relative w-full h-40 bg-black rounded-lg overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Captured" className="w-full h-full object-contain" />
                    <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 rounded-full"
                        onClick={clear}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ) : (
                <div className="text-center">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">
                        {label} {required && <span className="text-red-500">*</span>}
                    </h4>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => inputRef.current?.click()}
                        disabled={isCompressing}
                    >
                        {isCompressing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                        {isCompressing ? "Compressing..." : "Open Camera"}
                    </Button>
                    <p className="text-xs text-slate-400 mt-2">Supports JPG, PNG, WebP</p>
                </div>
            )}
        </div>
    )
}
