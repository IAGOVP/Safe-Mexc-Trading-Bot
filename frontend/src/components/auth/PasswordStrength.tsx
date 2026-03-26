interface PasswordStrengthProps {
  password: string;
}

const calculateStrength = (password: string): { score: number; label: string } => {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: "Weak" };
  if (score <= 4) return { score, label: "Medium" };
  return { score, label: "Strong" };
};

export const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  if (!password) {
    return null;
  }

  const { score, label } = calculateStrength(password);
  const percent = Math.max(10, score * 20);
  const colorClass = label === "Strong" ? "bg-cyan-400" : label === "Medium" ? "bg-blue-400" : "bg-rose-500";

  return (
    <div className="mt-2">
      <div className="h-2 w-full rounded bg-slate-800/90">
        <div className={`h-2 rounded transition-all ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-300">Password strength: {label}</p>
    </div>
  );
};
