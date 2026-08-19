import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co"
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmprZXpvd2Rod25zeXNnemd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMjAyODIsImV4cCI6MjEwMjU5NjI4Mn0.AQ1gQ5v4WQuqRxc1r4YT2iZvAeyWsL_giXw48QbVtOQ"

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    experimental: {
      passkey: true
    }
  }
})
