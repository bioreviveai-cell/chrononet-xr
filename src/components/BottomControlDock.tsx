import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { INTERVENTION_TOKENS } from '../data/agingNetwork';
import type { HallmarkId } from '../types/chrononet';

interface BottomControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  ageFactor: number;
  onChangeAgeFactor: (value: number) => void;
  deployedInterventions: Record<string, HallmarkId | null>;
  onToggleIntervention: (tokenId: string, defaultHallmark: HallmarkId) => void;
  onResetView: () => void;
}

export function BottomControlDock({
  collapsed,
  onToggleCollapse,
  ageFactor,
  onChangeAgeFactor,
  deployedInterventions,
  onToggleIntervention,
  onResetView,
}: BottomControlDockProps) {
  const ageYears = Math.round(25 + ageFactor * 55);
  const activeInterventionCount = Object.values(deployedInterventions).filter(
    Boolean,
  ).length;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(940px,94vw)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%+16px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Handle attached cleanly to top edge */}
      <div className="flex justify-center mb-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 bg-[#0B101A]/95 border border-slate-800 rounded-md hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap"
          title="Toggle Control Dock (H)"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Bar */}
      <div className="bg-[#0B101A]/95 border border-slate-800 rounded-lg px-4 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 shadow-2xl">
        {/* Age Trajectory Slider & Toggle */}
        <div className="flex items-center gap-3 min-w-[260px]">
          <button
            type="button"
            onClick={() => onChangeAgeFactor(ageFactor < 0.5 ? 1 : 0)}
            className="px-2.5 py-1.5 text-xs font-medium rounded bg-slate-900 border border-slate-700 text-slate-200 hover:border-sky-500/60 transition-colors whitespace-nowrap shrink-0"
          >
            {ageFactor < 0.5 ? 'Young Baseline' : 'Aged Phenotype'}
          </button>

          <div className="flex flex-col flex-1 min-w-[120px]">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Trajectory</span>
              <span className="font-mono-tabular text-slate-200">
                {ageYears} yrs
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={ageFactor}
              onChange={(e) => onChangeAgeFactor(parseFloat(e.target.value))}
              aria-label="Age Trajectory"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>

        <div className="hidden lg:block w-px h-8 bg-slate-800 shrink-0" />

        {/* Intervention Tokens Tray */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto lab-scroll py-0.5">
          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mr-1">
            Interventions ({activeInterventionCount}):
          </span>
          {INTERVENTION_TOKENS.map((token) => {
            const isDeployed = Boolean(deployedInterventions[token.id]);
            return (
              <button
                key={token.id}
                type="button"
                onClick={() =>
                  onToggleIntervention(token.id, token.targetHallmark)
                }
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 transition-colors ${
                  isDeployed
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: token.color }}
                />
                <span>{token.name}</span>
              </button>
            );
          })}
        </div>

        {/* Reset Camera View */}
        <button
          type="button"
          onClick={onResetView}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700/80 rounded-md hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap shrink-0"
          title="Reset camera to full 3-stage overview"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset View</span>
        </button>
      </div>
    </div>
  );
}
