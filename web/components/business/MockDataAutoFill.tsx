'use client'

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
            
            let val: string | number | boolean = ''

            // Skip hidden or disabled elements
            if (type === 'hidden' || el.hasAttribute('disabled') || el.hasAttribute('readonly')) return

            // Heuristics based on name/placeholder
            if (name.includes('qty') || name.includes('quantity') || name.includes('weight') || placeholder.includes('pcs') || placeholder.includes('kg') || name.includes('packs') || name.includes('rejects') || name.includes('count')) {
                val = (Math.floor(Math.random() * 50) + 10).toString() 
            } else if (name.includes('vehicle') || placeholder.includes('vehicle')) {
                val = `MH${Math.floor(10 + Math.random()*89)} AB ${Math.floor(1000 + Math.random()*8999)}`
            } else if (name.includes('email')) {
                val = "test@example.com"
            } else if (name.includes('supplier') || name.includes('driver') || name.includes('operator') || name.includes('vendor')) {
                val = "John Doe " + Math.floor(Math.random()*100)
            } else if (name.includes('phone') || name.includes('contact')) {
                val = "98" + Math.floor(10000000 + Math.random() * 89999999)
            } else if (name.includes('invoice') || name.includes('challan') || name.includes('batch') || name.includes('po_no') || name.includes('ticket')) {
                val = `CMD-${Math.floor(1000 + Math.random()*8999)}`
            } else if (name.includes('temperature') || name.includes('moisture') || name.includes('rpm') || name.includes('gauge') || name.includes('rate') || name.includes('speed')) {
                val = (Math.floor(Math.random() * 80) + 20).toString()
            } else if (name.includes('remarks') || name.includes('comments') || name.includes('notes') || name.includes('reason') || name.includes('description')) {
                val = "Looks good. Auto filled mock data for testing."
            } else if (type === 'number') {
                val = (Math.floor(Math.random() * 50) + 1).toString()
            } else if (type === 'text') {
                val = "Sample Data " + Math.floor(Math.random() * 100)
            } else if (type === 'time') {
                val = '12:00'
            } else if (type === 'date') {
                val = new Date().toISOString().split('T')[0]
            } else if (el.tagName.toLowerCase() === 'select') {
                const options = Array.from(el.querySelectorAll('option'))
                if (options.length > 1) {
                    const validOptions = options.filter(o => o.value !== '')
                    if (validOptions.length > 0) {
                        val = validOptions[0].value
                    }
                }
            }

            if (type === 'checkbox' || type === 'radio') {
                const inputEl = el as HTMLInputElement
                if (!inputEl.checked) {
                    inputEl.click()
                }
            } else if (val !== '') {
                // React tracks values, so we must set via prototype
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

        // Sequential Radix Combobox filler
        const processComboboxes = async () => {
            const triggers = document.querySelectorAll('button[role="combobox"]')
            for (let i = 0; i < triggers.length; i++) {
                const trigger = triggers[i] as HTMLButtonElement
                if (trigger.disabled) continue

                // Check if already has a value set (radix sets visually)
                // usually textContent is not "Select..." but actual value, but we'll just overwrite.
                trigger.click()
                await new Promise(r => setTimeout(r, 150)) // Wait for portal render

                const options = document.querySelectorAll('[role="option"]')
                for (let j = 0; j < options.length; j++) {
                    const opt = options[j] as HTMLElement
                    // Grab first enabled option
                    if (!opt.hasAttribute('aria-disabled') && opt.textContent?.trim() !== '') {
                        opt.click()
                        break
                    }
                }
                await new Promise(r => setTimeout(r, 150)) // Wait for portal close
            }
        }
        processComboboxes()
    }

    return (
        <Button 
            onClick={handleMockFill} 
            type="button"
            title="Auto-fill with Mock Data"
            className="fixed bottom-20 right-4 z-[9999] rounded-full h-14 w-14 shadow-[0_4px_14px_rgba(0,0,0,0.25)] bg-slate-900 hover:bg-slate-800 text-sky-400 p-0 flex items-center justify-center border-2 border-slate-700 transition-all hover:scale-105 active:scale-95 group"
        >
            <Wand2 className="h-6 w-6 group-hover:animate-pulse" />
        </Button>
    )
}