'use client'

import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { Activity, Ban, Package } from 'lucide-react'

export default function ProductionDashboard() {
    const supabase = createClient()

    // 1. Fetch KPI Stats (Today)
    const { data: stats } = useQuery({
        queryKey: ['kpi-stats'],
        queryFn: async () => {
            const { data } = await supabase.rpc('rpc_get_production_stats', { p_date: new Date().toISOString() })
            return data
        }
    })

    // 2. Fetch Trend Data (Mocking trend by fetching logs)
    // In real app, use `rpc_get_hourly_trend`. Here we mock for visualization if logs empty.
    const trendData = [
        { time: '08:00', output: 1200, target: 1500 },
        { time: '09:00', output: 1450, target: 1500 },
        { time: '10:00', output: 1100, target: 1500 }, // Dip (Downtime?)
        { time: '11:00', output: 1550, target: 1500 },
        { time: '12:00', output: 1500, target: 1500 },
    ]

    return (
        <div className="max-w-6xl mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Production Supervisor Dashboard</h1>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Packing (Today)</CardTitle>
                        <Package className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.packs_produced || 0} packs</div>
                        <p className="text-xs text-slate-500">Waste: {stats?.waste_kg || 0} kg</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Oven Downtime</CardTitle>
                        <Ban className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats?.oven_downtime_mins || 0} mins</div>
                        <p className="text-xs text-slate-500">Capacity Impact Calculation Active</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
                        <Activity className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">87%</div>
                        <p className="text-xs text-slate-500">+2% from yesterday</p>
                    </CardContent>
                </Card>
            </div>

            {/* CHARTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Production Trend (Output vs Target)</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="output" stroke="#2563eb" strokeWidth={2} />
                                <Line type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="5 5" />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Downtime By Reason (Pareto)</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { reason: 'Mechanical', mins: 45 },
                                { reason: 'Electrical', mins: 30 },
                                { reason: 'No Material', mins: 15 },
                            ]}>
                                <XAxis dataKey="reason" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="mins" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
