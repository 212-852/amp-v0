'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

const browser_supabase_client_ids = new WeakMap<SupabaseClient, string>()
let browser_supabase_seq = 0

export function get_browser_supabase_client_instance_id(
  client: SupabaseClient,
): string | null {
  return browser_supabase_client_ids.get(client) ?? null
}

export function create_browser_supabase() {
  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabase_anon_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabase_url || !supabase_anon_key) {
    return null
  }

  const client = createClient(supabase_url, supabase_anon_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  browser_supabase_seq += 1
  browser_supabase_client_ids.set(
    client,
    `browser_supabase_${browser_supabase_seq}_${Date.now()}`,
  )

  return client
}
