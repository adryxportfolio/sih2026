import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { DEMO_USER } from "../lib/demo";
import { heartbeat, type Activity } from "../lib/api";
import { AppState } from "react-native";

const DEMO_KEY = "samiksha.demoMode";
const DEMO_ROLE_KEY = "samiksha.demoRole";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  designation: string | null;
  organization_id: string | null;
  job_role_id: string | null;
  role: string;
  daily_goal_minutes: number;
  desired_retention: number;
  preferred_language: string;
  xp: number;
  streak_current: number;
  streak_longest: number;
  onboarded_at: string | null;
  years_of_service: number | null;
}

interface SessionContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Demo mode renders the full journey from local data with no network. */
  isDemo: boolean;
  /** Demo, but as an administrator — routes to the admin app. */
  isDemoAdmin: boolean;
  isAuthed: boolean;
  isAdmin: boolean;
  needsOnboarding: boolean;
  /** Tell the presence system what the officer is doing right now. */
  setActivity: (activity: Activity, entity?: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  enterDemo: (asAdmin?: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({} as SessionContextValue);

const DEMO_PROFILE: Profile = {
  id: DEMO_USER.id,
  full_name: DEMO_USER.full_name,
  email: DEMO_USER.email,
  designation: DEMO_USER.designation,
  organization_id: null,
  job_role_id: "demo-role",
  role: "learner",
  daily_goal_minutes: DEMO_USER.daily_goal_minutes,
  desired_retention: DEMO_USER.desired_retention,
  preferred_language: DEMO_USER.preferred_language,
  xp: DEMO_USER.xp,
  streak_current: DEMO_USER.streak_current,
  streak_longest: DEMO_USER.streak_longest,
  onboarded_at: new Date().toISOString(),
  years_of_service: DEMO_USER.years_of_service,
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);
  const activityRef = useRef<{ activity: Activity; entity: string | null }>({
    activity: "browsing", entity: null,
  });

  // Supabase fires INITIAL_SESSION with a null session on mount. Without this
  // guard that event resets the demo profile the moment we set it.
  const demoRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", userId).single();
    if (error) {
      console.warn("[session] profile load failed:", error.message);
      return null;
    }
    return data as Profile;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const demoFlag = await AsyncStorage.getItem(DEMO_KEY);
      if (demoFlag === "1") {
        const demoRole = await AsyncStorage.getItem(DEMO_ROLE_KEY);
        demoRef.current = true;
        if (!cancelled) {
          setIsDemo(true);
          setIsDemoAdmin(demoRole === "admin");
          setProfile(demoRole === "admin"
            ? { ...DEMO_PROFILE, full_name: "System Administrator",
                designation: "Platform Administrator", role: "admin" }
            : DEMO_PROFILE);
          setLoading(false);
        }
        return;
      }

      if (!isSupabaseConfigured) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      setSession(data.session);
      if (data.session?.user) {
        const p = await loadProfile(data.session.user.id);
        if (!cancelled) setProfile(p);
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (demoRef.current) return;   // demo session is not managed by Supabase
      setSession(s);
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    if (error) return { error: error.message };
    // Stamp the login so the admin roster can show who has actually used the
    // credentials they were issued.
    if (data.user) {
      supabase.from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", data.user.id)
        .then(undefined, () => {});
    }
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([DEMO_KEY, DEMO_ROLE_KEY]);
    demoRef.current = false;
    setIsDemo(false);
    setIsDemoAdmin(false);
    setProfile(null);
    setSession(null);
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }, []);

  const enterDemo = useCallback(async (asAdmin = false) => {
    await AsyncStorage.setItem(DEMO_KEY, "1");
    await AsyncStorage.setItem(DEMO_ROLE_KEY, asAdmin ? "admin" : "learner");
    demoRef.current = true;
    setIsDemo(true);
    setIsDemoAdmin(asAdmin);
    setProfile(asAdmin
      ? { ...DEMO_PROFILE, full_name: "System Administrator",
          designation: "Platform Administrator", role: "admin" }
      : DEMO_PROFILE);
    setLoading(false);
  }, []);

  // ── Presence heartbeat ────────────────────────────────────────────────────
  // Every 45s while the app is foregrounded, and immediately on foreground so
  // an admin watching the live board sees someone come back without waiting
  // out the interval. Paused in the background: a phone in a pocket is not an
  // officer studying, and reporting it as such would make the admin metrics
  // meaningless.
  const setActivity = useCallback((activity: Activity, entity: string | null = null) => {
    activityRef.current = { activity, entity };
    if (!isDemo && session?.user) heartbeat(activity, entity);
  }, [isDemo, session]);

  useEffect(() => {
    if (isDemo || !session?.user) return;

    const beat = () => {
      const { activity, entity } = activityRef.current;
      heartbeat(activity, entity);
    };

    beat();
    const id = setInterval(beat, 45_000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") beat();
    });

    return () => { clearInterval(id); sub.remove(); };
  }, [isDemo, session]);

  const refreshProfile = useCallback(async () => {
    if (isDemo || !session?.user) return;
    const p = await loadProfile(session.user.id);
    setProfile(p);
  }, [isDemo, session, loadProfile]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (isDemo) { setProfile((prev) => (prev ? { ...prev, ...patch } : prev)); return; }
    if (!session?.user) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", session.user.id);
    if (error) { console.warn("[session] profile update failed:", error.message); return; }
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, [isDemo, session]);

  const value = useMemo<SessionContextValue>(() => ({
    loading,
    session,
    user: session?.user ?? null,
    profile,
    isDemo,
    isDemoAdmin,
    isAuthed: isDemo || !!session?.user,
    isAdmin: isDemoAdmin || profile?.role === "admin" || profile?.role === "nodal_officer",
    needsOnboarding:
      !isDemo && !!session?.user && !profile?.onboarded_at &&
      profile?.role !== "admin" && profile?.role !== "nodal_officer",
    setActivity,
    signIn, signUp, signOut, enterDemo, refreshProfile, updateProfile,
  }), [loading, session, profile, isDemo, isDemoAdmin, setActivity,
       signIn, signUp, signOut, enterDemo, refreshProfile, updateProfile]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
