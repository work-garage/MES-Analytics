'use client'

import OvenPage from '../oven/page'

// Keep legacy route working by reusing the maintained oven implementation.
export default function BakingPage() {
    return <OvenPage />
}
