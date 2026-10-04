import { createClient } from '@supabase/supabase-js';
import { getRequiredEnv } from './env.js';

const supabaseUrl = getRequiredEnv('SUPABASE_URL');
const supabaseSecretKey = getRequiredEnv('SUPABASE_SECRET_KEY');

export const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);