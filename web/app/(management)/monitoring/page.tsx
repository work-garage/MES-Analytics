'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { Activity, Server, AlertTriangle, CheckCircle, Database } from 'lucide-react'

// Mock Data for MVP - In real app, fetch from `rpc_get_system_health`
const mockTraffic = [
    { time: '08:00', weighbridge: 2, rpm: 45, packing: 120 },
    { time: '09:00', weighbridge: 5, rpm: 60, packing: 450 },
    { time: '10:00', weighbridge: 3, rpm: 58, packing: 440 },
    { time: '11:00', weighbridge: 8, rpm: 62, packing: 480 },
    { time: '12:00', weighbridge: 4, rpm: 55, packing: 300 },
]

const mockGateways = [
    { id: 'gateway-01', location: 'Gate House', status: 'ONLINE', lastSeen: 'Just now', latency: '45ms' },
    { id: 'gateway-02', location: 'Production Line A', status: 'ONLINE', lastSeen: '2m ago', latency: '120ms' },
    { id: 'gateway-03', location: 'Dispatch', status: 'OFFLINE', lastSeen: '4h ago', latency: '-' },
]

const mockAlerts = [
    { id: 1, type: 'CRITICAL', msg: 'MD Spike Detected on Packer-02', time: '10:15 AM' },
    { id: 2, type: 'WARNING', msg: 'Gateway-03 Heartbeat Missed', time: '08:45 AM' },
    { id: 3, type: 'INFO', msg: 'Weighbridge Auto-Calibration Due', time: 'Yesterday' },
]

export default function MonitoringPage() {
    return (
        <div className="container py-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Health & Monitoring</h1>
                    <p className="text-muted-foreground">Real-time status of IoT Gateways, Edge Functions, and Data Ingestion.</p>
                </div>
                <Badge variant="outline" className="px-4 py-1 text-sm bg-green-50 text-green-700 border-green-200">
                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                    System Operational
                </Badge>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Gateways</CardTitle>
                        <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2 / 3</div>
                        <p className="text-xs text-muted-foreground">1 Offline (Dispatch)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ingest Rate</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">850</div>
                        <p className="text-xs text-muted-foreground">Events per hour</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Processing Lag</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">120ms</div>
                        <p className="text-xs text-muted-foreground">Avg RPC time</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recent Errors</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">0.2%</div>
                        <p className="text-xs text-muted-foreground">Last 24 hours</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Charts */}
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ingestion Traffic Analysis</CardTitle>
                            <CardDescription>Event volume by source type over last 5 hours</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={mockTraffic}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="packing" name="Packing Cycles" fill="#3b82f6" stackId="a" />
                                    <Bar dataKey="rpm" name="RPM Readings" fill="#10b981" stackId="a" />
                                    <Bar dataKey="weighbridge" name="Weighbridge" fill="#f59e0b" stackId="a" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Gateway Status Registry</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {mockGateways.map(gw => (
                                    <div key={gw.id} className="flex items-center justify-between p-4 border rounded-lg">
                                        <div className="flex items-center space-x-4">
                                            <div className={`p-2 rounded-full ${gw.status === 'ONLINE' ? 'bg-green-100' : 'bg-red-100'}`}>
                                                <Server className={`h-5 w-5 ${gw.status === 'ONLINE' ? 'text-green-600' : 'text-red-600'}`} />
                                            </div>
                                            <div>
                                                <p className="font-medium">{gw.id}</p>
                                                <p className="text-sm text-slate-500">{gw.location}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant={gw.status === 'ONLINE' ? 'default' : 'destructive'}>{gw.status}</Badge>
                                            <p className="text-xs text-slate-500 mt-1">Last seen: {gw.lastSeen}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Alerts */}
                <Card>
                    <CardHeader>
                        <CardTitle>Live System Alerts</CardTitle>
                        <CardDescription>Critical warnings from Edge Processing</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[600px] pr-4">
                            <div className="space-y-4">
                                {mockAlerts.map(alert => (
                                    <div key={alert.id} className="flex items-start space-x-3 pb-4 border-b last:border-0 last:pb-0">
                                        <AlertTriangle className={`h-5 w-5 shrink-0 ${alert.type === 'CRITICAL' ? 'text-red-600' :
                                                alert.type === 'WARNING' ? 'text-amber-500' : 'text-blue-500'
                                            }`} />
                                        <div>
                                            <p className="text-sm font-medium leading-none mb-1">{alert.msg}</p>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] h-5">{alert.type}</Badge>
                                                <span className="text-xs text-muted-foreground">{alert.time}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
