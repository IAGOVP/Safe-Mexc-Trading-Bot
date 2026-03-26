import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";

export const AccountSettingsPanel = () => {
  const { currentAccount, updateMexcKeys } = useAuth();
  const [mexcAPIKey, setMexcAPIKey] = useState(currentAccount?.mexcAPIKey ?? "");
  const [mexcSecretKey, setMexcSecretKey] = useState(currentAccount?.mexcSecretKey ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await updateMexcKeys({ mexcAPIKey, mexcSecretKey });
      setMessage("MEXC keys updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
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
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <input
          className="input-theme w-full rounded-lg px-3 py-2"
          type="text"
          placeholder="MEXC API Key"
          value={mexcAPIKey}
          onChange={(e) => setMexcAPIKey(e.target.value)}
        />
        <input
          className="input-theme w-full rounded-lg px-3 py-2"
          type="password"
          placeholder="MEXC Secret Key"
          value={mexcSecretKey}
          onChange={(e) => setMexcSecretKey(e.target.value)}
        />
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <button className="neon-btn rounded-lg px-4 py-2 font-medium text-white" type="submit">
          Save Settings
        </button>
      </form>
    </div>
  );
};
