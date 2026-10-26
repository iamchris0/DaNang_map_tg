import { use } from 'react';

import { AuthContext, type AuthState } from './AuthProvider';

export function useAuth(): AuthState {
  return use(AuthContext);
}
