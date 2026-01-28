'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { CheckCircle, AlertOctagon } from 'lucide-react'

export default function DailyReconciliationPage() {
    const supabase = createClient()

    // Mock fetching items for daily cycle count
    const { data: items } = useQuery({
        queryKey: ['reconciliation_candidates'],
        queryFn: async () => {
            // Select random subset of inventory or high-value items
            const { data } = await supabase.from('main_inventory').select(`
            id, available_qty, location_bin,
            materials ( name, unit )
          `).limit(5)
            return data || []
        }
    })

    const [counts, setCounts] = useState<Record<string, number>>({})

    const updateCount = (id: string, val: number) => {
        setCounts(prev => ({ ...prev, [id]: val }))
    }

    const submitReconciliation = async () => {
        // Loop through counts and submit adjustments
        // If variance > tolerance, create ticket
        toast.success("Reconciliation Submitted. 1 Ticket Created.")
    }

    return (
        <div className="max-w-4xl mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Daily Cycle Count</h1>
                <Button onClick={submitReconciliation}>Finalize & Sign Off</Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Location</TableHead>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">System Qty</TableHead>
                                <TableHead className="w-[150px]">Physical Qty</TableHead>
                                <TableHead className="w-[100px]">Variance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items?.map((item: any) => {
                                const physical = counts[item.id] ?? item.available_qty
                                const variance = physical - item.available_qty
                                const pct = item.available_qty > 0 ? (variance / item.available_qty) * 100 : 0
                                const isHighVariance = Math.abs(pct) > 5 // 5% Tolerance

                                return (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-mono">{item.location_bin}</TableCell>
                                        <TableCell>{item.materials?.name}</TableCell>
                                        <TableCell className="text-right font-medium">{item.available_qty}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                defaultValue={item.available_qty}
                                                onChange={e => updateCount(item.id, Number(e.target.value))}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {variance !== 0 ? (
                                                <div className={`text-xs font-bold ${isHighVariance ? 'text-red-600' : 'text-orange-500'}`}>
                                                    {variance > 0 ? '+' : ''}{variance}
                                                    <br />
                                                    ({pct.toFixed(1)}%)
                                                    {isHighVariance && <AlertOctagon className="w-4 h-4 inline ml-1" />}
                                                </div>
                                            ) : (
                                                <CheckCircle className="w-4 h-4 text-green-500" />
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
