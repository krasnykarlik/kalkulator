import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true // Tohle je to kouzlo, které řeší ten problém s #
  }
});

export const signInWithGoogle = () => {
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://krasnykarlik.github.io/kalkulator/' // Vynucujeme správný návrat
    }
  });
};

export const logout = () => supabase.auth.signOut();
