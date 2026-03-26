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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="glass-card w-full max-w-md rounded-2xl p-6">
        <h2 className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-xl font-semibold text-transparent">Sign Up</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordStrength password={password} />
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button className="ghost-btn rounded-lg px-4 py-2" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="neon-btn rounded-lg px-4 py-2 font-medium text-white" type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
