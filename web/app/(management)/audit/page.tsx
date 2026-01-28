'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Search, ShieldCheck } from 'lucide-react'

export default function AuditLogPage() {
    const supabase = createClient()
    const [search, setSearch] = useState('')

    const { data: logs, isLoading } = useQuery({
        queryKey: ['audit_logs', search],
        queryFn: async () => {
            let query = supabase
                .from('audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)

            if (search) {
                // Simple search on operation_id or event_type
                query = query.or(`operation_id.eq.${search},event_type.ilike.%${search}%`)
            }

            const { data } = await query
            return data || []
        }
    })

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6 text-green-600" /> Audit Trail
                </h1>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search Operation ID or Event..."
                        className="pl-8 w-64"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Timestamp</TableHead>
                                <TableHead>Event Type</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead>Operation ID</TableHead>
                                <TableHead>Signature Hash</TableHead>
                                <TableHead className="w-[100px]">Payload</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-4">Loading...</TableCell></TableRow>
                            ) : logs?.map((log: any) => (
                                <TableRow key={log.id}>
                                    <TableCell className="text-xs text-slate-500">
                                        {new Date(log.created_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono">{log.event_type}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono">{log.user_id?.slice(0, 8)}...</TableCell>
                                    <TableCell className="text-xs font-mono">{log.operation_id?.slice(0, 8)}...</TableCell>
                                    <TableCell className="text-xs font-mono text-green-700 bg-green-50 p-1 rounded max-w-[150px] truncate" title={log.payload_hash}>
                                        {log.payload_hash?.slice(0, 16)}...
                                    </TableCell>
                                    <TableCell>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="sm">View</Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                                <DialogHeader><DialogTitle>Audit Detail: {log.event_type}</DialogTitle></DialogHeader>
                                                <div className="space-y-4">
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-2">Metadata</h4>
                                                        <div className="grid grid-cols-2 text-xs gap-2 bg-slate-50 p-2 rounded">
                                                            <span>Op ID: {log.operation_id}</span>
                                                            <span>User: {log.user_id}</span>
                                                            <span>Hash: {log.payload_hash}</span>
                                                            <span>Time: {log.created_at}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-2">Payload</h4>
                                                        <div className="border rounded p-2 text-xs bg-slate-50">
                                                            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[400px]">
                                                                {JSON.stringify(log.payload, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
