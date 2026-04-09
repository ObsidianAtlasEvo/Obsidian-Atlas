import React, { createContext, useContext } from 'react';

export type AtlasAuthSession = {
  email: string;
  databaseUserId: string;
};

const AtlasAuthContext = createContext<AtlasAuthSession | null>(null);

export function AtlasAuthProvider({
  value,
  children,
}: {
  value: AtlasAuthSession;
  children: React.ReactNode;
}) {
  return <AtlasAuthContext.Provider value={value}>{children}</AtlasAuthContext.Provider>;
}

export function useAtlasAuth(): AtlasAuthSession | null {
  return useContext(AtlasAuthContext);
}
