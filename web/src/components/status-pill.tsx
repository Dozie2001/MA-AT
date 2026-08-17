export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'teal'
  children: React.ReactNode
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}
