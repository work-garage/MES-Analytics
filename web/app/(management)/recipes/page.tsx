'use client'

import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

export default function RecipeBuilderPage() {
    const supabase = createClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Fetch Materials
    const { data: materials } = useQuery({
        queryKey: ['materials'],
        queryFn: async () => {
            const { data } = await supabase.from('materials').select('id, name, code').eq('category', 'RAW')
            return data || []
        }
    })

    const form = useForm({
        defaultValues: {
            name: '',
            sku: '',
            version: 'v1',
            items: [{ material_id: '', qty: 0, tolerance: 2 }]
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    })

    const onSubmit = async (values: any) => {
        setIsSubmitting(true)
        try {
            // 1. Create Template
            const { data: template, error: tmplError } = await supabase
                .from('recipe_templates')
                .insert({
                    name: values.name,
                    sku: values.sku,
                    version: values.version,
                    is_active: true
                })
                .select()
                .single()

            if (tmplError) throw tmplError

            // 2. Create Items
            const items = values.items.map((item: any) => ({
                template_id: template.id,
                material_id: item.material_id,
                qty_per_batch: Number(item.qty),
                tolerance_pct: Number(item.tolerance)
            }))

            const { error: itemsError } = await supabase.from('recipe_items').insert(items)
            if (itemsError) throw itemsError

            toast.success("Recipe Template Saved")
            form.reset()

        } catch (error: any) {
            toast.error("Failed to Save Recipe", { description: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto py-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Recipe Template</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Template Name</Label>
                                <Input {...form.register('name')} placeholder="e.g. Marie Gold Dough" />
                            </div>
                            <div className="space-y-2">
                                <Label>Target SKU</Label>
                                <Input {...form.register('sku')} placeholder="e.g. MARIE-500G" />
                            </div>
                            <div className="space-y-2">
                                <Label>Version</Label>
                                <Input {...form.register('version')} />
                            </div>
                        </div>

                        <div className="space-y-4 border p-4 rounded bg-slate-50">
                            <div className="flex justify-between items-center">
                                <h4 className="font-semibold text-sm">Ingredients</h4>
                                <Button type="button" size="sm" variant="outline" onClick={() => append({ material_id: '', qty: 0, tolerance: 2 })}>
                                    <Plus className="h-4 w-4 mr-1" /> Add Item
                                </Button>
                            </div>

                            {fields.map((field, index) => (
                                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-5 space-y-1">
                                        <Label className="text-xs">Material</Label>
                                        <Controller
                                            control={form.control}
                                            name={`items.${index}.material_id`}
                                            render={({ field }: { field: any }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Material" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {materials?.map((m: any) => (
                                                            <SelectItem key={m.id} value={m.id}>
                                                                {m.name} {m.code ? `(${m.code})` : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="col-span-3 space-y-1">
                                        <Label className="text-xs">Qty (kg)</Label>
                                        <Input type="number" step="0.001" {...form.register(`items.${index}.qty` as const)} />
                                    </div>
                                    <div className="col-span-3 space-y-1">
                                        <Label className="text-xs">Tolerance %</Label>
                                        <Input type="number" step="0.1" {...form.register(`items.${index}.tolerance` as const)} />
                                    </div>
                                    <div className="col-span-1">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "Save Template"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
