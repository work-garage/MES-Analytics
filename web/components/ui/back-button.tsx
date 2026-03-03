'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export function BackButton() {
    const router = useRouter()

    return (
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
            title="Go Back"
        >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
        </Button>
    )
}
