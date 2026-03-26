import { AccountSettingsPanel } from "../components/settings/AccountSettingsPanel";

export const AccountSettingsPage = () => {
  return (
    <main className="mx-auto mt-8 max-w-6xl px-4">
      <section className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Account</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-100">Settings</h2>
      </section>
      <AccountSettingsPanel />
    </main>
  );
};

