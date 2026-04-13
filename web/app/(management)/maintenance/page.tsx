'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Wrench, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { getDowntimeReasonLabel } from '@/lib/constants/maintenance'

function parseDowntimeMetrics(remarks: string | null | undefined) {
    if (!remarks) return null
    const marker = '__METRICS__'
    const line = remarks.split('\n').find((entry) => entry.startsWith(marker))
    if (!line) return null
    try {
        return JSON.parse(line.slice(marker.length))
    } catch {
        return null
    }
}

function getDurationMins(startTs: string | null | undefined, endTs: string | null | undefined) {
    if (!startTs) return null
    const start = new Date(startTs).getTime()
    const end = endTs ? new Date(endTs).getTime() : Date.now()
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    return Math.max(Math.round((end - start) / 60000), 0)
}

export default function MaintenancePage() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [closingId, setClosingId] = useState<string | null>(null)

    const { register, handleSubmit, reset } = useForm()

    const { data: tickets, isLoading } = useQuery({
        queryKey: ['downtime_tickets'],
        queryFn: async () => {
            const { data } = await supabase
                .from('downtime_tickets')
                .select(`
                *,
                machines ( name, code )
            `)
                .order('created_at', { ascending: false })
            return data || []
        }
    })

    const closeMutation = useMutation({
        mutationFn: async (values: any) => {
            // RPC logic to close ticket and adjust capacity if needed
            const { error } = await supabase.rpc('close_downtime_ticket', {
                p_ticket_id: closingId,
                p_mechanic_name: values.mechanic_name,
                p_parts_used: values.parts_used, // JSON string or array
                p_closure_notes: values.notes
            })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['downtime_tickets'] })
            setClosingId(null)
            reset()
            toast.success("Ticket Closed")
        },
        onError: (err: any) => toast.error(err.message)
    })

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Wrench className="h-6 w-6 text-orange-600" /> Maintenance Console
                </h1>
            </div>

            <Dialog open={!!closingId} onOpenChange={(open) => !open && setClosingId(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Close Downtime Ticket</DialogTitle></DialogHeader>
                    <form onSubmit={handleSubmit((data) => closeMutation.mutate(data))} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Mechanic Name</Label>
                            <Input {...register('mechanic_name', { required: true })} placeholder="John Doe" />
                        </div>
                        <div className="space-y-2">
                            <Label>Spare Parts Used</Label>
                            <Input {...register('parts_used')} placeholder="Bearing X-1, Seal Y-2" />
                            <p className="text-xs text-slate-500">Comma separated parts list</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Closure Notes / RCA</Label>
                            <Input {...register('notes', { required: true })} placeholder="Replaced worn bearing..." />
                        </div>
                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={closeMutation.isPending}>
                            {closeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <CheckCircle className="mr-2 h-4 w-4" /> Confirm Resolution
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Machine</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Estimated Loss</TableHead>
                                <TableHead>Reported At</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead className="w-[150px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : tickets?.map((t: any) => {
                                const isClosed = t.status === 'CLOSED'
                                const duration = getDurationMins(t.start_ts, isClosed ? t.end_ts : null)
                                const metrics = parseDowntimeMetrics(t.remarks)

                                return (
                                    <TableRow key={t.id}>
                                        <TableCell>
                                            <Badge variant={isClosed ? 'secondary' : 'destructive'}>
                                                {t.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {t.machines?.name} <span className="text-xs text-slate-500">({t.machines?.code})</span>
                                        </TableCell>
                                        <TableCell>{getDowntimeReasonLabel(t.reason_code)}</TableCell>
                                        <TableCell className="text-xs">
                                            <div className="text-slate-700">{metrics?.estimated_wastage_kg ?? 0} kg waste</div>
                                            <div className="text-slate-500">{metrics?.estimated_output_loss_kg ?? 0} kg loss</div>
                                        </TableCell>
                                        <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                                        <TableCell className="font-mono">
                                            {typeof duration === 'number'
                                                ? `${duration} m`
                                                : <span className="flex items-center text-orange-600"><Clock className="w-3 h-3 mr-1" /> Active</span>}
                                        </TableCell>
                                        <TableCell>
                                            {!isClosed && (
                                                <Button size="sm" variant="outline" onClick={() => setClosingId(t.id)}>
                                                    Close Ticket
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
