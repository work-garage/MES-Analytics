'use client'

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BarChart3, Expand, Minimize } from "lucide-react"

const POWER_BI_EMBED_URL =
    "https://app.powerbi.com/reportEmbed?reportId=e507148f-bc28-4b8d-8905-5992aee18fae&autoAuth=true&ctid=0ed51ad7-52cc-4234-b54a-76b82d40b5c3"

export function PowerBIEmbedCard() {
    const [isLoading, setIsLoading] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const embedContainerRef = useRef<HTMLDivElement | null>(null)

    const embedUrl = useMemo(() => {
        const url = new URL(POWER_BI_EMBED_URL)
        url.searchParams.set("navContentPaneEnabled", "false")
        url.searchParams.set("filterPaneEnabled", "false")
        url.searchParams.set("chromeless", "1")
        return url.toString()
    }, [])

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === embedContainerRef.current)
        }

        document.addEventListener("fullscreenchange", onFullscreenChange)
        return () => {
            document.removeEventListener("fullscreenchange", onFullscreenChange)
        }
    }, [])

    const toggleFullscreen = async () => {
        if (!embedContainerRef.current) return

        try {
            if (document.fullscreenElement === embedContainerRef.current) {
                await document.exitFullscreen()
                return
            }

            await embedContainerRef.current.requestFullscreen()
        } catch {
            setIsFullscreen(false)
        }
    }

    return (
        <section className="mt-12 w-full">
            <div className="mx-auto mb-6 max-w-3xl text-center">
                <h2 className="text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
                    Advanced Analytics Dashboard
                </h2>
                <p className="mt-2 text-sm text-slate-400 md:text-base">
                    Real-time insights powered by Power BI
                </p>
            </div>

            <motion.div
                ref={embedContainerRef}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="group relative w-full overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 p-4 shadow-[0_12px_34px_rgba(2,6,23,0.5)] transition-all duration-500 hover:border-sky-500/40 hover:shadow-[0_18px_46px_rgba(56,189,248,0.18)] sm:p-5 lg:p-6"
                style={{ backgroundColor: "#0f172a" }}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_-12%,rgba(14,165,233,0.14),transparent_48%)]" />

                <div className="relative z-10 mb-4 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300">
                        <BarChart3 className="h-3.5 w-3.5 text-sky-300" />
                        Live BI Surface
                    </div>

                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition-all duration-200 hover:border-sky-400/60 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                        aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
                    >
                        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                        <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
                    </button>
                </div>

                <div
                    className="relative z-10 w-full overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950"
                    style={{ paddingTop: "56.25%" }}
                >
                    <iframe
                        title="Advanced Analytics Dashboard"
                        src={embedUrl}
                        loading="lazy"
                        allowFullScreen
                        className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-700 ${
                            isLoading ? "opacity-0" : "opacity-100"
                        }`}
                        onLoad={() => setIsLoading(false)}
                    />

                    <AnimatePresence>
                        {isLoading ? (
                            <motion.div
                                initial={{ opacity: 1 }}
                                exit={{ opacity: 0, transition: { duration: 0.35, ease: "easeOut" } }}
                                className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/95"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1.15, ease: "linear" }}
                                    className="h-9 w-9 rounded-full border-2 border-slate-600 border-t-sky-400"
                                />
                                <div className="w-[68%] space-y-2">
                                    <div className="h-2.5 animate-pulse rounded-full bg-slate-700/80" />
                                    <div className="h-2.5 animate-pulse rounded-full bg-slate-800" />
                                    <div className="h-2.5 animate-pulse rounded-full bg-slate-800" />
                                </div>
                                <p className="text-xs font-medium tracking-wide text-slate-400">
                                    Loading analytics workspace...
                                </p>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </motion.div>
        </section>
    )
}
