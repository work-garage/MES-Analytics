'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Flame } from 'lucide-react'

export default function BakingPage() {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const form = useForm()

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            const { error } = await supabase.rpc('rpc_log_baking', {
                p_machine_id: 'OVEN-01',
                p_gauge_setting: Number(values.gauge),
                p_moisture_pct: Number(values.moisture),
                p_sample_weight: Number(values.weight),
                p_color_rating: values.color,
                p_taste_check: values.taste,
                p_result: values.result,
                p_user_id: (await supabase.auth.getUser()).data.user?.id
            })
            if (error) throw error
            toast.success("Baking Log Saved")
            form.reset()
        } catch (e: any) {
            toast.error("Error", { description: e.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto py-6">
            <Card className="border-orange-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                        <Flame className="h-5 w-5" />
                        Baking Station Log
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Oven ID</Label>
                            <Input defaultValue="OVEN-01" disabled />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Gauge Setting</Label>
                                <Input type="number" step="0.1" {...form.register('gauge')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Moisture Content (%)</Label>
                                <Input type="number" step="0.1" {...form.register('moisture')} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Sample Stack Weight (g)</Label>
                            <Input type="number" step="0.1" {...form.register('weight')} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Color Rating</Label>
                                <Select onValueChange={v => form.setValue('color', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LIGHT">Light</SelectItem>
                                        <SelectItem value="STANDARD">Standard</SelectItem>
                                        <SelectItem value="DARK">Dark</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Taste Check</Label>
                                <Select onValueChange={v => form.setValue('taste', v)}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OK">Crisp / OK</SelectItem>
                                        <SelectItem value="SOFT">Soft / Abnormal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Overall Result</Label>
                            <Select onValueChange={v => form.setValue('result', v)} defaultValue="OK">
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="OK">OK</SelectItem>
                                    <SelectItem value="HOLD">HOLD (Rework)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Log Baking Check"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
