import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

interface NavbarProps {
  onSignInClick: () => void;
  onSignUpClick: () => void;
  onSettingsClick: () => void;
}

export const Navbar = ({ onSignInClick, onSignUpClick, onSettingsClick }: NavbarProps) => {
  const { currentAccount, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <h1 className="text-lg font-semibold">Safe MEXC Trading Bot</h1>

        {!currentAccount ? (
          <div className="flex gap-2">
            <button className="rounded border border-slate-600 px-4 py-2" onClick={onSignInClick}>
              Sign In
            </button>
            <button className="rounded bg-indigo-500 px-4 py-2 font-medium text-white" onClick={onSignUpClick}>
              Sign Up
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              className="rounded border border-slate-600 px-4 py-2"
              onClick={() => setIsMenuOpen((prev) => !prev)}
            >
              Menu
            </button>
            {isMenuOpen ? (
              <div className="absolute right-0 mt-2 w-48 rounded border border-slate-700 bg-slate-900 p-1 shadow-lg">
                <button
                  className="w-full rounded px-3 py-2 text-left hover:bg-slate-800"
                  onClick={() => {
                    onSettingsClick();
                    setIsMenuOpen(false);
                  }}
                >
                  Settings
                </button>
                <button
                  className="w-full rounded px-3 py-2 text-left hover:bg-slate-800"
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
