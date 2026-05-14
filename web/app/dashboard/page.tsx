'use client'

import React from "react"
import Link from "next/link"
import { motion, type Variants } from "framer-motion"
import { PowerBIEmbedCard } from "@/components/business/PowerBIEmbedCard"
import { 
    Factory, 
    Cog, 
    ClipboardCheck, 
    Truck, 
    Package, 
    Database, 
    ArrowRight, 
    Activity, 
    Menu,
    ChevronRight,
    ShieldCheck
} from "lucide-react"
import TopNotifications from '@/components/business/TopNotifications'

// --- Animation Variants (same structure, slightly smoother) ---
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.05, delayChildren: 0.1 }
    }
} satisfies Variants

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
} satisfies Variants

export default function MainDashboard() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans antialiased">
            
            {/* Modernized Top Navigation */}
            <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 shadow-sm">
                <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors md:hidden">
                            <Menu className="h-5 w-5 text-gray-700" />
                        </button>
                        <span className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                            <div className="h-5 w-5 bg-gradient-to-br from-gray-900 to-gray-600 rounded-md shadow-sm"></div>
                            Factory<span className="text-gray-500">OS</span>
                        </span>
                        {/* Optional: subtle divider */}
                        <div className="hidden md:block h-6 w-px bg-gray-200 mx-2"></div>
                        <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
                            <ShieldCheck className="h-4 w-4" />
                            <span>MES v2.0</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <TopNotifications buttonClassName="hover:bg-gray-100" />
                        <div className="h-8 w-px bg-gray-200"></div>
                        <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded-full transition-colors">
                            <div className="w-7 h-7 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-medium">
                                A
                            </div>
                            <span className="text-sm font-medium text-gray-700 hidden sm:inline">Admin</span>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-[1440px] mx-auto py-10 px-6 md:px-8">
                
                {/* Enhanced Header with subtle gradient text */}
                <div className="mb-12 max-w-3xl">
                    <motion.h1 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent"
                    >
                        Operations Control
                    </motion.h1>
                    <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                        className="text-lg text-gray-500"
                    >
                        Real-time manufacturing execution, logistics, and quality assurance.
                    </motion.p>
                </div>

                {/* Dashboard Grid – same structure, polished cards */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    
                    {/* 1. Production Floor */}
                    <motion.div variants={itemVariants} className="flex">
                        <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300 flex flex-col group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-gray-100 rounded-xl group-hover:bg-gray-200 transition-colors">
                                    <Factory className="h-5 w-5 text-gray-800" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Production Floor</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-8 flex-grow">Manage live batches, process logging, and real-time machine telemetry.</p>
                            
                            <div className="space-y-3">
                                <Link href="/production/sub-batch" className="block">
                                    <button className="w-full group/btn flex items-center justify-between px-4 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all duration-200 shadow-sm hover:shadow">
                                        Start Sub-Batch
                                        <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                </Link>
                                <Link href="/production/mixing" className="block">
                                    <button className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200">
                                        Process Logging
                                        <Activity className="h-4 w-4 text-gray-400" />
                                    </button>
                                </Link>
                                <Link href="/production/dashboard" className="block">
                                    <button className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-50 transition-all duration-200">
                                        Supervisor Dashboard
                                        <ChevronRight className="h-4 w-4 text-gray-400" />
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                    {/* 2. Inbound Logistics */}
                    <motion.div variants={itemVariants} className="flex">
                        <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300 flex flex-col group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-gray-100 rounded-xl group-hover:bg-gray-200 transition-colors">
                                    <Truck className="h-5 w-5 text-gray-800" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Inbound Logistics</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-8 flex-grow">End-to-end gate control, weighbridge operations, and vehicle tracking.</p>
                            
                            <div className="space-y-2 border border-gray-100 rounded-xl p-2 bg-gray-50/30">
                                <Link href="/gate" className="block">
                                    <button className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white text-gray-800 rounded-lg font-medium text-sm transition-colors text-left">
                                        1. Gate Entry
                                    </button>
                                </Link>
                                <Link href="/weighbridge" className="block">
                                    <button className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white text-gray-800 rounded-lg font-medium text-sm transition-colors text-left">
                                        2. Weighbridge
                                    </button>
                                </Link>
                                <Link href="/vehicle-inspection" className="block">
                                    <button className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white text-gray-800 rounded-lg font-medium text-sm transition-colors text-left">
                                        3. Vehicle Inspection
                                    </button>
                                </Link>
                            </div>
                            <Link href="/stores/transfer" className="block mt-3">
                                <button className="w-full flex items-center justify-center px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200">
                                    Sub-Inventory Transfer
                                </button>
                            </Link>
                        </div>
                    </motion.div>

                    {/* 3. Stores & FG */}
                    <motion.div variants={itemVariants} className="flex">
                        <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300 flex flex-col group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-gray-100 rounded-xl group-hover:bg-gray-200 transition-colors">
                                    <Package className="h-5 w-5 text-gray-800" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Warehouse & FG</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-8 flex-grow">GRN processing, live inventory tracking, and finished goods fulfillment.</p>
                            
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/stores/grn-create">
                                        <button className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                                            Create GRN
                                        </button>
                                    </Link>
                                    <Link href="/fg/create">
                                        <button className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                                            FG Batch
                                        </button>
                                    </Link>
                                </div>
                                <Link href="/dispatch/create" className="block">
                                    <button className="w-full group/btn flex items-center justify-between px-4 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all duration-200 shadow-sm">
                                        Dispatch Order
                                        <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                                    </button>
                                </Link>
                                <Link href="/stores/inventory" className="block">
                                    <button className="w-full px-4 py-3 bg-gray-100 text-gray-800 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200">
                                        View Live Inventory
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                    {/* 4. Quality & Maintenance */}
                    <motion.div variants={itemVariants} className="flex">
                        <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300 flex flex-col group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-gray-100 rounded-xl group-hover:bg-gray-200 transition-colors">
                                    <ClipboardCheck className="h-5 w-5 text-gray-800" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Compliance & QA</h2>
                            </div>
                            
                            <div className="space-y-3 mt-auto">
                                <Link href="/qa" className="block">
                                    <button className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-all duration-200">
                                        QA Inspection
                                        <ChevronRight className="h-4 w-4 text-gray-400" />
                                    </button>
                                </Link>
                                <Link href="/stores/audit" className="block">
                                    <button className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-all duration-200">
                                        Inventory Audit
                                        <ChevronRight className="h-4 w-4 text-gray-400" />
                                    </button>
                                </Link>
                                <div className="pt-2">
                                    <Link href="/maintenance/downtime" className="block">
                                        <button className="w-full flex items-center justify-center px-4 py-3 bg-red-50 text-red-700 rounded-xl font-semibold hover:bg-red-100 transition-colors duration-200">
                                            Raise Downtime Ticket
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* 5. System Configuration */}
                    <motion.div variants={itemVariants} className="flex">
                        <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300 flex flex-col group">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-gray-100 rounded-xl group-hover:bg-gray-200 transition-colors">
                                    <Cog className="h-5 w-5 text-gray-800" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">System Config</h2>
                            </div>
                            
                            <div className="space-y-3 mt-auto">
                                <div className="grid grid-cols-3 gap-3">
                                    <Link href="/masters/machines">
                                        <button className="w-full flex flex-col items-center justify-center gap-2 px-4 py-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-all duration-200">
                                            <Database className="h-5 w-5 text-gray-600" />
                                            <span className="text-sm">Machines</span>
                                        </button>
                                    </Link>
                                    <Link href="/masters/materials">
                                        <button className="w-full flex flex-col items-center justify-center gap-2 px-4 py-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-all duration-200">
                                            <Package className="h-5 w-5 text-gray-600" />
                                            <span className="text-sm">Materials</span>
                                        </button>
                                    </Link>
                                    <Link href="/masters/vendors">
                                        <button className="w-full flex flex-col items-center justify-center gap-2 px-4 py-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-all duration-200">
                                            <Truck className="h-5 w-5 text-gray-600" />
                                            <span className="text-sm">Vendors</span>
                                        </button>
                                    </Link>
                                </div>
                                <Link href="/recipes" className="block pt-2">
                                    <button className="w-full px-4 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all duration-200 shadow-sm">
                                        Recipe Manager
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                </motion.div>

                <PowerBIEmbedCard />

                {/* Optional subtle footer / status */}
                <div className="mt-16 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
                    <span>© 2025 NarayanaMES — All systems operational • Real‑time data sync active</span>
                </div>
            </main>
        </div>
    )
}