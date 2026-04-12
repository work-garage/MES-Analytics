'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Loader2, ClipboardCheck, Camera } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function AuditPage() {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Stock Snapshot
    const { data: stock, isLoading, refetch } = useQuery({
        queryKey: ['audit-stock'],
        queryFn: async () => {
            const { data } = await supabase.rpc('rpc_get_audit_snapshot')
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            rows: [] as any[]
        }
    })

    // Populate form when data loads
    useEffect(() => {
        if (stock) {
            form.reset({
                rows: stock.map((item: any) => ({
                    grn_id: item.grn_id,
                    grn_no: item.grn_no,
                    material: item.material_name,
                    system_qty: item.system_qty,
                    physical_qty: item.system_qty, // Default to matching
                    reason: '',
                    photo: null
                }))
            })
        }
    }, [stock, form])

    const { fields } = useFieldArray({ control: form.control, name: "rows" })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            const changedRows = values.rows.filter((r: any) => Number(r.physical_qty) !== Number(r.system_qty))

            // Map to RPC structure
            const adjustments = values.rows.map((r: any) => ({
                grn_id: r.grn_id,
                physical_qty: Number(r.physical_qty),
                reason: r.reason,
                photo: r.photo // Path if uploaded, simplified here
            }))

            const { data: userData } = await supabase.auth.getUser()
            const userId = userData.user?.id
            if (!userId) throw new Error('User session not available')

            const { error } = await supabase.rpc('rpc_submit_audit', {
                p_adjustments: adjustments,
                p_user_id: userId
            })

            if (error) throw error

            // Persist reconciled quantities so refreshed inventory reflects physical count.
            for (const row of changedRows) {
                const physicalQty = Number(row.physical_qty)

                const { error: grnError } = await supabase
                    .from('grns')
                    .update({ net_qty: physicalQty, updated_at: new Date().toISOString() })
                    .eq('id', row.grn_id)
                if (grnError) throw grnError

                const { error: invError } = await supabase
                    .from('main_inventory')
                    .update({ available_qty: physicalQty, last_updated: new Date().toISOString() })
                    .eq('grn_id', row.grn_id)
                if (invError) throw invError
            }

            await refetch()
            toast.success(`Audit Logged Successfully${changedRows.length ? ` • Updated ${changedRows.length} qty rows` : ''}`)

        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) return <div className="p-10"><Loader2 className="animate-spin" /> Loading Stock...</div>

    return (
        <div className="max-w-6xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <ClipboardCheck className="text-purple-600" /> Daily Inventory Reconciliation
            </h1>

            <form onSubmit={form.handleSubmit(onSubmit)}>
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>GRN No</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead className="text-right">System Qty</TableHead>
                                    <TableHead className="w-[150px]">Physical Qty</TableHead>
                                    <TableHead className="w-[100px]">Variance</TableHead>
                                    <TableHead>Reason / Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => {
                                    // Watch values to calc variance live
                                    const sys = form.watch(`rows.${index}.system_qty`)
                                    const phys = form.watch(`rows.${index}.physical_qty`)
                                    const variance = (Number(phys) - Number(sys)).toFixed(2)
                                    const isVariance = Number(variance) !== 0

                                    return (
                                        <TableRow key={field.id} className={isVariance ? "bg-red-50" : ""}>
                                            <TableCell className="font-mono">{field.grn_no}</TableCell>
                                            <TableCell>{field.material}</TableCell>
                                            <TableCell className="text-right">{Number(field.system_qty).toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...form.register(`rows.${index}.physical_qty`)}
                                                    className={isVariance ? "border-red-500 font-bold text-red-700" : ""}
                                                />
                                            </TableCell>
                                            <TableCell className={isVariance ? "text-red-600 font-bold" : "text-green-600"}>
                                                {Number(variance) > 0 ? "+" : ""}{variance}
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    placeholder={isVariance ? "Required..." : "Optional"}
                                                    {...form.register(`rows.${index}.reason`)}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="mt-6 flex justify-end gap-4">
                    <Button variant="outline" type="button" onClick={() => form.reset()}>Reset</Button>
                    <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : "Submit Reconciliation"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
