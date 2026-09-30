export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="DeverDesk" className={className}>
      <rect width="32" height="32" rx="8" fill="#1c1c20" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M16 16V7a9 9 0 0 1 9 9Z" fill="#fff" />
    </svg>
  )
}
