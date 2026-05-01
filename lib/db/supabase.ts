import 'server-only'

import { createClient } from '@supabase/supabase-js'

const supabase_url =
  process.env.NEXT_PUBLIC_SUPABASE_URL

const supabase_service_role_key =
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabase_url) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is not defined',
  )
}

if (!supabase_service_role_key) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not defined',
  )
}

export const supabase = createClient(
  supabase_url,
  supabase_service_role_key,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)