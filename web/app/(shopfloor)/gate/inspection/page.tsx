'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null): value is string {
    return !!value && UUID_RE.test(value)
}

export default function GateInspectionPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading held-entry review...</div>}>
            <GateInspectionContent />
        </Suspense>
    )
}

function GateInspectionContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const rawEntryId = searchParams.get('id')
    const entryId = isUuid(rawEntryId) ? rawEntryId : null
    const supabase = createClient()

    const [entry, setEntry] = useState<any>(null)
    const [reviewRemark, setReviewRemark] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (rawEntryId && !entryId) {
            toast.error('Invalid held-entry link. Please select from Held Gate Entries.')
            router.replace('/gate')
        }
    }, [rawEntryId, entryId, router])

    useEffect(() => {
        const load = async () => {
            if (!entryId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            const { data, error } = await supabase
                .from('gate_entries')
                .select('id, status, vehicle_number, driver_name, challan_no, hold_reason, vendors(name), materials(name)')
                .eq('id', entryId)
                .single()

            if (error || !data) {
                toast.error('Unable to load gate entry for review.')
                router.replace('/gate')
                return
            }

            setEntry(data)
            setReviewRemark(data.hold_reason || '')
            setIsLoading(false)
        }

        load()
    }, [entryId, router, supabase])

    const updateStatus = async (nextStatus: string, nextRemark?: string) => {
        if (!entryId) return

        setIsSubmitting(true)
        const { error } = await supabase
            .from('gate_entries')
            .update({
                status: nextStatus,
                hold_reason: nextRemark || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', entryId)

        setIsSubmitting(false)
        if (error) throw error
    }

    const handleRelease = async () => {
        try {
            await updateStatus('CHECKED_IN', '')
            toast.success('Vehicle released to Weighbridge queue.')
            router.push(`/weighbridge?entry_id=${entryId}`)
        } catch (error: any) {
            toast.error('Failed to release vehicle', { description: error.message })
        }
    }

    const handlePriorityReview = async () => {
        if (!reviewRemark.trim()) {
            toast.error('Please provide review remarks before escalation.')
            return
        }

        try {
            await updateStatus('PRIORITY_REVIEW', reviewRemark.trim())
            toast.warning('Vehicle marked for priority review and remains in held queue.')
            router.push('/gate')
        } catch (error: any) {
            toast.error('Failed to update hold status', { description: error.message })
        }
    }

    const handleReject = async () => {
        if (!reviewRemark.trim()) {
            toast.error('Rejection reason is required.')
            return
        }

        try {
            await updateStatus('VEHICLE_REJECTED', reviewRemark.trim())
            toast.error('Vehicle rejected and removed from active gate flow.')
            router.push('/gate')
        } catch (error: any) {
            toast.error('Failed to reject vehicle', { description: error.message })
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading review context...
            </div>
        )
    }

    if (!entry) return <div className="p-8">Entry not found.</div>

    return (
        <div className="max-w-2xl mx-auto py-6 space-y-6">
            <Button variant="ghost" className="-ml-3" onClick={() => router.push('/gate')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Held Entries
            </Button>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                        Held Gate Entry Review
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded">
                        <div>
                            <p className="text-slate-500">Vehicle</p>
                            <p className="font-semibold">{entry.vehicle_number}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Driver</p>
                            <p className="font-semibold">{entry.driver_name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Vendor</p>
                            <p className="font-semibold">{entry.vendors?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Material</p>
                            <p className="font-semibold">{entry.materials?.name || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-slate-500">Challan</p>
                            <p className="font-semibold">{entry.challan_no || 'N/A'}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Review Remarks / Reason</Label>
                        <Input
                            value={reviewRemark}
                            onChange={(e) => setReviewRemark(e.target.value)}
                            placeholder="Enter hold continuation or rejection reason"
                        />
                    </div>

                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        Use Release only when physical checks are complete and vehicle can proceed safely.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Button onClick={handleRelease} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Release
                        </Button>
                        <Button type="button" variant="secondary" onClick={handlePriorityReview} disabled={isSubmitting}>
                            <ShieldAlert className="mr-2 h-4 w-4" /> Priority Hold
                        </Button>
                        <Button type="button" variant="destructive" onClick={handleReject} disabled={isSubmitting}>
                            <XCircle className="mr-2 h-4 w-4" /> Reject
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
