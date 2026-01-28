import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export type UserRole =
    | 'gate'
    | 'weighbridge'
    | 'qa'
    | 'stores'
    | 'stores_manager'
    | 'planner'
    | 'operator'
    | 'supervisor'
    | 'maintenance'
    | 'fg_incharge'
    | 'dispatch'
    | 'auditor'
    | 'admin'

interface UserProfile {
    id: string
    email: string | null
    full_name: string | null
    role: UserRole
    plant_id: string | null
}

interface AuthState {
    user: User | null
    profile: UserProfile | null
    isLoading: boolean
    checkSession: () => Promise<void>
    signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
    user: null,
    profile: null,
    isLoading: true,
    checkSession: async () => {
        try {
            set({ isLoading: true })
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                set({ user: null, profile: null, isLoading: false })
                return
            }

            // Fetch Profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', session.user.id)
                .single()

            if (profile) {
                set({ user: session.user, profile: profile as UserProfile, isLoading: false })
            } else {
                // Fallback if profile missing (should not happen in prod)
                set({ user: session.user, profile: null, isLoading: false })
            }

        } catch (error) {
            console.error('Auth Check Failed', error)
            set({ user: null, profile: null, isLoading: false })
        }
    },
    signOut: async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        set({ user: null, profile: null })
    }
}))
