'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle } from 'lucide-react'

// Types based on rpc_preview_allocation output
interface Allocation {
    grn_id: string
    qty: number
    expiry: string
}

interface ComponentPreview {
    material_id: string
    material_name?: string
    req_qty: number
    fill_rate_pct: number
    allocations: Allocation[]
    shortage: number
}

interface Props {
    preview: ComponentPreview[]
}

export default function AllocationPreview({ preview }: Props) {
    return (
        <div className="space-y-4">
            {preview.map((comp, idx) => (
                <Card key={idx} className="p-4 overflow-hidden border-l-4"
                    style={{ borderLeftColor: comp.fill_rate_pct < 100 ? '#ef4444' : '#22c55e' }}>

                    <div className="flex justify-between items-center mb-2">
                        <div className="font-bold text-lg">{comp.material_name || `Material ID: ${comp.material_id}`}</div>
                        <div className="flex items-center gap-2">
                            {comp.fill_rate_pct < 100 ? (
                                <span className="text-red-600 flex items-center font-bold text-sm">
                                    <AlertCircle className="w-4 h-4 mr-1" /> Shortage: {comp.shortage} kg
                                </span>
                            ) : (
                                <span className="text-green-600 flex items-center font-bold text-sm">
                                    <CheckCircle className="w-4 h-4 mr-1" /> Fully Allocated
                                </span>
                            )}
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead className="py-2">Source GRN</TableHead>
                                <TableHead className="py-2">Expiry</TableHead>
                                <TableHead className="py-2 text-right">Allocated Qty</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {comp.allocations.map((alloc, i) => (
                                <TableRow key={i}>
                                    <TableCell className="font-mono text-xs">{alloc.grn_id.slice(0, 8)}...</TableCell>
                                    <TableCell className="text-xs">{new Date(alloc.expiry).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right font-medium">{alloc.qty}</TableCell>
                                </TableRow>
                            ))}
                            {comp.allocations.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-slate-400 py-2 text-xs">
                                        No stock available
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                </Card>
            ))}
        </div>
    )
}
