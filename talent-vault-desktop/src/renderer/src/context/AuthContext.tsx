import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

// 1. Define the shape of your database profile
interface UserProfile {
  id: string;
  company_id: string | null;
  role: string;
  created_at: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;
  signOut: () => Promise<void>;
  fetchUserProfile: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  session: null, 
  user: null, 
  userProfile: null,
  signOut: async () => {},
  fetchUserProfile: async () => {}
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 🚀 THE FIX: Use a ref to track the currently loaded user.
  // Refs don't trigger re-renders and avoid "stale closure" bugs inside useEffects.
  const fetchedUserId = useRef<string | null>(null);

  // 🚀 The bridge between Authentication and your Database
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user profile:", error);
      } else {
        setUserProfile(data);
        fetchedUserId.current = userId; // Mark this user's profile as successfully loaded
      }
    } catch (err) {
      console.error("Profile fetch failed:", err);
    } finally {
      // 🚀 Unblock the app ONLY after we know who they are in the database
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Get current session on load
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      
      if (initialSession?.user) {
        fetchUserProfile(initialSession.user.id);
      } else {
        setLoading(false); // No user found, stop loading immediately
      }
    });

    // 2. Listen for login/logout/refresh events automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted) return;

      // ALWAYS update the session state for background TOKEN_REFRESH events
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (event === 'SIGNED_IN' && currentSession?.user) {
        // 🚀 THE FIX: Only trigger the loading screen if we HAVEN'T already fetched this user
        // This prevents the screen from flashing when switching apps/tabs!
        if (fetchedUserId.current !== currentSession.user.id) {
          setLoading(true);
          fetchUserProfile(currentSession.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        fetchedUserId.current = null; // Reset on logout
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); 

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setUserProfile(null);
    fetchedUserId.current = null;
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <p className="text-slate-500 font-medium text-sm animate-pulse">Authenticating Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, user, userProfile, signOut, fetchUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);