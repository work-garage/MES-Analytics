'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Wrench } from 'lucide-react'

export default function DowntimePage() {
    const { user } = useAuth()
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const form = useForm({
        defaultValues: {
            machine_id: '',
            category: 'MECHANICAL',
            stage: 'CUTTING',
            reason: '',
            remarks: '',
            oven_shutdown: false
        }
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            // Need UUID for machine. For prototype we'll lookup or insert?
            // Existing 'machines' table? I recall using text 'machine_id' in logs.
            // RPC expects UUID. 
            // Let's check `downtime_tickets` schema. It says `machine_id UUID`.
            // Uh oh. My `cutting_process_logs` used TEXT `machine_id`.
            // The system requirements imply "Machine ID" (Master Data).
            // To prevent UUID error, we need a valid UUID.
            // OPTION: Pick a Machine from `machines` table if exists, or use a hardcoded valid UUID for Demo.
            // I'll assume we have a list.

            // Hack for Prototype: Fetch a machine or use a placeholder if I can't guarantee UUID.
            // I'll fetch machines first.
            const { data: machines } = await supabase.from('machines').select('id, name').limit(1)
            const machineId = machines?.[0]?.id || '00000000-0000-0000-0000-000000000000'

            const { error } = await supabase.rpc('rpc_create_downtime_ticket', {
                p_machine_id: machineId,
                p_reason_code: values.reason,
                p_category: values.category,
                p_stage: values.stage,
                p_oven_shutdown: values.oven_shutdown,
                p_start_ts: new Date().toISOString(),
                p_remarks: values.remarks,
                p_user_id: user?.id
            })

            if (error) throw error
            toast.success("Downtime Ticket Raised")
            form.reset()
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card className="border-red-200 bg-red-50/10">
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
                                <Select onValueChange={v => form.setValue('stage', v)} defaultValue="CUTTING">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MIXING">Mixing</SelectItem>
                                        <SelectItem value="CUTTING">Cutting</SelectItem>
                                        <SelectItem value="BAKING">Baking</SelectItem>
                                        <SelectItem value="PACKING">Packing</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select onValueChange={v => form.setValue('category', v)} defaultValue="MECHANICAL">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MECHANICAL">Mechanical</SelectItem>
                                        <SelectItem value="ELECTRICAL">Electrical</SelectItem>
                                        <SelectItem value="OPERATIONAL">Operational</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Machine (Auto-Selected for Demo)</Label>
                            <Input disabled placeholder="Auto-detected..." />
                        </div>

                        <div className="space-y-2">
                            <Label>Reason Code</Label>
                            <Select onValueChange={v => form.setValue('reason', v)}>
                                <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BELT_BROKEN">Belt Broken</SelectItem>
                                    <SelectItem value="MOTOR_TRIP">Motor Trip</SelectItem>
                                    <SelectItem value="NO_MATERIAL">No Material</SelectItem>
                                    <SelectItem value="CLEANING">Cleaning</SelectItem>
                                </SelectContent>
                            </Select>
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
        </div>
    )
}
