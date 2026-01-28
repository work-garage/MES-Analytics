import Dexie, { Table } from 'dexie'

export type OfflineRequestStatus = 'PENDING' | 'SYNCING' | 'FAILED'

export interface OfflineRequest {
    id?: number
    type: string // 'CREATE_GRN', 'SUB_BATCH', 'LOG_PRODUCTION'
    url: string // RPC Name or Endpoint
    payload: any // JSON
    blobs?: { key: string; data: Blob; type: string }[] // Attachments to upload first
    created_at: string
    retry_count: number
    status: OfflineRequestStatus
    error_message?: string
}

export class MESDatabase extends Dexie {
    offlineQueue!: Table<OfflineRequest, number>

    constructor() {
        super('MESDatabase')
        this.version(1).stores({
            offlineQueue: '++id, type, status, created_at'
        })
    }
}

export const db = new MESDatabase()
