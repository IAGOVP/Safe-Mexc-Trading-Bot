import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { PasswordStrength } from "../auth/PasswordStrength";

export const AccountSettingsPanel = () => {
  const { currentAccount, updatePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    try {
      await updatePassword({ currentPassword, newPassword, confirmNewPassword });
      setPasswordMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password.");
    }
  };

  if (!currentAccount) {
    return null;
  }

  return (
    <div className="glass-card mx-auto mt-8 w-full max-w-2xl rounded-2xl p-6">
      <h2 className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-xl font-semibold text-transparent">
        Account Settings
      </h2>
      <p className="mt-1 text-sm text-slate-300">Email: {currentAccount.email}</p>

      <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
        <p className="font-medium text-amber-200">Binance API keys</p>
        <p className="mt-1 text-slate-300">
          USDⓈ-M futures trading uses <code className="text-sky-200">BINANCE_API_KEY</code> and{" "}
          <code className="text-sky-200">BINANCE_API_SECRET</code> in the backend <code className="text-sky-200">.env</code> file (not stored in this
          app). Enable <strong>Futures</strong> permission on the key. Optional algo (VP) orders use the same key against{" "}
          <code className="text-sky-200">api.binance.com</code> per{" "}
          <a
            className="text-sky-300 underline"
            href="https://developers.binance.com/docs/algo/future-algo"
            target="_blank"
            rel="noreferrer"
          >
            Binance Future Algo docs
          </a>
          .
        </p>
      </div>

      <div className="mt-8 border-t border-sky-500/15 pt-6">
        <h3 className="text-lg font-semibold text-slate-100">Update Password</h3>
        <form className="mt-4 space-y-3" onSubmit={handlePasswordSubmit}>
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="password"
            placeholder="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <PasswordStrength password={newPassword} />
          <input
            className="input-theme w-full rounded-lg px-3 py-2"
            type="password"
            placeholder="Confirm New Password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
          />
          {passwordMessage ? <p className="text-sm text-emerald-400">{passwordMessage}</p> : null}
          {passwordError ? <p className="text-sm text-rose-400">{passwordError}</p> : null}
          <button className="neon-btn rounded-lg px-4 py-2 font-medium text-white" type="submit">
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
};
