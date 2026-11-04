import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { User, UserRole, Branch } from '../types';
import { supabase } from '../services/supabaseService';
import { verifyPassword, hashPassword } from '../services/passwordService';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  branches: Branch[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (userData: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setUsers: (users: User[]) => void;
  setBranches: (branches: Branch[]) => void;
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('tantawy_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsersState] = useState<User[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!currentUser;

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('tantawy_current_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('tantawy_current_user');
      }
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user: User = {
          id: session.user.id,
          username: session.user.email?.split('@')[0] || session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'مستخدم',
          role: (session.user.user_metadata?.role as UserRole) || 'sales_rep',
          branchName: session.user.user_metadata?.branch_name || 'الفرع الرئيسي',
          phone: '',
          isActive: true,
          approvalStatus: 'active',
        };
        setCurrentUserState(user);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserState(null);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session?.user && !error) {
        const user: User = {
          id: session.user.id,
          username: session.user.email?.split('@')[0] || session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'مستخدم',
          role: (session.user.user_metadata?.role as UserRole) || 'sales_rep',
          branchName: session.user.user_metadata?.branch_name || 'الفرع الرئيسي',
          phone: '',
          isActive: true,
          approvalStatus: 'active',
        };
        setCurrentUserState(user);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: username.includes('@') ? username : `${username}@tantawy.local`,
          password,
        });
        if (data.user && !error) {
          const user: User = {
            id: data.user.id,
            username: data.user.email?.split('@')[0] || username,
            email: data.user.email || '',
            name: data.user.user_metadata?.full_name || username,
            role: (data.user.user_metadata?.role as UserRole) || 'sales_rep',
            branchName: data.user.user_metadata?.branch_name || 'الفرع الرئيسي',
            phone: '',
            isActive: true,
            approvalStatus: 'active',
          };
          setCurrentUserState(user);
          return;
        }
      } catch { }

      const user = users.find(u => u.username === username);
      if (!user) throw new Error('اسم المستخدم غير صحيح');

      const isValid = await verifyPassword(password, user.password || '');
      if (!isValid) throw new Error('كلمة المرور غير صحيحة');

      if (!user.isActive) throw new Error('الحرف غير نشط');
      if (user.approvalStatus !== 'active') throw new Error('الحرف لم يتم اعتماده بعد');

      setCurrentUserState(user);
    } finally {
      setIsLoading(false);
    }
  }, [users]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch { }
    setCurrentUserState(null);
  }, []);

  const registerUser = useCallback(async (userData: Omit<User, 'id'>) => {
    setIsLoading(true);
    try {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: userData.email,
          password: userData.password || 'temp_password_123',
          options: {
            data: {
              full_name: userData.name,
              role: userData.role,
              branch_name: userData.branchName,
            },
          },
        });
        if (data.user && !error) {
          const newUser: User = { ...userData, id: data.user.id, password: '' };
          setUsersState(prev => [...prev, newUser]);
          return;
        }
      } catch { }

      const hashedPassword = userData.password ? await hashPassword(userData.password) : '';
      const newUser: User = { ...userData, id: crypto.randomUUID(), password: hashedPassword };
      setUsersState(prev => [...prev, newUser]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (id: string, data: Partial<User>) => {
    setUsersState(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    setUsersState(prev => prev.filter(u => u.id !== id));
  }, []);

  const setUsers = useCallback((users: User[]) => setUsersState(users), []);
  const setBranches = useCallback((branches: Branch[]) => setBranchesState(branches), []);
  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
  }, []);

  const value = useMemo(() => ({
    currentUser, users, branches, isAuthenticated, isLoading,
    login, logout, registerUser, updateUser, deleteUser,
    setUsers, setBranches, setCurrentUser
  }), [currentUser, users, branches, isAuthenticated, isLoading, login, logout, registerUser, updateUser, deleteUser, setUsers, setBranches, setCurrentUser]);

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
