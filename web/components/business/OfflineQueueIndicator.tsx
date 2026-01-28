'use client'

import { useQueue } from '@/lib/sync/queue'
import { CloudOff, CloudUpload, CheckCircle, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export default function OfflineQueueIndicator() {
    const { pendingCount, isSyncing, forceSync } = useQueue()
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (pendingCount === 0 && isOnline) return null

    return (
        <Card className={cn(
            "fixed bottom-4 right-4 p-3 shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5",
            isOnline ? "bg-white border-blue-200" : "bg-yellow-50 border-yellow-200"
        )}>
            {isSyncing ? (
                <CloudUpload className="h-5 w-5 text-blue-500 animate-bounce" />
            ) : !isOnline ? (
                <WifiOff className="h-5 w-5 text-yellow-600" />
            ) : (
                <CloudOff className="h-5 w-5 text-slate-500" />
            )}

            <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-800">
                    {isSyncing ? 'Syncing...' : !isOnline ? 'Offline Mode' : 'Pending Sync'}
                </span>
                <span className="text-xs text-slate-500">
                    {pendingCount} item{pendingCount !== 1 ? 's' : ''} in queue
                </span>
            </div>

            {isOnline && !isSyncing && pendingCount > 0 && (
                <Button size="sm" variant="outline" onClick={() => forceSync()}>
                    Sync Now
                </Button>
            )}
        </Card>
    )
}
