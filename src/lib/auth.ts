import { supabase } from '@/lib/supabaseClient'

export function slugifyUsername(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function isUsernameTaken(username: string) {
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export async function signUp(params: {
  email: string
  password: string
  username: string
  display_name: string
}) {
  // DB trigger: on auth.users INSERT => handle_new_user()
  // Trigger reads raw_user_meta_data: { username, display_name }
  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { username: params.username, display_name: params.display_name } },
  })
}
