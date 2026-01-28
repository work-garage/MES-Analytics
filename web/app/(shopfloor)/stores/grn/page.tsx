'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Printer, Package } from 'lucide-react'

export default function GradeCreationPage() {
    const router = useRouter()
    const [grnCode, setGrnCode] = useState<string | null>(null)
    const { register, handleSubmit } = useForm()

    const onSubmit = async (values: any) => {
        // Mock RPC call for GRN Creation
        // In real implementation, this would aggregate data from Gate/Weighbridge/QA
        const fakeGrnNo = `GRN-${new Date().getFullYear()}${Math.floor(Math.random() * 10000)}`
        setGrnCode(fakeGrnNo)
        toast.success(`GRN Created: ${fakeGrnNo}`)
    }

    const printBarcode = () => {
        if (!grnCode) return
        // Create a hidden iframe or new window for printing
        const printWindow = window.open('', '', 'width=600,height=400')
        printWindow?.document.write(`
        <html>
          <head><title>Pallet Label</title></head>
          <body style="font-family: monospace; text-align: center; padding: 20px;">
            <div style="border: 2px solid black; padding: 20px; display: inline-block;">
                <h1 style="margin: 0; font-size: 24px;">${grnCode}</h1>
                <p>Material: Wheat Flour</p>
                <p>Expiry: 2026-05-20</p>
                <div style="margin-top: 10px; background: #eee; height: 50px;">
                    [ BARCODE PLACEHOLDER ]
                </div>
            </div>
          </body>
        </html>
      `)
        printWindow?.document.close()
        printWindow?.print()
    }

    return (
        <div className="max-w-3xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>GRN Creation</span>
                        {grnCode && <span className="text-green-600 font-mono text-lg">{grnCode}</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!grnCode ? (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vehicle No</Label>
                                    <Input defaultValue="MH-12-AB-1234" disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label>Net Weight (kg)</Label>
                                    <Input defaultValue="5000" disabled />
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 rounded border border-blue-100 mb-4">
                                <h4 className="text-sm font-semibold text-blue-800 mb-2">FEFO Analysis</h4>
                                <div className="text-xs text-blue-600">
                                    This material has <strong>120 days</strong> remaining shelf life.
                                    <br />
                                    Relative to existing stock: <strong>Freshest</strong> (Last In)
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Storage Location / Bin ID</Label>
                                <Input {...register('storage_loc')} placeholder="Scan Bin Barcode" />
                            </div>

                            <Button type="submit" className="w-full">Generate GRN</Button>
                        </form>
                    ) : (
                        <div className="text-center py-8 space-y-4">
                            <div className="inline-block p-4 bg-slate-100 rounded-full">
                                <Package className="h-12 w-12 text-slate-600" />
                            </div>
                            <h3 className="text-xl font-bold">Inward Complete</h3>
                            <p className="text-slate-500">GRN {grnCode} has been created and inventory updated.</p>
                            <Button onClick={printBarcode} variant="outline" size="lg" className="w-full max-w-xs">
                                <Printer className="mr-2 h-4 w-4" /> Print Pallet Label
                            </Button>
                            <Button onClick={() => router.push('/dashboard')} variant="ghost" className="block w-full text-slate-400">
                                Back to Dashboard
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
