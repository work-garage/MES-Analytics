'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Bell, CircleAlert, ClipboardCheck, Truck, ArrowRightLeft, Warehouse, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type NotificationItem = {
    id: string
    type: 'downtime' | 'dispatch' | 'transfer' | 'grn' | 'fg'
    message: string
    createdAt: string
}

type TopNotificationsProps = {
    buttonClassName?: string
}

function iconFor(type: NotificationItem['type']) {
    if (type === 'downtime') return <CircleAlert className="h-4 w-4 text-red-600" />
    if (type === 'dispatch') return <Truck className="h-4 w-4 text-blue-600" />
    if (type === 'grn') return <Warehouse className="h-4 w-4 text-emerald-600" />
    if (type === 'fg') return <PackageCheck className="h-4 w-4 text-indigo-600" />
    return <ArrowRightLeft className="h-4 w-4 text-purple-600" />
}

export default function TopNotifications({ buttonClassName }: TopNotificationsProps) {
    const supabase = createClient()

    const { data: notifications } = useQuery({
        queryKey: ['top-notifications'],
        queryFn: async () => {
            const [downtimeRes, dispatchRes, transferRes, grnRes, fgRes] = await Promise.all([
                supabase.from('downtime_tickets').select('id, ticket_no, reason_code, created_at').order('created_at', { ascending: false }).limit(6),
                supabase.from('dispatches').select('id, dispatch_no, destination, created_at').order('created_at', { ascending: false }).limit(6),
                supabase.from('sub_inventory_transfers').select('id, transfer_no, from_location, to_location, created_at').order('created_at', { ascending: false }).limit(6),
                supabase.from('grns').select('id, grn_no, status, created_at').order('created_at', { ascending: false }).limit(6),
                supabase.from('fg_batches').select('id, fg_batch_no, created_at').order('created_at', { ascending: false }).limit(6),
            ])

            const events: NotificationItem[] = []

            for (const row of downtimeRes.data || []) {
                events.push({
                    id: `d-${row.id}`,
                    type: 'downtime',
                    message: `Downtime ${row.ticket_no} raised (${row.reason_code || 'Reason not set'})`,
                    createdAt: row.created_at,
                })
            }

            for (const row of dispatchRes.data || []) {
                events.push({
                    id: `p-${row.id}`,
                    type: 'dispatch',
                    message: `Dispatch ${row.dispatch_no} created for ${row.destination || 'N/A'}`,
                    createdAt: row.created_at,
                })
            }

            for (const row of transferRes.data || []) {
                events.push({
                    id: `t-${row.id}`,
                    type: 'transfer',
                    message: `Transfer ${row.transfer_no} from ${row.from_location || '-'} to ${row.to_location || '-'}`,
                    createdAt: row.created_at,
                })
            }

            for (const row of grnRes.data || []) {
                events.push({
                    id: `g-${row.id}`,
                    type: 'grn',
                    message: `GRN ${row.grn_no} recorded (${row.status || 'DRAFT'})`,
                    createdAt: row.created_at,
                })
            }

            for (const row of fgRes.data || []) {
                events.push({
                    id: `f-${row.id}`,
                    type: 'fg',
                    message: `FG Batch ${row.fg_batch_no} created`,
                    createdAt: row.created_at,
                })
            }

            return events
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 12)
        },
        refetchInterval: 30000,
    })

    const unreadCount = useMemo(() => Math.min(notifications?.length || 0, 9), [notifications])

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={`relative ${buttonClassName || ''}`.trim()}>
                    <Bell className="h-5 w-5 text-slate-600" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                            {unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] p-0">
                <div className="border-b px-4 py-3">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                    <p className="text-xs text-slate-500">Latest operational events</p>
                </div>

                <div className="max-h-[360px] overflow-y-auto">
                    {!notifications || notifications.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500">No recent notifications.</div>
                    ) : (
                        notifications.map((item) => (
                            <div key={item.id} className="flex gap-3 border-b px-4 py-3 last:border-b-0">
                                <div className="mt-0.5">{iconFor(item.type)}</div>
                                <div className="min-w-0">
                                    <p className="text-sm text-slate-800">{item.message}</p>
                                    <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
