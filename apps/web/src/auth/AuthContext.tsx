import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrfToken } from '../lib/api';
import type { User } from '../lib/types';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type MeResponse = { user: User; csrfToken: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const result = await api<MeResponse>('/auth/me');
        setCsrfToken(result.csrfToken);
        return result.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<MeResponse>('/auth/login', { method: 'POST', body: { email, password } });
      setCsrfToken(result.csrfToken);
      queryClient.setQueryData(['auth', 'me'], result.user);
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    queryClient.setQueryData(['auth', 'me'], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'admin' });
  }, [queryClient]);

  const value = useMemo(
    () => ({ user: me.data ?? null, loading: me.isPending, login, logout }),
    [me.data, me.isPending, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
