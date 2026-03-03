'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/store/auth'
import { Loader2, LogOut, Package, ClipboardCheck, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'

export default function ShopfloorLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, profile, isLoading, checkSession, signOut } = useAuth()
    const router = useRouter()

    useEffect(() => {
        checkSession()
    }, [])

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login')
        }
    }, [isLoading, user, router])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
        )
    }

    if (!user || !profile) return null

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Tablet-optimized Header */}
            <header className="bg-white border-b px-4 h-16 flex items-center justify-between shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <BackButton />
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-2 rounded-lg text-white">
                            <Package className="h-6 w-6" />
                        </div>
                        <span className="font-bold text-lg hidden sm:block">MES Shopfloor</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium">{profile.full_name}</p>
                        <p className="text-xs text-slate-500 capitalize">{profile.role.replace('_', ' ')}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => {
                        signOut()
                        router.push('/login')
                    }}>
                        <LogOut className="h-5 w-5 text-slate-500" />
                    </Button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-4 overflow-y-auto">
                {children}
            </main>

            {/* Tablet Bottom Nav (for quick access) */}
            <nav className="bg-white border-t h-16 flex items-center justify-around md:hidden sticky bottom-0 z-10">
                <Link href="/gate" className="flex flex-col items-center p-2 text-slate-600">
                    <Truck className="h-5 w-5" />
                    <span className="text-xs mt-1">Gate</span>
                </Link>
                <Link href="/qa" className="flex flex-col items-center p-2 text-slate-600">
                    <ClipboardCheck className="h-5 w-5" />
                    <span className="text-xs mt-1">QA</span>
                </Link>
                {/* Add dynamic links based on role later */}
            </nav>
        </div>
    )
}
