import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import { SignInDialog } from "./components/auth/SignInDialog";
import { SignUpDialog } from "./components/auth/SignUpDialog";
import { Navbar } from "./components/layout/Navbar";
import { useAuth } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";
import { FuturesDashboardPage } from "./pages/FuturesDashboardPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { StepTradingPage } from "./pages/StepTradingPage";
import { ReverseStrategyPage } from "./pages/ReverseStrategyPage";

function App() {
  const { currentAccount } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="min-h-screen pb-12">
      <Navbar
        onSignInClick={() => setShowSignIn(true)}
        onSignUpClick={() => setShowSignUp(true)}
      />

      <Routes>
        <Route path="/" element={currentAccount ? <FuturesDashboardPage /> : <HomePage />} />
        <Route path="/dashboard" element={<FuturesDashboardPage />} />
        <Route path="/steps" element={<StepTradingPage />} />
        <Route path="/reverse" element={<ReverseStrategyPage />} />
        <Route path="/settings" element={<AccountSettingsPage />} />
      </Routes>

      {showSignUp ? <SignUpDialog onClose={() => setShowSignUp(false)} /> : null}
      {showSignIn ? <SignInDialog onClose={() => setShowSignIn(false)} /> : null}
    </div>
  );
}

export default App;
