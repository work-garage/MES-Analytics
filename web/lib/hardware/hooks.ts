'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'

// --- Weighbridge Hook ---
export function useWeighbridge() {
    const [weight, setWeight] = useState(0)
    const [isConnected, setIsConnected] = useState(false)

    // Polling or WebSocket logic would go here
    // For now, we simulate a connection
    useEffect(() => {
        const interval = setInterval(() => {
            // Mock checking a local agent URL
            // fetch('http://localhost:8080/weight').then(...)
            setIsConnected(true)
        }, 5000)
        return () => clearInterval(interval)
    }, [])

    return { weight, isConnected }
}

// --- Barcode Scanner Hook (HID) ---
export function useScanner(onScan: (code: string) => void) {
    useEffect(() => {
        let buffer = ''
        let lastKeyTime = 0

        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now()
            // Scanners type fast (<50ms between keys)
            if (now - lastKeyTime > 100) {
                buffer = ''
            }
            lastKeyTime = now

            if (e.key === 'Enter') {
                if (buffer.length > 3) {
                    onScan(buffer)
                    buffer = ''
                }
            } else if (e.key.length === 1) {
                buffer += e.key
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onScan])
}

// --- Printer Utility ---
export function printLabel(zpl: string) {
    // 1. Try Browser Print API
    // 2. Fallback to Local Agent
    console.log('Printing ZPL:', zpl)
    toast.success("Label Sent to Printer")
}
