'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithPassword({
                email,
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
            console.log("Attempting Sign Up with:", email)
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            })
            if (error) {
                console.error("Sign Up Error Details:", error)
                toast.error('Sign Up Failed', { description: error.message })
            } else {
                console.log("Sign Up Response:", data)
                if (data.user && !data.session) {
                    toast.success('Sign Up Successful!', { description: "Please check your email to confirm your account." })
                } else {
                    toast.success('Sign Up Successful! You can now login.')
                }
            }
        } catch (err) {
            console.error("Sign Up Exception:", err)
            toast.error('Error during Sign Up')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold">Login to MES</CardTitle>
                    <CardDescription>Enter your email and password to access the system</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="operator@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                        <Button className="w-full" type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sign In
                        </Button>
                        <Button
                            className="w-full"
                            variant="outline"
                            type="button"
                            onClick={handleSignUp}
                            disabled={isLoading}
                        >
                            Create Account (Sign Up)
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
