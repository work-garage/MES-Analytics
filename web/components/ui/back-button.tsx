'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export function BackButton() {
    const router = useRouter()

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
            title="Go Back"
        >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
        </Button>
    )
}
