'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Factory, ShieldCheck, ArrowRight, Activity } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // BUSINESS LOGIC REMAINS UNCHANGED
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password
            })

            if (error) {
                if (error.message === 'Email not confirmed') {
                    toast.error('Login Failed', { description: 'Please check your email to confirm your account.' })
                } else {
                    toast.error('Login Failed', { description: error.message })
                }
            } else {
                toast.success('Login Successful')
                router.refresh()
                router.push('/dashboard')
            }
        } catch (err) {
            toast.error('An unexpected error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSignUp = async () => {
        setIsLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password
            })
            if (error) {
                toast.error('Sign Up Failed', { description: error.message })
            } else {
                if (data.user && !data.session) {
                    toast.success('Sign Up Successful!', { description: "Please check your email to confirm your account." })
                } else {
                    toast.success('Sign Up Successful! You can now login.')
                }
            }
        } catch (err) {
            toast.error('Error during Sign Up')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen w-full bg-background font-sans">
            {/* LEFT PANEL: Branding & Context (Hidden on Mobile) */}
            <div className="hidden lg:flex w-1/2 bg-zinc-950 flex-col justify-between p-12 relative overflow-hidden">
                {/* Architectural Grid Background for Industrial Feel */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:32px_32px]"></div>
                
                {/* Glowing subtle gradient orb */}
                <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-blue-500/20 to-transparent blur-3xl rounded-full translate-y-[-50%]"></div>

                <div className="relative z-10 flex items-center gap-3 text-white">
                    <div className="p-2 bg-blue-600 rounded-lg shadow-inner">
                        <Factory className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-bold text-2xl tracking-tight">Nexus<span className="text-blue-500">MES</span></span>
                </div>

                <div className="relative z-10 space-y-8 max-w-lg">
                    <h1 className="text-5xl font-bold tracking-tight text-white leading-[1.1]">
                        Smart Manufacturing <br />
                        <span className="text-zinc-400">Starts Here.</span>
                    </h1>
                    <p className="text-lg text-zinc-400 leading-relaxed">
                        Replace manual registers with a real-time, data-driven system. Gain complete visibility over inventory, production batches, and OEE across all your lines.
                    </p>
                    
                    <div className="flex flex-col gap-4 pt-4">
                        <div className="flex items-center gap-3 text-sm font-medium text-zinc-300">
                            <Activity className="h-5 w-5 text-blue-500" />
                            <span>Real-time Machine Monitoring & RPM Analytics</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm font-medium text-zinc-300">
                            <ShieldCheck className="h-5 w-5 text-emerald-500" />
                            <span>Enterprise-grade QC & Full Traceability</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-sm text-zinc-500 font-medium">
                    © {new Date().getFullYear()} Nexus Enterprise Software. All rights reserved.
                </div>
            </div>

            {/* RIGHT PANEL: Authentication Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 border-l border-border bg-card">
                <div className="w-full max-w-[420px] space-y-8">
                    {/* Mobile Logo */}
                    <div className="flex lg:hidden items-center gap-2 mb-8">
                        <div className="p-1.5 bg-blue-600 rounded-md">
                            <Factory className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-bold text-xl tracking-tight">NexusMES</span>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
                        <p className="text-muted-foreground text-sm">
                            Enter your credentials to access your workspace.
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-medium">
                                    Work Email
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="operator@factory.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-11 transition-all focus-visible:ring-blue-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-medium">
                                        Password
                                    </Label>
                                    {/* Placeholder for future forgot password logic */}
                                    <a href="#" className="text-xs font-medium text-blue-600 hover:text-blue-500 hover:underline">
                                        Forgot password?
                                    </a>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="h-11 transition-all focus-visible:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-2">
                            <Button 
                                type="submit" 
                                disabled={isLoading} 
                                className="w-full h-11 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition-all font-medium text-sm flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>Sign In <ArrowRight className="h-4 w-4" /></>
                                )}
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-card px-2 text-muted-foreground font-medium">
                                        New to the platform?
                                    </span>
                                </div>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleSignUp}
                                disabled={isLoading}
                                className="w-full h-11 border-border hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all font-medium"
                            >
                                Request Access 
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}