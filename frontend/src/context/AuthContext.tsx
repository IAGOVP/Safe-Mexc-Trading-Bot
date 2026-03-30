import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { signInRequest, signUpRequest, updatePasswordRequest } from "../api/authApi";
import { Account } from "../types/account";

interface AuthContextValue {
  currentAccount: Account | null;
  signUp: (payload: { email: string; password: string; confirmPassword: string }) => Promise<void>;
  signIn: (payload: { email: string; password: string }) => Promise<void>;
  signOut: () => void;
  updatePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_STORAGE_KEY = "safebinance.auth.account";

const getStoredAccount = (): Account | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Account;
    if (!parsed?.email || !parsed?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentAccount, setCurrentAccount] = useState<Account | null>(() => getStoredAccount());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (currentAccount) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentAccount));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [currentAccount]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentAccount,
      signUp: async (payload) => {
        const account = await signUpRequest(payload);
        setCurrentAccount(account);
      },
      signIn: async (payload) => {
        const account = await signInRequest(payload);
        setCurrentAccount(account);
      },
      signOut: () => {
        setCurrentAccount(null);
      },
      updatePassword: async ({ currentPassword, newPassword, confirmNewPassword }) => {
        if (!currentAccount) {
          throw new Error("No signed-in account.");
        }
        const updated = await updatePasswordRequest({
          email: currentAccount.email,
          currentPassword,
          newPassword,
          confirmNewPassword
        });
        setCurrentAccount(updated);
      }
    }),
    [currentAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};
