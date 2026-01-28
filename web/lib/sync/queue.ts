'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, OfflineRequest } from './db'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

export function useQueue() {
    const pendingRequests = useLiveQuery(
        () => db.offlineQueue.where('status').equals('PENDING').count()
    )
    const [isSyncing, setIsSyncing] = useState(false)

    // Enqueue Action
    const addToQueue = async (request: Omit<OfflineRequest, 'id' | 'status' | 'retry_count' | 'created_at'>) => {
        try {
            await db.offlineQueue.add({
                ...request,
                status: 'PENDING',
                retry_count: 0,
                created_at: new Date().toISOString()
            })
            toast.info('Action Queued (Offline Mode)')
        } catch (error) {
            console.error('Queue Error', error)
            toast.error('Failed to save action offline')
        }
    }

    // Sync Logic (Simple Foreground Worker for now)
    const sync = async () => {
        if (isSyncing || !navigator.onLine) return
        setIsSyncing(true)

        const supabase = createClient()
        const requests = await db.offlineQueue.where('status').equals('PENDING').toArray()

        for (const req of requests) {
            try {
                await db.offlineQueue.update(req.id!, { status: 'SYNCING' })
                let finalPayload = { ...req.payload }

                // 1. Upload Blobs if any
                if (req.blobs && req.blobs.length > 0) {
                    for (const blobItem of req.blobs) {
                        const fileName = `${crypto.randomUUID()}.${blobItem.type === 'image/jpeg' ? 'jpg' : 'bin'}`
                        const { data: path, error: uploadErr } = await supabase.storage
                            .from('tmp-uploads') // Use temp public bucket or secure one
                            .upload(fileName, blobItem.data)

                        if (uploadErr) throw uploadErr

                        // Replace key in payload with path
                        // Logic assumes simple key-value replacement
                        finalPayload[blobItem.key] = path.path
                    }
                }

                // 2. Call RPC
                const { error: rpcError } = await supabase.rpc(req.url, finalPayload)

                if (rpcError) throw rpcError

                // Success
                await db.offlineQueue.delete(req.id!)
                toast.success(`Synced: ${req.type}`)

            } catch (error: any) {
                console.error('Sync Error', error)
                await db.offlineQueue.update(req.id!, {
                    status: 'FAILED',
                    error_message: error.message || 'Unknown Error'
                })
                toast.error(`Sync Failed: ${req.type}`)
            }
        }
        setIsSyncing(false)
    }

    // Auto-sync on online
    useEffect(() => {
        const handleOnline = () => sync()
        window.addEventListener('online', handleOnline)
        // Also pull every 30s
        const interval = setInterval(sync, 30000)

        return () => {
            window.removeEventListener('online', handleOnline)
            clearInterval(interval)
        }
    }, [])

    return {
        addToQueue,
        pendingCount: pendingRequests || 0,
        isSyncing,
        forceSync: sync
    }
}
