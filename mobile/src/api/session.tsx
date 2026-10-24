import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, setAccessToken, setUnauthorizedHandler, type User } from './client';
import { clearSession, loadSession, saveSession } from './tokenStore';

type Session = { token: string; user: User };
type SessionState = {
  ready: boolean;
  user: User | null;
  signIn: (username: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
    await clearSession();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    loadSession()
      .then((raw) => {
        if (!raw) return;
        const session = JSON.parse(raw) as Session;
        setAccessToken(session.token);
        setUser(session.user);
      })
      .catch(() => clearSession())
      .finally(() => setReady(true));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = useCallback(async (username: string, password: string) => {
    const token = await api.login(username, password);
    setAccessToken(token.access_token);
    await saveSession(JSON.stringify({ token: token.access_token, user: token.user }));
    setUser(token.user);
    return token.user;
  }, []);

  return (
    <SessionContext.Provider value={{ ready, user, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
