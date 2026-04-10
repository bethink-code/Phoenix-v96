import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  termsAcceptedAt: string | null;
}

export function useAuth() {
  const q = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
  });
  return {
    user: q.data,
    isLoading: q.isLoading,
    isAuthenticated: Boolean(q.data),
  };
}
