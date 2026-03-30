import { Account } from "../types/account";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

interface AccountResponse {
  account: Account;
}

export const signUpRequest = async (payload: {
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<Account> => {
  const response = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to sign up.");
  }

  const body = (await response.json()) as AccountResponse;
  return body.account;
};

export const signInRequest = async (payload: { email: string; password: string }): Promise<Account> => {
  const response = await fetch(`${API_URL}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to sign in.");
  }

  const body = (await response.json()) as AccountResponse;
  return body.account;
};

export const updatePasswordRequest = async (payload: {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): Promise<Account> => {
  const response = await fetch(`${API_URL}/auth/settings/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to update password.");
  }

  const body = (await response.json()) as AccountResponse;
  return body.account;
};
