import fs from 'fs'

const code = `'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Wand2 } from 'lucide-react'

export function MockDataAutoFill() {
    const handleMockFill = () => {
        const inputs = document.querySelectorAll('input, select, textarea')
        
        inputs.forEach((el) => {
            const name = el.getAttribute('name')?.toLowerCase() || ''
            const type = el.getAttribute('type')?.toLowerCase() || ''
            const placeholder = el.getAttribute('placeholder')?.toLowerCase() || ''
            
            let val = ''

            if (type === 'hidden' || el.hasAttribute('disabled') || el.hasAttribute('readonly')) return

            if (name.includes('qty') || name.includes('quantity') || name.includes('weight') || placeholder.includes('pcs') || placeholder.includes('kg') || name.includes('packs') || name.includes('rejects')) {
                val = (Math.floor(Math.random() * 50) + 10).toString() 
            } else if (name.includes('vehicle') || placeholder.includes('vehicle')) {
                val = \`MH\${Math.floor(10 + Math.random()*89)} AB \${Math.floor(1000 + Math.random()*8999)}\`
            } else if (name.includes('email')) {
                val = "test@example.com"
            } else if (name.includes('supplier') || name.includes('driver') || name.includes('operator')) {
                val = "John Doe " + Math.floor(Math.random()*100)
            } else if (name.includes('phone') || name.includes('contact')) {
                val = "98" + Math.floor(10000000 + Math.random() * 89999999)
            } else if (name.includes('invoice') || name.includes('challan') || name.includes('batch')) {
                val = \`INV-\${Math.floor(1000 + Math.random()*8999)}\`
            } else if (name.includes('temperature') || name.includes('moisture') || name.includes('rpm') || name.includes('gauge')) {
                val = (Math.floor(Math.random() * 80) + 20).toString()
            } else if (name.includes('remarks') || name.includes('comments')) {
                val = "Looks good. Auto filled data."
            } else if (type === 'number') {
                val = (Math.floor(Math.random() * 50) + 1).toString()
            } else if (type === 'text') {
                val = "Sample Data " + Math.floor(Math.random() * 100)
            } else if (el.tagName.toLowerCase() === 'select') {
                const options = Array.from(el.querySelectorAll('option'))
                if (options.length > 0) {
                    const validOptions = options.filter(o => o.value !== '')
                    if (validOptions.length > 0) {
                        val = validOptions[0].value
                    }
                }
            }

            if (type === 'checkbox' || type === 'radio') {
                const inputEl = el 
                if (!inputEl.checked) {
                    inputEl.click()
                }
            } else if (val !== '') {
                let prototype = Object.getPrototypeOf(el)
                if (el.tagName.toLowerCase() === 'textarea') {
                    prototype = window.HTMLTextAreaElement.prototype
                } else if (el.tagName.toLowerCase() === 'select') {
                    prototype = window.HTMLSelectElement.prototype
                } else {
                    prototype = window.HTMLInputElement.prototype
                }

                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
                nativeInputValueSetter?.call(el, val)

                el.dispatchEvent(new Event('input', { bubbles: true }))
                el.dispatchEvent(new Event('change', { bubbles: true }))
            }
        })
    }

    return (
        <Button 
            onClick={handleMockFill} 
            title="Auto-fill with Mock Data"
            className="fixed bottom-20 right-4 z-[9999] rounded-full h-14 w-14 shadow-[0_4px_14px_rgba(0,0,0,0.25)] bg-slate-900 hover:bg-slate-800 text-sky-400 p-0 flex items-center justify-center border-2 border-slate-700 transition-all hover:scale-105 active:scale-95 group"
        >
            <Wand2 className="h-6 w-6 group-hover:animate-pulse" />
        </Button>
    )
}`

fs.writeFileSync("d:/Documents/Mini Project/Analytical_MES/web/components/business/MockDataAutoFill.tsx", code)
