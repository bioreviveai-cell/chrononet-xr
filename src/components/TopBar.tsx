import type { CameraFocusView } from '../scene/ChronoNetScene';
import { Headphones, ListChecks } from 'lucide-react';

interface TopBarProps {
  activeView: CameraFocusView;
  onFocusView: (view: CameraFocusView) => void;
  tasksOpen: boolean;
  onToggleTasks: () => void;
  completedCount: number;
  totalCount: number;
  xrSupported: boolean;
  xrActive: boolean;
  onToggleXr: () => void;
}

const NAV_ITEMS: Array<{ id: CameraFocusView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 1, label: 'Stage 1 · Interactome' },
  { id: 2, label: 'Stage 2 · Hallmarks' },
  { id: 3, label: 'Stage 3 · Perturbation' },
];

export function TopBar({
  activeView,
  onFocusView,
  tasksOpen,
  onToggleTasks,
  completedCount,
  totalCount,
  xrSupported,
  xrActive,
  onToggleXr,
}: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between gap-8 px-6 bg-[#080C15]/95 border-b border-slate-800/90">
      {/* Zone 1: Single-line Brand Wordmark */}
      <button
        type="button"
        onClick={() => onFocusView('overview')}
        className="font-display text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0 hover:text-sky-400 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 rounded"
      >
        ChronoNet XR
      </button>

      {/* Zone 2: Clean single-line camera focus links */}
      <nav
        aria-label="Spatial Stage Navigation"
        className="hidden md:flex items-center gap-6"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={String(item.id)}
              type="button"
              onClick={() => onFocusView(item.id)}
              className={`relative py-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
                isActive
                  ? 'text-sky-400'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Workspace Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleTasks}
          aria-expanded={tasksOpen}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
            tasksOpen
              ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
              : 'bg-slate-900 border-slate-700/80 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Tasks</span>
          <span className="font-mono-tabular text-slate-400">
            {completedCount}/{totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleXr}
          disabled={!xrSupported && !xrActive}
          title={
            xrSupported
              ? 'Launch WebXR Headset / Hand-Tracking Session'
              : 'WebXR headset runtime not detected in this browser (Desktop 3D mode active)'
          }
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
            xrActive
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : xrSupported
                ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700/70 cursor-not-allowed'
          }`}
        >
          <Headphones className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {xrActive ? 'Exit XR' : xrSupported ? 'Enter XR' : 'Desktop 3D'}
          </span>
        </button>
      </div>
    </header>
  );
}
