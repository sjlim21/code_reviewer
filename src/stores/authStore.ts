import { create } from 'zustand'
import type { Session, Subscription } from '@supabase/supabase-js'
import type { Profile } from '../supabase'
import { getSupabaseClient } from '../supabase'

interface AuthState {
  session: Session | null
  isDemoSession: boolean
  isLoadingSession: boolean
  userProfile: Profile | null
  setSession: (session: Session | null) => void
  setDemoSession: (value: boolean) => void
  setLoadingSession: (value: boolean) => void
  setUserProfile: (profile: Profile | null) => void
  signOut: () => void
  initAuth: () => { data: { subscription: Pick<Subscription, 'unsubscribe'> } }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isDemoSession: false,
  isLoadingSession: true,
  userProfile: null,
  setSession: (session) => set({ session }),
  setDemoSession: (isDemoSession) => set({ isDemoSession }),
  setLoadingSession: (isLoadingSession) => set({ isLoadingSession }),
  setUserProfile: (userProfile) => set({ userProfile }),
  signOut: () => set({ session: null, isDemoSession: false, userProfile: null }),
  initAuth: () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      set({ isLoadingSession: false })
      // Return a dummy subscription object
      return { data: { subscription: { unsubscribe: () => {} } } }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      useAuthStore.getState().setSession(session)
      set({ isLoadingSession: false })

      if (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    })

    return supabase.auth.onAuthStateChange((event, currentSession) => {
      // Sync on all relevant auth events including token refresh
      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        useAuthStore.getState().setSession(currentSession)
      }
      if (currentSession) {
        useAuthStore.getState().setDemoSession(false)
      }
    })
  },
}))
