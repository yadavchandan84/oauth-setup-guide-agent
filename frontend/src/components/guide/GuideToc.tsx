const ITEMS = [
  { id: 'summary', label: 'Summary' },
  { id: 'time', label: 'Time estimate' },
  { id: 'timeline', label: 'Approval timeline' },
  { id: 'prerequisites', label: 'Prerequisites' },
  { id: 'steps', label: 'Setup steps' },
  { id: 'scopes', label: 'Scopes & redirect URIs' },
  { id: 'blockers', label: 'Common blockers' },
  { id: 'handoff', label: 'Agent handoff' },
  { id: 'sources', label: 'Sources' },
];

export function GuideToc() {
  return (
    <nav aria-label="On this page" className="guide-toc sticky top-20 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        On this page
      </p>
      <ul className="space-y-1">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block rounded-md px-2 py-1 text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
