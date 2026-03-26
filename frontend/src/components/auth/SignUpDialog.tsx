import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { PasswordStrength } from "./PasswordStrength";

interface SignUpDialogProps {
  onClose: () => void;
}

export const SignUpDialog = ({ onClose }: SignUpDialogProps) => {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    try {
      setIsLoading(true);
      await signUp({ email, password, confirmPassword });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Sign Up</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordStrength password={password} />
          <input
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2"
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button className="rounded border border-slate-600 px-4 py-2" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="rounded bg-indigo-500 px-4 py-2 font-medium text-white" type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
