'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowRightLeft, Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

export default function MainInventoryPage() {
    const supabase = createClient()
    const router = useRouter()
    const [filter, setFilter] = useState('')

    // Fetch Inventory (GRNs + Reservations)
    // We need to calculate Available Qty = GRN.net_qty - SUM(Reservations)
    // This is best done via RPC or View. For now, let's fetch GRNs and display naive FEFO.
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['inventory', filter],
        queryFn: async () => {
            // Fetch GRNs with Material info
            const { data, error } = await supabase
                .from('grns')
                .select(`
                    id, 
                    grn_no,
                    gate_entries (
                        materials (name, code)
                    ),
                    net_qty,
                    itc_expiry_date,
                    storage_location,
                    container_inventory(units, container_type),
                    reservations(qty, status)
                `)
                .eq('status', 'RECEIVED')
                .order('itc_expiry_date', { ascending: true })

            if (error) throw error

            // Client-side calculation of Available
            return data.map((item: any) => {
                const reserved = item.reservations?.reduce((sum: number, r: any) =>
                    r.status === 'ACTIVE' ? sum + r.qty : sum, 0) || 0
                return {
                    ...item,
                    available: item.net_qty - reserved,
                    container_count: item.container_inventory?.[0]?.units || 0,
                    container_type: item.container_inventory?.[0]?.container_type || 'N/A'
                }
            }).filter((item: any) => item.available > 0) // Hide fully consumed
        }
    })

    return (
        <div className="max-w-6xl mx-auto py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Main Inventory (FEFO View)</h1>
                    <p className="text-slate-500">Track GRN-wise stock, Expiry, and Container Units</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push('/stores/transfer')}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transfer
                    </Button>
                    <Button onClick={() => router.push('/production/sub-batch')}>
                        <Package className="h-4 w-4 mr-2" />
                        Start Production
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-blue-50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Stock (kg)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {inventory ? inventory.reduce((sum: number, i: any) => sum + i.available, 0).toLocaleString() : '...'}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Next Expiry</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {inventory && inventory[0] ? new Date(inventory[0].itc_expiry_date).toLocaleDateString() : '-'}
                        </div>
                        <p className="text-xs text-slate-500">GRN: {inventory && inventory[0] ? (inventory[0].grn_no || 'Pending') : ''}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <Input
                        placeholder="Search Material or GRN..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="max-w-sm"
                    />
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 font-medium">Material</th>
                                    <th className="p-3 font-medium">GRN / Location</th>
                                    <th className="p-3 font-medium text-right">Available (kg)</th>
                                    <th className="p-3 font-medium text-center">Containers</th>
                                    <th className="p-3 font-medium">Expiry (ITC)</th>
                                    <th className="p-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr><td colSpan={6} className="p-8 text-center bg-slate-50">Loading Stock...</td></tr>
                                ) : inventory?.map((item: any) => (
                                    <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                                        <td className="p-3">
                                            <div className="font-semibold">{(Array.isArray(item.gate_entries?.materials) ? item.gate_entries?.materials[0] : item.gate_entries?.materials)?.name}</div>
                                            <div className="text-xs text-slate-500">{(Array.isArray(item.gate_entries?.materials) ? item.gate_entries?.materials[0] : item.gate_entries?.materials)?.code}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-mono">{item.grn_no || item.id.substring(0, 8)}</div>
                                            <Badge variant="outline" className="text-xs font-normal">
                                                {item.storage_location || 'Unassigned'}
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-700">
                                            {item.available.toLocaleString()}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-1 rounded text-xs">
                                                <Package className="h-3 w-3" />
                                                {item.container_count} {item.container_type}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {item.itc_expiry_date}
                                        </td>
                                        <td className="p-3">
                                            <Badge className={new Date(item.itc_expiry_date) < new Date() ? "bg-red-500" : "bg-green-500"}>
                                                Active
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
