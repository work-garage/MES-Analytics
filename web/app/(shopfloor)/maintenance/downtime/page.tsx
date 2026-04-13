'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Wrench, Square, Clock } from 'lucide-react'
import {
    DOWNTIME_CATEGORIES,
    DOWNTIME_REASONS,
    DOWNTIME_STAGES,
    getDowntimeReasonLabel,
} from '@/lib/constants/maintenance'

type DowntimeFormValues = {
    machine_id: string
    category: string
    stage: string
    reason: string
    reason_other: string
    estimated_wastage_kg: number
    estimated_output_loss_kg: number
    remarks: string
    oven_shutdown: boolean
}

type ActiveDowntimeTicket = {
    id: string
    ticket_no: string | null
    status: string | null
    stage: string | null
    reason_code: string | null
    start_ts: string | null
    end_ts: string | null
    created_at: string | null
    machines?: { name?: string | null; code?: string | null } | null
}

function generateTicketNo() {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const rand = Math.floor(Math.random() * 900 + 100)
    return `DT-${date}-${time}-${rand}`
}

async function createDowntimeWithFallback(
    supabase: ReturnType<typeof createClient>,
    values: DowntimeFormValues,
    userId: string,
) {
    const reasonCode = values.reason === 'OTHER' ? 'OTHER' : values.reason
    const reasonSuffix = values.reason === 'OTHER' && values.reason_other.trim()
        ? `Other reason: ${values.reason_other.trim()}`
        : ''
    const metrics = {
        estimated_wastage_kg: Number(values.estimated_wastage_kg || 0),
        estimated_output_loss_kg: Number(values.estimated_output_loss_kg || 0),
    }
    const metricsLine = `__METRICS__${JSON.stringify(metrics)}`
    const mergedRemarks = [reasonSuffix, values.remarks, metricsLine].filter(Boolean).join('\n').trim()

    const rpcAttempt = await supabase.rpc('rpc_create_downtime_ticket', {
        p_machine_id: values.machine_id,
        p_reason_code: reasonCode,
        p_category: values.category,
        p_stage: values.stage,
        p_oven_shutdown: values.oven_shutdown,
        p_start_ts: new Date().toISOString(),
        p_remarks: mergedRemarks,
        p_user_id: userId,
    })

    if (!rpcAttempt.error) return

    const maybeTicketIssue = /ticket_no|not-null|null value/i.test(rpcAttempt.error.message || '')
    if (!maybeTicketIssue) throw rpcAttempt.error

    const nowIso = new Date().toISOString()
    const base = {
        ticket_no: generateTicketNo(),
        machine_id: values.machine_id,
        reason_code: reasonCode,
        category: values.category,
        stage: values.stage,
        oven_shutdown: values.oven_shutdown,
        affects_capacity: values.oven_shutdown,
        remarks: mergedRemarks,
    }

    const candidates = [
        { ...base, start_ts: nowIso, created_by: userId, status: 'OPEN' },
        { ...base, start_ts: nowIso, user_id: userId, status: 'OPEN' },
        { ...base, created_by: userId, status: 'OPEN' },
        { ...base, status: 'OPEN' },
        base,
    ]

    let lastError: any = rpcAttempt.error
    for (const payload of candidates) {
        const { error } = await supabase.from('downtime_tickets').insert(payload)
        if (!error) return
        lastError = error
    }

    throw lastError
}

function getDurationMins(startTs: string | null | undefined, endTs?: string | null | undefined) {
    if (!startTs) return 0
    const start = new Date(startTs).getTime()
    const end = endTs ? new Date(endTs).getTime() : Date.now()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
    return Math.max(Math.round((end - start) / 60000), 0)
}

async function stopDowntimeWithFallback(
    supabase: ReturnType<typeof createClient>,
    ticketId: string,
    userId: string,
    closureNote: string,
) {
    const rpcAttempt = await supabase.rpc('close_downtime_ticket', {
        p_ticket_id: ticketId,
        p_mechanic_name: 'Shopfloor Operator',
        p_parts_used: null,
        p_closure_notes: closureNote || 'Stopped from shopfloor downtime console',
    })

    if (!rpcAttempt.error) return

    const nowIso = new Date().toISOString()
    const candidates = [
        {
            status: 'CLOSED',
            end_ts: nowIso,
            closed_at: nowIso,
            closed_by: userId,
            closure_notes: closureNote || null,
            updated_at: nowIso,
        },
        {
            status: 'CLOSED',
            end_ts: nowIso,
            closed_by: userId,
            updated_at: nowIso,
        },
        {
            status: 'CLOSED',
            end_ts: nowIso,
            updated_at: nowIso,
        },
        {
            status: 'CLOSED',
            end_ts: nowIso,
        },
    ]

    let lastError: any = rpcAttempt.error
    for (const payload of candidates) {
        const { error } = await supabase
            .from('downtime_tickets')
            .update(payload)
            .eq('id', ticketId)
        if (!error) return
        lastError = error
    }

    throw lastError
}

export default function DowntimePage() {
    const { user } = useAuth()
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [stoppingId, setStoppingId] = useState<string | null>(null)
    const [stopNotes, setStopNotes] = useState<Record<string, string>>({})
    const [tick, setTick] = useState(Date.now())

    const form = useForm<DowntimeFormValues>({
        defaultValues: {
            machine_id: '',
            category: 'MECHANICAL',
            stage: 'CUTTING',
            reason: 'NO_MATERIAL',
            reason_other: '',
            estimated_wastage_kg: 0,
            estimated_output_loss_kg: 0,
            remarks: '',
            oven_shutdown: false
        }
    })

    const selectedReason = form.watch('reason')

    const { data: machines } = useQuery({
        queryKey: ['machines-downtime-form'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('machines')
                .select('id, code, name')
                .order('name')
            if (error) throw error
            return data || []
        }
    })

    useEffect(() => {
        if (!machines?.length) return
        if (!form.getValues('machine_id')) {
            form.setValue('machine_id', machines[0].id)
        }
    }, [machines, form])

    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 15_000)
        return () => clearInterval(timer)
    }, [])

    const { data: activeRows, isLoading: loadingActive } = useQuery({
        queryKey: ['downtime-active-shopfloor'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('downtime_tickets')
                .select('id, ticket_no, status, stage, reason_code, start_ts, end_ts, created_at, machines(name, code)')
                .order('created_at', { ascending: false })
                .limit(30)
            if (error) throw error
            return (data || []) as ActiveDowntimeTicket[]
        },
        refetchInterval: 15_000,
    })

    const activeTickets = useMemo(() => {
        return (activeRows || []).filter((row) => String(row.status || '').toUpperCase() !== 'CLOSED')
    }, [activeRows, tick])

    const onSubmit = async (values: DowntimeFormValues) => {
        if (!user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }
        if (!values.machine_id) {
            toast.error('Please select a machine.')
            return
        }
        if (values.reason === 'OTHER' && !values.reason_other.trim()) {
            toast.error('Please enter other reason details.')
            return
        }

        setIsSubmitting(true)
        try {
            await createDowntimeWithFallback(supabase, values, user.id)
            toast.success("Downtime Ticket Raised")
            form.reset({
                machine_id: machines?.[0]?.id ?? '',
                category: 'MECHANICAL',
                stage: 'CUTTING',
                reason: 'NO_MATERIAL',
                reason_other: '',
                estimated_wastage_kg: 0,
                estimated_output_loss_kg: 0,
                remarks: '',
                oven_shutdown: false,
            })
            queryClient.invalidateQueries({ queryKey: ['downtime-active-shopfloor'] })
            queryClient.invalidateQueries({ queryKey: ['downtime_tickets'] })
            queryClient.invalidateQueries({ queryKey: ['production-dashboard-live'] })
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const stopTicket = async (ticket: ActiveDowntimeTicket) => {
        if (!user?.id) {
            toast.error('User session not ready. Please sign in again.')
            return
        }

        setStoppingId(ticket.id)
        try {
            const note = stopNotes[ticket.id] || ''
            await stopDowntimeWithFallback(supabase, ticket.id, user.id, note)
            const mins = getDurationMins(ticket.start_ts)
            toast.success(`Downtime stopped (${mins} mins)`)
            queryClient.invalidateQueries({ queryKey: ['downtime-active-shopfloor'] })
            queryClient.invalidateQueries({ queryKey: ['downtime_tickets'] })
            queryClient.invalidateQueries({ queryKey: ['production-dashboard-live'] })
        } catch (e: any) {
            toast.error('Failed to stop downtime', { description: e.message })
        } finally {
            setStoppingId(null)
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="border-red-200 bg-red-50/10 h-fit">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-700">
                        <Wrench className="h-5 w-5" />
                        Raise Downtime Ticket
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Stage / Section</Label>
                                <Select onValueChange={v => form.setValue('stage', v)} value={form.watch('stage')}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DOWNTIME_STAGES.map(item => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select onValueChange={v => form.setValue('category', v)} value={form.watch('category')}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DOWNTIME_CATEGORIES.map(item => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Machine (Auto-selected, can change)</Label>
                            <Select onValueChange={v => form.setValue('machine_id', v)} value={form.watch('machine_id')}>
                                <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
                                <SelectContent>
                                    {(machines || []).map((machine: any) => (
                                        <SelectItem key={machine.id} value={machine.id}>
                                            {machine.name} ({machine.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Reason Code</Label>
                            <Select onValueChange={v => form.setValue('reason', v)} value={selectedReason}>
                                <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                                <SelectContent>
                                    {DOWNTIME_REASONS.map(item => (
                                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedReason === 'OTHER' && (
                            <div className="space-y-2">
                                <Label>Other Reason Details</Label>
                                <Input
                                    {...form.register('reason_other')}
                                    placeholder="Describe the issue"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Estimated Wastage (kg)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    {...form.register('estimated_wastage_kg', { valueAsNumber: true })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Estimated Output Loss (kg)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    {...form.register('estimated_output_loss_kg', { valueAsNumber: true })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 border p-3 rounded bg-white">
                            <Switch id="oven-down" onCheckedChange={v => form.setValue('oven_shutdown', v)} />
                            <Label htmlFor="oven-down" className="font-semibold">Oven Shutdown? (Affects Capacity)</Label>
                        </div>

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea {...form.register('remarks')} />
                        </div>

                        <Button type="submit" variant="destructive" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Create Ticket"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-orange-600" />
                            Active Downtimes
                        </span>
                        <Badge variant="destructive">{activeTickets.length}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loadingActive ? (
                        <div className="text-sm text-slate-500 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading active downtimes...
                        </div>
                    ) : activeTickets.length === 0 ? (
                        <div className="text-sm text-slate-500">No active downtime tickets.</div>
                    ) : (
                        activeTickets.map((ticket) => {
                            const mins = getDurationMins(ticket.start_ts)
                            return (
                                <div key={ticket.id} className="border rounded-lg p-4 space-y-3 bg-white">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-sm text-slate-900">
                                                {ticket.ticket_no || ticket.id.slice(0, 8)} - {getDowntimeReasonLabel(ticket.reason_code)}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {ticket.stage || 'N/A'} | {ticket.machines?.name || 'Machine N/A'} {ticket.machines?.code ? `(${ticket.machines.code})` : ''}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                Started: {ticket.start_ts ? new Date(ticket.start_ts).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="font-mono">{mins} mins</Badge>
                                    </div>

                                    <Input
                                        placeholder="Closure note (optional)"
                                        value={stopNotes[ticket.id] || ''}
                                        onChange={(e) => setStopNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                                    />

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border-red-300 text-red-700 hover:bg-red-50"
                                        disabled={stoppingId === ticket.id}
                                        onClick={() => stopTicket(ticket)}
                                    >
                                        {stoppingId === ticket.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                                        Stop Active Downtime
                                    </Button>
                                </div>
                            )
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
