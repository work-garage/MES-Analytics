'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChefHat, Plus, Search, FlaskConical, Tag } from 'lucide-react'

export default function RecipeDashboardPage() {
    const supabase = createClient()
    const router = useRouter()
    const [search, setSearch] = useState('')

    const { data: recipes, isLoading } = useQuery({
        queryKey: ['recipe_templates_all'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('recipe_templates')
                .select(`
                    id, name, sku, version, is_active, created_at,
                    recipe_items (
                        id, qty_per_batch, tolerance_pct,
                        materials ( name, material_code )
                    )
                `)
                .order('created_at', { ascending: false })
            if (error) throw error
            return data || []
        }
    })

    const filtered = recipes?.filter((r: any) => {
        const q = search.toLowerCase()
        return (
            r.name?.toLowerCase().includes(q) ||
            r.sku?.toLowerCase().includes(q) ||
            r.version?.toLowerCase().includes(q)
        )
    }) ?? []

    return (
        <div className="max-w-6xl mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ChefHat className="h-6 w-6 text-indigo-600" />
                        Recipe Manager
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">All recipe templates — view, manage and create production recipes.</p>
                </div>
                <Button onClick={() => router.push('/recipes/new')} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> New Recipe
                </Button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="bg-indigo-50 border-indigo-200">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-xs text-indigo-600 font-medium">Total Recipes</div>
                        <div className="text-3xl font-bold text-indigo-800">{recipes?.length ?? '...'}</div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-xs text-green-600 font-medium">Active</div>
                        <div className="text-3xl font-bold text-green-800">
                            {recipes?.filter((r: any) => r.is_active).length ?? '...'}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-xs text-slate-600 font-medium">Unique SKUs</div>
                        <div className="text-3xl font-bold text-slate-800">
                            {recipes ? new Set(recipes.map((r: any) => r.sku)).size : '...'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search + Grid */}
            <div className="space-y-4">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search recipes, SKU, version..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="animate-pulse">
                                <CardContent className="pt-4 h-40 bg-slate-100 rounded" />
                            </Card>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No recipes found</p>
                        <p className="text-sm">Try adjusting your search or create a new recipe.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((recipe: any) => (
                            <Card key={recipe.id} className="hover:shadow-md transition-shadow border-slate-200 cursor-pointer"
                                onClick={() => router.push(`/recipes/${recipe.id}`)}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="text-base">{recipe.name}</CardTitle>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <Tag className="h-3 w-3 text-slate-400" />
                                                <span className="text-xs text-slate-500">{recipe.sku}</span>
                                                <Badge variant="outline" className="text-xs">{recipe.version}</Badge>
                                            </div>
                                        </div>
                                        <Badge className={recipe.is_active ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}>
                                            {recipe.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                            <FlaskConical className="h-3 w-3" /> Ingredients ({recipe.recipe_items?.length ?? 0})
                                        </p>
                                        <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1">
                                            {recipe.recipe_items?.map((item: any) => (
                                                <div key={item.id} className="flex justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">
                                                    <span className="font-medium">{item.materials?.name ?? 'Unknown'}</span>
                                                    <span className="text-slate-500">
                                                        {item.qty_per_batch} kg
                                                        <span className="ml-1 text-orange-500">±{item.tolerance_pct}%</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-3 text-xs text-slate-400">
                                        Created {new Date(recipe.created_at).toLocaleDateString()}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
