import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    setLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          // Fetch the user profile after sign-in
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', session?.user?.id)
            .single();

          if (data) {
            setUser(data);
          } else {
            // Optionally insert the user if it doesn't exist
            const { error } = await supabase
              .from('users')
              .insert([
                { id: session?.user?.id, username: 'default', email: session?.user?.email },
              ]);

            if (!error) {
              refreshUser();
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    // Cleanup the listener when the component unmounts
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}