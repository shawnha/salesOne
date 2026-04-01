interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-semibold rounded-full transition-all duration-200 active:scale-[0.98]";
  const sizes = { sm: "px-4 py-1.5 text-xs", md: "px-6 py-2.5 text-sm" };
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
    ghost: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
