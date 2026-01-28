'use client'

import { useState, useEffect, Suspense } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { vehicleInspectionSchema } from '@/lib/validators/inbound'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function VehicleInspectionPage() {
    return (
        <Suspense fallback={<div className="p-8">Loading Inspection...</div>}>
            <VehicleInspectionContent />
        </Suspense>
    )
}

function VehicleInspectionContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const gateEntryId = searchParams.get('id')
    const { user } = useAuth()

    const [gateEntry, setGateEntry] = useState<any>(null)
    const [pendingEntries, setPendingEntries] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const supabase = createClient()

    const form = useForm({
        resolver: zodResolver(vehicleInspectionSchema),
        defaultValues: {
            floor_clean: true,
            walls_clean: true,
            tarpaulin_intact: true,
            odour_ok: true,
            moisture_absent: true,
            seal_intact: true,
            hazardous_history_ok: true,
            remarks: ''
        }
    })

    // Fetch Gate Entry OR List Pending
    useEffect(() => {
        const fetchEntries = async () => {
            setIsLoading(true)
            if (gateEntryId) {
                const { data, error } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .eq('id', gateEntryId)
                    .single()

                if (error) {
                    toast.error("Failed to fetch entry")
                } else {
                    setGateEntry(data)
                }
            } else {
                // Pending List: entries that are WEIGHED or have DISCREPANCY but proceed
                const { data } = await supabase
                    .from('gate_entries')
                    .select('*, vendors(name), materials(name)')
                    .in('status', ['WEIGHED', 'WEIGHED_DISCREPANCY'])
                    .order('updated_at', { ascending: true })

                setPendingEntries(data || [])
            }
            setIsLoading(false)
        }
        fetchEntries()
    }, [gateEntryId])

    const onSubmit = async (values: any) => {
        if (!user) return
        setIsSubmitting(true)

        try {
            // Logic: All TRUE = PASS
            // The validation schema handles required remarks if fail, but here we set Result string.
            const checks = [
                values.floor_clean,
                values.walls_clean,
                values.tarpaulin_intact,
                values.odour_ok,
                values.moisture_absent,
                values.seal_intact,
                values.hazardous_history_ok
            ]
            // If any is false -> FAIL
            const result = checks.every(c => c === true) ? 'PASS' : 'FAIL'

            const { data, error } = await supabase.rpc('rpc_submit_vehicle_inspection', {
                p_gate_entry_id: gateEntryId,
                p_checklist: values,
                p_result: result,
                p_remarks: values.remarks,
                p_inspector_id: user.id,
                p_hazardous_history_ok: values.hazardous_history_ok
            })

            if (error) throw error

            toast.success(`Inspection Submitted: ${result}`)
            // Forward to QA if PASS, else Dashboard or Hold
            if (result === 'PASS') {
                router.push(`/qa?id=${gateEntryId}`)
            } else {
                router.push('/dashboard')
            }

        } catch (error: any) {
            toast.error("Submission Failed", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div>

    if (!gateEntryId && !gateEntry) {
        return (
            <div className="max-w-4xl mx-auto py-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Vehicle Inspections</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">No vehicles available for inspection.</div>
                        ) : (
                            <div className="grid gap-4">
                                {pendingEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50 cursor-pointer"
                                        onClick={() => router.push(`/vehicle-inspection?id=${entry.id}`)}>
                                        <div>
                                            <div className="font-bold">{entry.vehicle_number}</div>
                                            <div className="text-sm text-slate-500">{entry.vendors?.name} - {entry.materials?.name}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded mb-1">{entry.status}</div>
                                            <Button size="sm" variant="outline">Inspect</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Vehicle Inspection (Level 1)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <Label className="text-muted-foreground">Vehicle No</Label>
                        <p className="font-medium text-lg">{gateEntry?.vehicle_number}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Vendor</Label>
                        <p className="font-medium">{gateEntry?.vendors?.name}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Material</Label>
                        <p className="font-medium">{gateEntry?.materials?.name}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Driver</Label>
                        <p className="font-medium">{gateEntry?.driver_name}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Checklist */}
                        <div className="space-y-4">
                            <CheckItem control={form.control} name="floor_clean" label="Floor Clean?" />
                            <CheckItem control={form.control} name="walls_clean" label="Side Walls Clean?" />
                            <CheckItem control={form.control} name="tarpaulin_intact" label="Tarpaulin Intact?" />
                            <CheckItem control={form.control} name="odour_ok" label="No Abnormal Odour?" />
                            <CheckItem control={form.control} name="moisture_absent" label="No Visible Moisture/Dust?" />
                            <CheckItem control={form.control} name="seal_intact" label="Seal Intact?" />
                            <CheckItem control={form.control} name="hazardous_history_ok" label="Hazardous Material History OK?" />
                        </div>

                        <div className="space-y-2">
                            <Label>Remarks (Mandatory if Fail)</Label>
                            <Textarea {...form.register('remarks')} placeholder="Enter observations..." />
                            {form.formState.errors.remarks && (
                                <p className="text-red-500 text-sm">{form.formState.errors.remarks.message?.toString()}</p>
                            )}
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Submit Inspection"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

function CheckItem({ control, name, label }: { control: any, name: string, label: string }) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <div className={`flex items-center justify-between p-3 rounded-lg border ${field.value ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                        {field.value ? <CheckCircle className="text-green-600 h-5 w-5" /> : <XCircle className="text-red-600 h-5 w-5" />}
                        <Label className="text-base cursor-pointer" htmlFor={name}>{label}</Label>
                    </div>
                    <Switch
                        id={name}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                    />
                </div>
            )}
        />
    )
}
