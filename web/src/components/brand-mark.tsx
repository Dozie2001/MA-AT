export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="Ma'at">
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path d="M21 4v30M10 12h22M8 34h26" />
        <path d="M10 12 5 24h10L10 12Zm22 0-5 12h10l-5-12Z" />
        <path d="M17 7c2.5-3 5.5-3 8 0-1.5 2-2.8 3.5-4 5-1.2-1.5-2.5-3-4-5Z" />
      </svg>
      {compact ? null : (
        <span>
          <strong>MA'AT</strong>
          <small>verified settlement</small>
        </span>
      )}
    </span>
  )
}
