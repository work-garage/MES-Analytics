'use client'

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Factory, Cog, ClipboardCheck, Truck, Users, Package, Database, Activity } from "lucide-react"
import Link from "next/link"

export default function MainDashboard() {
    return (
        <div className="container mx-auto py-10">
            <h1 className="text-3xl font-bold mb-8">MES System Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Production Operations */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Factory className="h-6 w-6 text-blue-600" />
                            Production Floor
                        </CardTitle>
                        <CardDescription>Manage production batches, logging, and machine data.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/production/sub-batch">
                            <Button variant="outline" className="w-full justify-start">Start Sub-Batch</Button>
                        </Link>
                        <Link href="/production/mixing">
                            <Button variant="outline" className="w-full justify-start">Process Logging (Mixing/Oven)</Button>
                        </Link>
                        <Link href="/production/dashboard">
                            <Button className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white">Supervisor Dashboard</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Inbound Logistics */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Truck className="h-6 w-6 text-purple-600" />
                            Inbound Logistics
                        </CardTitle>
                        <CardDescription>Gate, Weighbridge, and Vehicle Inspection.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/gate">
                            <Button variant="outline" className="w-full justify-start">1. Gate Entry</Button>
                        </Link>
                        <Link href="/weighbridge">
                            <Button variant="outline" className="w-full justify-start">2. Weighbridge</Button>
                        </Link>
                        <Link href="/vehicle-inspection">
                            <Button variant="outline" className="w-full justify-start">3. Vehicle Inspection</Button>
                        </Link>
                        <Link href="/stores/transfer">
                            <Button variant="outline" className="w-full justify-start">Sub-Inventory Transfer</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Warehouse & Dispatch */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-6 w-6 text-green-600" />
                            Stores & FG
                        </CardTitle>
                        <CardDescription>GRN, Inventory, and Finished Goods.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/stores/grn-create">
                            <Button variant="outline" className="w-full justify-start">Create GRN</Button>
                        </Link>
                        <Link href="/fg/create">
                            <Button variant="outline" className="w-full justify-start">Create FG Batch</Button>
                        </Link>
                        <Link href="/dispatch/create">
                            <Button variant="outline" className="w-full justify-start">Dispatch</Button>
                        </Link>
                        <Link href="/stores/inventory">
                            <Button variant="secondary" className="w-full justify-start">View Inventory</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Maintenance & Quality */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardCheck className="h-6 w-6 text-amber-600" />
                            Quality & Maintenance
                        </CardTitle>
                        <CardDescription>Downtime tickets, QA inspections, and audits.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/qa">
                            <Button variant="outline" className="w-full justify-start">QA Inspection</Button>
                        </Link>
                        <Link href="/maintenance/downtime">
                            <Button variant="outline" className="w-full justify-start">Raise Downtime Ticket</Button>
                        </Link>
                        <Link href="/stores/audit">
                            <Button variant="outline" className="w-full justify-start">Inventory Audit</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Masters */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cog className="h-6 w-6 text-slate-600" />
                            System Config
                        </CardTitle>
                        <CardDescription>Master data and recipes.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Link href="/masters/machines">
                                <Button variant="ghost" size="sm" className="w-full justify-start border"><Database className="mr-2 h-4 w-4" /> Machines</Button>
                            </Link>
                            <Link href="/masters/materials">
                                <Button variant="ghost" size="sm" className="w-full justify-start border"><Package className="mr-2 h-4 w-4" /> Materials</Button>
                            </Link>
                        </div>
                        <Link href="/recipes">
                            <Button variant="outline" className="w-full justify-start">Recipe Manager</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Analytics */}
                <Card className="hover:shadow-lg transition-shadow border-blue-200 bg-blue-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-6 w-6 text-blue-700" />
                            Analytics & Insights
                        </CardTitle>
                        <CardDescription>Visual dashboards for KPIs and trends.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Link href="/insights">
                            <Button className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white">Full Analytics Dashboard</Button>
                        </Link>
                        <Button variant="ghost" className="w-full justify-start text-slate-500" disabled>Daily Report (Coming Soon)</Button>
                    </CardContent>
                </Card>

            </div>
        </div>
    )
}
