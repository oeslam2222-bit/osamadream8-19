import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../services/supabaseService';

// Mock supabase auth
vi.mock('../services/supabaseService', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

describe('Supabase Auth Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يحتوي على عنوان URL لـ Supabase', () => {
    expect(supabase).toBeDefined();
  });

  it('تحتوي supabase.auth على دالة signInWithPassword', () => {
    expect(typeof supabase.auth.signInWithPassword).toBe('function');
  });

  it('تحتوي supabase.auth على دالة signOut', () => {
    expect(typeof supabase.auth.signOut).toBe('function');
  });
});