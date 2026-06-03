import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../supabase'

interface AuthState {
  session: Session | null
  isDemoSession: boolean
  userProfile: Profile | null
  setSession: (session: Session | null) => void
  setDemoSession: (value: boolean) => void
  setUserProfile: (profile: Profile | null) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isDemoSession: false,
  userProfile: null,
  setSession: (session) => set({ session }),
  setDemoSession: (isDemoSession) => set({ isDemoSession }),
  setUserProfile: (userProfile) => set({ userProfile }),
  signOut: () => set({ session: null, isDemoSession: false, userProfile: null }),
}))
