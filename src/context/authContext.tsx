import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { User, UserRole, UserApprovalStatus, Branch } from '../types';
import { supabase } from '../services/supabaseService';
import { tryServerSignIn, signOutServer, getServerSessionAsync, linkAuthUserToProfile } from '../services/authService';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  branches: Branch[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; user?: User; message?: string }>;
  logout: () => Promise<void>;
  registerUser: (userData: Omit<User, 'id'>) => Promise<{ ok: boolean; message?: string }>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setUsers: (users: User[]) => void;
  setBranches: (branches: Branch[]) => void;
  setCurrentUser: (user: User | null) => void;
  refreshSession: () => Promise<void>;
}

const AUTH_SESSION_KEY = 'dream_dist_auth_session_v1';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const AuthContext = createContext<AuthContextType | null>(null);

const attemptsMap = new Map<string, { count: number; firstAt: number }>();
const cleanupAttempts = () => {
  const now = Date.now();
  for (const [key, value] of attemptsMap.entries()) {
    if (now - value.firstAt > LOCKOUT_WINDOW_MS) attemptsMap.delete(key);
  }
};
setInterval(cleanupAttempts, LOCKOUT_WINDOW_MS);

function isRateLimited(identifier: string): boolean {
  cleanupAttempts();
  const rec = attemptsMap.get(identifier.toLowerCase().trim());
  return Boolean(rec && rec.count >= MAX_FAILED_ATTEMPTS);
}
function recordFailedAttempt(identifier: string): void {
  const key = identifier.toLowerCase().trim();
  const now = Date.now();
  const rec = attemptsMap.get(key);
  if (!rec) {
    attemptsMap.set(key, { count: 1, firstAt: now });
  } else {
    rec.count += 1;
    attemptsMap.set(key, rec);
  }
}
function clearFailedAttempts(identifier: string): void {
  attemptsMap.delete(identifier.toLowerCase().trim());
}

interface SessionHandle {
  userId: string;
  authUserId?: string;
  role: UserRole;
  branchName: string;
  name: string;
  username: string;
  email: string;
  savedAt: number;
}

function toSessionHandle(user: User): SessionHandle {
  return {
    userId: user.id,
    authUserId: user.auth_user_id,
    role: user.role,
    branchName: user.branchName,
    name: user.name,
    username: user.username,
    email: user.email,
    savedAt: Date.now(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [users, setUsersState] = useState<User[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initDone = useRef(false);

  const isAuthenticated = !!currentUser;

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const restore = async () => {
      try {
        const raw = localStorage.getItem(AUTH_SESSION_KEY);
        if (!raw) {
          setIsLoading(false);
          return;
        }
        const handle: SessionHandle = JSON.parse(raw);
        const session = await getServerSessionAsync();
        if (!session?.user) {
          localStorage.removeItem(AUTH_SESSION_KEY);
          setIsLoading(false);
          return;
        }
        const found = users.find((u) => u.id === handle.userId || u.auth_user_id === handle.authUserId);
        if (found) {
          setCurrentUserState(found);
        }
      } catch {
        /* ignore corrupt storage */
      } finally {
        setIsLoading(false);
      }
    };
    void restore();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      if (!identifier.trim() || !password.trim()) {
        return { ok: false, message: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.' };
      }

      if (isRateLimited(identifier)) {
        return {
          ok: false,
          message: 'تم تجاوز عدد المحاولات المسموح به. يرجى المحاولة مرة أخرى بعد 15 دقيقة.',
        };
      }

      const outcome = await tryServerSignIn(identifier, password);
      if (outcome.kind !== 'success' || !outcome.authUserId) {
        recordFailedAttempt(identifier);
        return {
          ok: false,
          message: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
        };
      }

      if (outcome.email) {
        await linkAuthUserToProfile(outcome.authUserId, outcome.email);
      }

      let found: User | null = null;
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .or(`auth_user_id.eq.${outcome.authUserId},auth_email.eq.${(outcome.email || identifier).toLowerCase()}`)
          .limit(1);
        if (data?.[0]) found = data[0] as User;
      } catch {
        /* fall through */
      }

      if (!found) {
        recordFailedAttempt(identifier);
        return { ok: false, message: 'حساب غير مرتبط في قاعدة البيانات. يرجى التواصل مع الإدارة.' };
      }

      if (!found.isActive || found.approvalStatus === 'rejected') {
        recordFailedAttempt(identifier);
        return { ok: false, message: 'هذا الحساب موقوف أو تم رفض تفعيله من قبل الإدارة.' };
      }
      if (found.approvalStatus === 'pending_approval') {
        recordFailedAttempt(identifier);
        return { ok: false, message: 'الحساب قيد المراجعة والتفعيل من الإدارة. يرجى التواصل مع المشرف.' };
      }

      clearFailedAttempts(identifier);
      const handle = toSessionHandle(found);
      try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(handle)); } catch {}

      setCurrentUserState(found);
      return { ok: true, user: found, message: `مرحباً بك ${found.name}` };
    } finally {
      setIsLoading(false);
    }
  }, [users]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOutServer();
    } catch {
      /* ignore */
    } finally {
      setCurrentUserState(null);
      try { localStorage.removeItem(AUTH_SESSION_KEY); } catch {}
      setIsLoading(false);
    }
  }, []);

  const registerUser = useCallback(async (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: crypto.randomUUID(),
      isActive: true,
      approvalStatus: userData.role === 'admin' || userData.role === 'developer' ? 'active' : 'pending_approval',
      registrationDate: new Date().toISOString().slice(0, 10),
    };
    setUsersState((prev) => [...prev, newUser]);
    return { ok: true, message: 'تم إرسال طلب الحساب وهو بانتظار اعتماد الإدارة.' };
  }, []);

  const updateUser = useCallback(async (id: string, data: Partial<User>) => {
    setUsersState((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    setUsersState((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const setUsers = useCallback((usersList: User[]) => setUsersState(usersList), []);
  const setBranches = useCallback((branchesList: Branch[]) => setBranchesState(branchesList), []);
  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
    try {
      if (user) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(toSessionHandle(user)));
      } else {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    } catch {}
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await getServerSessionAsync();
      if (!session?.user) {
        setCurrentUserState(null);
        localStorage.removeItem(AUTH_SESSION_KEY);
        return;
      }
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .limit(1);
      if (data?.[0]) setCurrentUserState(data[0] as User);
    } catch {
      setCurrentUserState(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      users,
      branches,
      isAuthenticated,
      isLoading,
      login,
      logout,
      registerUser,
      updateUser,
      deleteUser,
      setUsers,
      setBranches,
      setCurrentUser,
      refreshSession,
    }),
    [
      currentUser,
      users,
      branches,
      isAuthenticated,
      isLoading,
      login,
      logout,
      registerUser,
      updateUser,
      deleteUser,
      setUsers,
      setBranches,
      setCurrentUser,
      refreshSession,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
