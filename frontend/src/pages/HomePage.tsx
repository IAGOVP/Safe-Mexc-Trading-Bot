export const HomePage = () => {
  return (
    <main className="mx-auto mt-14 max-w-5xl px-4">
      <section className="glass-card rounded-2xl p-8 text-center md:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/90">Binance USDⓈ-M Futures</p>
        <h2 className="mt-4 bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-4xl font-extrabold text-transparent md:text-5xl">
          Trade With A Pro-Level Crypto Theme
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-slate-300">
          Create an account or sign in. Configure <code className="text-sky-200">BINANCE_API_KEY</code> and{" "}
          <code className="text-sky-200">BINANCE_API_SECRET</code> in the backend <code className="text-sky-200">.env</code> (Futures permission enabled).
        </p>
      </section>
    </main>
  );
};
