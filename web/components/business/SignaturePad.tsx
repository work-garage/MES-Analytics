'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Button } from '@/components/ui/button'
import { Eraser, CheckCircle } from 'lucide-react'

interface SignaturePadProps {
    onSign: (data: { signature_data: string; signature_hash: string; timestamp: string }) => void
    disabled?: boolean
}

export default function SignaturePad({ onSign, disabled = false }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas>(null)
    const [isEmpty, setIsEmpty] = useState(true)

    const clear = () => {
        sigRef.current?.clear()
        setIsEmpty(true)
    }

    const save = async () => {
        if (sigRef.current && !sigRef.current.isEmpty()) {
            const signature_data = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
            const timestamp = new Date().toISOString()

            // Compute simple hash of data + timestamp (Web Crypto API)
            const msgBuffer = new TextEncoder().encode(signature_data + timestamp)
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const signature_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

            onSign({ signature_data, signature_hash, timestamp })
            setIsEmpty(false)
        }
    }

    return (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="mb-2 text-sm font-medium text-slate-700">Operator Signature</div>
            <div className="border rounded bg-slate-50 mb-4 h-40">
                <SignatureCanvas
                    ref={sigRef}
                    penColor="black"
                    canvasProps={{ className: 'w-full h-full' }}
                    onBegin={() => setIsEmpty(false)}
                />
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={clear} disabled={disabled}>
                    <Eraser className="w-4 h-4 mr-1" /> Clear
                </Button>
                <Button variant="default" size="sm" onClick={save} disabled={disabled || isEmpty}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Confirm Signature
                </Button>
            </div>
        </div>
    )
}
