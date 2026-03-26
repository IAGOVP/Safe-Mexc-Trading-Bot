import { useState } from "react";
import { SignInDialog } from "./components/auth/SignInDialog";
import { SignUpDialog } from "./components/auth/SignUpDialog";
import { Navbar } from "./components/layout/Navbar";
import { AccountSettingsPanel } from "./components/settings/AccountSettingsPanel";
import { useAuth } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";

function App() {
  const { currentAccount } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen pb-12">
      <Navbar
        onSignInClick={() => setShowSignIn(true)}
        onSignUpClick={() => setShowSignUp(true)}
        onSettingsClick={() => setShowSettings(true)}
      />

      <HomePage />
      {currentAccount && showSettings ? <AccountSettingsPanel /> : null}

      {showSignUp ? <SignUpDialog onClose={() => setShowSignUp(false)} /> : null}
      {showSignIn ? <SignInDialog onClose={() => setShowSignIn(false)} /> : null}
    </div>
  );
}

export default App;
