import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface NavbarProps {
  onSignInClick: () => void;
  onSignUpClick: () => void;
}

export const Navbar = ({ onSignInClick, onSignUpClick }: NavbarProps) => {
  const { currentAccount, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-10 border-b border-sky-500/20 bg-slate-950/65 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <h1 className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-lg font-semibold text-transparent">
          Safe Binance Futures Bot
        </h1>

        {!currentAccount ? (
          <div className="flex gap-2">
            <button className="ghost-btn rounded-lg px-4 py-2 text-slate-100" onClick={onSignInClick}>
              Sign In
            </button>
            <button className="neon-btn rounded-lg px-4 py-2 font-medium text-white" onClick={onSignUpClick}>
              Sign Up
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              className="ghost-btn inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-100"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 7H20M4 12H20M4 17H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {isMenuOpen ? (
              <div className="glass-card absolute right-0 mt-2 w-48 rounded-xl p-1">
                <Link
                  to="/dashboard"
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-100 hover:bg-sky-500/10"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/steps"
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-100 hover:bg-sky-500/10"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Step trading
                </Link>
                <Link
                  to="/settings"
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-100 hover:bg-sky-500/10"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-slate-100 hover:bg-sky-500/10"
                  onClick={() => {
                    signOut();
                    setIsMenuOpen(false);
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </nav>
  );
};
