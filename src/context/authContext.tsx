import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { User, UserRole, UserApprovalStatus, Branch } from '../types';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  branches: Branch[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  registerUser: (userData: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setUsers: (users: User[]) => void;
  setBranches: (branches: Branch[]) => void;
  setCurrentUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [users, setUsersState] = useState<User[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!currentUser;

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const user = users.find(u => u.username === username);
      if (!user) throw new Error('اسم المستخدم غير صحيح');
      setCurrentUserState(user);
    } finally {
      setIsLoading(false);
    }
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUserState(null);
  }, []);

  const registerUser = useCallback(async (userData: Omit<User, 'id'>) => {
    const newUser: User = { ...userData, id: crypto.randomUUID() };
    setUsersState(prev => [...prev, newUser]);
  }, []);

  const updateUser = useCallback(async (id: string, data: Partial<User>) => {
    setUsersState(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    setUsersState(prev => prev.filter(u => u.id !== id));
  }, []);

  const setUsers = useCallback((users: User[]) => setUsersState(users), []);
  const setBranches = useCallback((branches: Branch[]) => setBranchesState(branches), []);
  const setCurrentUser = useCallback((user: User | null) => setCurrentUserState(user), []);

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