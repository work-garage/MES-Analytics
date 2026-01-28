
'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from 'sonner'

// Helper to sign payloads locally using Web Crypto API
const signPayload = async (payload: any, secret: string) => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const text = JSON.stringify(payload);
    const msgData = encoder.encode(text);

    const key = await window.crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const signature = await window.crypto.subtle.sign("HMAC", key, msgData);

    // Convert ArrayBuffer to Hex String
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export default function SimulatorPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [activeTab, setActiveTab] = useState("weighbridge")

    // Gateway Config
    const [gatewayConfig, setGatewayConfig] = useState({
        url: 'http://localhost:54321/functions/v1',
        secret: 'test-secret-123',
        clientId: 'gateway-01'
    })

    // Weighbridge State
    const [wbData, setWbData] = useState({
        slip_no: 'WB-SIM-001',
        vehicle_no: 'MH-12-AB-1234',
        gross: 15000,
        tare: 5000,
        status: 'OK'
    })

    // RPM State
    const [rpmData, setRpmData] = useState({
        machine_id: 'cutter-01',
        avg_rpm: 120,
        samples: [118, 119, 120, 121, 120]
    })

    const sendWebhook = async (endpoint: string, payload: any) => {
        setIsLoading(true)
        try {
            const body = {
                message_id: crypto.randomUUID(),
                client_id: gatewayConfig.clientId,
                device_id: 'sim-device-01',
                source: 'gateway',
                timestamp: new Date().toISOString(),
                payload,
                firmware_version: 'sim-v1'
            }

            const signature = await signPayload(body, gatewayConfig.secret)
            const targetUrl = `${gatewayConfig.url}/${endpoint}`

            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-signature': signature,
                    'x-client-id': gatewayConfig.clientId,
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify(body)
            })

            const data = await res.json()
            if (res.ok) {
                toast.success(`Sent to ${endpoint}`, { description: `Msg ID: ${body.message_id}` })
            } else {
                toast.error(`Error ${res.status}`, { description: data.error || data.message })
            }

        } catch (e: any) {
            toast.error("Failed to send", { description: e.message })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="container py-8 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Hardware Simulator</h1>
                    <p className="text-muted-foreground">Mock Gateway Events • Tests Edge Functions & Ingest Tables</p>
                </div>
                <Badge variant="outline" className="text-xs font-mono">Gateway: {gatewayConfig.clientId}</Badge>
            </div>

            {/* Config Panel */}
            <Card className="bg-slate-50 border-slate-200">
                <CardHeader className="pb-3"><CardTitle className="text-sm">Gateway Configuration</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                    <div>
                        <Label>Edge Function Base URL</Label>
                        <Input value={gatewayConfig.url} onChange={e => setGatewayConfig({ ...gatewayConfig, url: e.target.value })} />
                        <p className="text-xs text-muted-foreground mt-1">e.g. http://localhost:54321/functions/v1</p>
                    </div>
                    <div>
                        <Label>Shared Secret (HMAC)</Label>
                        <Input type="password" value={gatewayConfig.secret} onChange={e => setGatewayConfig({ ...gatewayConfig, secret: e.target.value })} />
                    </div>
                    <div>
                        <Label>Client ID</Label>
                        <Input value={gatewayConfig.clientId} onChange={e => setGatewayConfig({ ...gatewayConfig, clientId: e.target.value })} />
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="weighbridge" value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="weighbridge">Weighbridge</TabsTrigger>
                    <TabsTrigger value="rpm">RPM / Cutting</TabsTrigger>
                    <TabsTrigger value="packing">Packing Counter</TabsTrigger>
                    <TabsTrigger value="scanners">Scanners</TabsTrigger>
                </TabsList>

                <TabsContent value="weighbridge">
                    <Card>
                        <CardHeader>
                            <CardTitle>Simulate Weighbridge Event</CardTitle>
                            <CardDescription>Sends payload to <code>weighbridge-webhook</code></CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vehicle No</Label>
                                    <Input value={wbData.vehicle_no} onChange={e => setWbData({ ...wbData, vehicle_no: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Slip No</Label>
                                    <Input value={wbData.slip_no} onChange={e => setWbData({ ...wbData, slip_no: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Gross Weight (kg)</Label>
                                    <Input type="number" value={wbData.gross} onChange={e => setWbData({ ...wbData, gross: parseInt(e.target.value) })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tare Weight (kg)</Label>
                                    <Input type="number" value={wbData.tare} onChange={e => setWbData({ ...wbData, tare: parseInt(e.target.value) })} />
                                </div>
                            </div>
                            <Button
                                onClick={() => sendWebhook('weighbridge-webhook', {
                                    slip_no: wbData.slip_no,
                                    vehicle_no: wbData.vehicle_no,
                                    gross_weight: wbData.gross,
                                    tare_weight: wbData.tare,
                                    net_weight: wbData.gross - wbData.tare,
                                    scale_status: wbData.status,
                                    photo_paths: [`sim/${wbData.slip_no}.jpg`]
                                })}
                                disabled={isLoading}
                                className="w-full md:w-auto"
                            >
                                {isLoading ? "Sending..." : "Send Weighbridge Event"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="rpm">
                    <Card>
                        <CardHeader>
                            <CardTitle>Simulate RPM Interval</CardTitle>
                            <CardDescription>Sends sensor data to <code>sensor-ingest</code></CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Machine ID</Label>
                                    <Input value={rpmData.machine_id} onChange={e => setRpmData({ ...rpmData, machine_id: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Avg RPM</Label>
                                    <Input type="number" value={rpmData.avg_rpm} onChange={e => setRpmData({ ...rpmData, avg_rpm: parseFloat(e.target.value) })} />
                                </div>
                            </div>
                            <Button
                                onClick={() => sendWebhook('sensor-ingest', {
                                    sensor_type: 'rpm',
                                    machine_id: rpmData.machine_id,
                                    avg_rpm: rpmData.avg_rpm,
                                    rpm_samples: rpmData.samples,
                                    interval_start: new Date(Date.now() - 60000).toISOString(),
                                    interval_end: new Date().toISOString()
                                })}
                                disabled={isLoading}
                            >
                                Send RPM Event
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="packing">
                    <Card>
                        <CardHeader>
                            <CardTitle>Simulate Packing Log</CardTitle>
                            <CardDescription>Sends packing counters to <code>sensor-ingest</code></CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => sendWebhook('sensor-ingest', {
                                    sensor_type: 'packing',
                                    machine_id: 'packer-01',
                                    sku_id: 'SKU-MARIE-100G',
                                    packs_produced: 500, // This would be cumulative in real life
                                    wrapper_consumed_m: 120.5,
                                    md_reject_count: 2,
                                    md_reject_photos: []
                                })}
                                disabled={isLoading}
                            >
                                Send Packing Event (500 Packs)
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="scanners">
                    <Card>
                        <CardHeader>
                            <CardTitle>Simulate Barcode/RFID Scan</CardTitle>
                            <CardDescription>Sends scan data to <code>scan-ingest</code></CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => sendWebhook('scan-ingest', {
                                    scan_type: 'BARCODE',
                                    code_value: 'MAT-SUGAR-BATCH-001',
                                    scan_method: 'HANDHELD',
                                    location_context: 'PREMIX_ROOM'
                                })}
                                disabled={isLoading}
                            >
                                Send Scan (Sugar Batch)
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
