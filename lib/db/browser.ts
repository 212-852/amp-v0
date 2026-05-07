'use client'

import { createClient } from '@supabase/supabase-js'

export function create_browser_supabase() {
  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabase_anon_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabase_url || !supabase_anon_key) {
    return null
  }

  return createClient(supabase_url, supabase_anon_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
