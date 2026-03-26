import { createContext, useContext, useMemo, useState } from "react";
import { signInRequest, signUpRequest, updateMexcKeysRequest, updatePasswordRequest } from "../api/authApi";
import { Account } from "../types/account";

interface AuthContextValue {
  currentAccount: Account | null;
  signUp: (payload: { email: string; password: string; confirmPassword: string }) => Promise<void>;
  signIn: (payload: { email: string; password: string }) => Promise<void>;
  signOut: () => void;
  updateMexcKeys: (payload: { mexcAPIKey: string; mexcSecretKey: string }) => Promise<void>;
  updatePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);

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
      updateMexcKeys: async ({ mexcAPIKey, mexcSecretKey }) => {
        if (!currentAccount) {
          throw new Error("No signed-in account.");
        }
        const updated = await updateMexcKeysRequest({
          email: currentAccount.email,
          mexcAPIKey,
          mexcSecretKey
        });
        setCurrentAccount(updated);
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
