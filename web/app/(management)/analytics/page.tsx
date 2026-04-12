'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from 'recharts'
import { Activity, AlertTriangle, Clock } from 'lucide-react'

// Mock Data
const PRODUCTION_DATA = [
    { time: '06:00', target: 1000, actual: 950 },
    { time: '08:00', target: 2000, actual: 1900 },
    { time: '10:00', target: 3000, actual: 2800 },
    { time: '12:00', target: 4000, actual: 3500 }, // Downtime impact
    { time: '14:00', target: 5000, actual: 4400 },
]

const WASTE_DATA = [
    { stage: 'Mixing', waste: 12 },
    { stage: 'Cutting', waste: 45 },
    { stage: 'Oven', waste: 8 },
    { stage: 'Packing', waste: 25 },
]

export default function AnalyticsPage() {
    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">Production Analytics</h1>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Efficiency (OEE)</CardTitle>
                        <Activity className="h-4 w-4 text-slate-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">88.5%</div>
                        <p className="text-xs text-slate-500">-2% from yesterday</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Waste</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">90 kg</div>
                        <p className="text-xs text-slate-500">Highest in Cutting Section</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Downtime</CardTitle>
                        <Clock className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">45 min</div>
                        <p className="text-xs text-slate-500">1 Major Breakdown (Oven)</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Production Trend</CardTitle>
                        <CardDescription>Target vs Actual Packs (Cumulative)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height={280} minWidth={0}>
                            <AreaChart data={PRODUCTION_DATA}>
                                <defs>
                                    <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Area type="monotone" dataKey="target" stroke="#94a3b8" fillOpacity={0} strokeDasharray="5 5" />
                                <Area type="monotone" dataKey="actual" stroke="#2563eb" fillOpacity={1} fill="url(#colorActual)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Waste Analysis</CardTitle>
                        <CardDescription>Waste (kg) by Production Stage</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height={280} minWidth={0}>
                            <BarChart data={WASTE_DATA} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="stage" type="category" width={80} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="waste" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
