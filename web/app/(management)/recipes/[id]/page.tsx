'use client'

import { useParams } from 'next/navigation'
import RecipeEditor from '../_components/RecipeEditor'

export default function RecipeByIdPage() {
    const params = useParams<{ id: string }>()
    return <RecipeEditor recipeId={params.id} />
}
