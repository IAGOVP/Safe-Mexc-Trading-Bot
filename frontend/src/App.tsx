import { useEffect, useState } from "react";
import { SignInDialog } from "./components/auth/SignInDialog";
import { SignUpDialog } from "./components/auth/SignUpDialog";
import { Navbar } from "./components/layout/Navbar";
import { useAuth } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";
import { FuturesDashboardPage } from "./pages/FuturesDashboardPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { StepTradingPage } from "./pages/StepTradingPage";

type SignedInView = "dashboard" | "settings" | "steps";

function App() {
  const { currentAccount } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signedInView, setSignedInView] = useState<SignedInView>("dashboard");

  useEffect(() => {
    if (!currentAccount) {
      setSignedInView("dashboard");
    }
  }, [currentAccount]);

  return (
    <div className="min-h-screen pb-12">
      <Navbar
        onSignInClick={() => setShowSignIn(true)}
        onSignUpClick={() => setShowSignUp(true)}
        onSettingsClick={() => setSignedInView("settings")}
        onDashboardClick={() => setSignedInView("dashboard")}
        onStepTradingClick={() => setSignedInView("steps")}
      />

      {currentAccount ? (
        signedInView === "settings" ? (
          <AccountSettingsPage />
        ) : signedInView === "steps" ? (
          <StepTradingPage />
        ) : (
          <FuturesDashboardPage />
        )
      ) : (
        <HomePage />
      )}

      {showSignUp ? <SignUpDialog onClose={() => setShowSignUp(false)} /> : null}
      {showSignIn ? <SignInDialog onClose={() => setShowSignIn(false)} /> : null}
    </div>
  );
}

export default App;
