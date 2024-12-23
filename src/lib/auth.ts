import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error };
  return { data };
}

export async function signUp(email: string, password: string, username: string) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      }
    }
  });

  if (authError) {
    return { error: authError };
  }

  // TODO - Use auth schema instead of public
  
  // Check if email confirmation is required
  if (authData.user?.email_confirmed_at) {
    // Email is already confirmed; insert into `users` table
    const { id } = authData.user;

    const { error: profileError } = await supabase
      .from('users')
      .insert([{ id, username, email }]);

    if (profileError) {
      return { error: profileError };
    }
  } else {
    // Notify the user to check their email for the magic link
    return { message: 'Please confirm your email before continuing.' };
  }

  return { data: authData };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return { error };
  return { success: true };
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

export async function updateUser(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.updateUser({
    email,
    password,
  data: {
    username,
  }
  });

  if (error) return { error };
  return { data }
};
