'use client'

import FGBatchPage from '../../production/fg-batch/page'

// Keep legacy route working by reusing the maintained FG batch implementation.
export default function LegacyFGBatchCreatePage() {
    return <FGBatchPage />
}
