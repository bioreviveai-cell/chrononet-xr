import { X } from 'lucide-react';
import {
  HALLMARK_MODULES,
  INTERVENTION_TOKENS,
  PROTEIN_NODES,
  STAGE_METADATA,
} from '../data/agingNetwork';
import type {
  HallmarkId,
  ResearchTask,
  SelectionTarget,
  StageId,
} from '../types/chrononet';

interface SpatialInspectorProps {
  target: SelectionTarget | null;
  onClose: () => void;
  onSelectTarget: (next: SelectionTarget) => void;
  notes: Record<string, string>;
  onUpdateNote: (key: string, text: string) => void;
  ageFactor: number;
  deployedInterventions: Record<string, HallmarkId | null>;
  onToggleIntervention: (tokenId: string, hallmarkId: HallmarkId) => void;
  tasks: ResearchTask[];
  onOpenStageTasks: (stage: StageId) => void;
}

export function SpatialInspector({
  target,
  onClose,
  onSelectTarget,
  notes,
  onUpdateNote,
  ageFactor,
  deployedInterventions,
  onToggleIntervention,
  tasks,
  onOpenStageTasks,
}: SpatialInspectorProps) {
  if (!target) return null;

  const noteKey = `${target.kind}:${target.id}`;
  const currentNote = notes[noteKey] ?? '';

  return (
    <section
      aria-label="Spatial Node and Block Inspector"
      className="fixed top-20 left-5 z-20 w-[348px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-12rem)] overflow-y-auto lab-scroll bg-[#0A0F1A]/96 border border-slate-800 rounded-lg p-5 shadow-2xl"
    >
      {target.kind === 'protein' && (() => {
        const node = PROTEIN_NODES.find((p) => p.id === target.id);
        if (!node) return null;
        const hallmark = HALLMARK_MODULES.find((h) => h.id === node.hallmarkId);
        const interpolatedExpr =
          node.youngExpr + (node.oldExpr - node.youngExpr) * ageFactor;
        const driftDelta = ((node.oldExpr - node.youngExpr) * 100).toFixed(1);

        return (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-100">
                  {node.symbol}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{node.fullName}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span style={{ color: hallmark?.color }}>{hallmark?.name}</span>
              <span aria-hidden="true">·</span>
              <span>{node.openGenesConfidence} Confidence</span>
              {node.isBottleneck && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Bottleneck Bridge</span>
                </>
              )}
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              {node.summary}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-500">Degree</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {node.degreeCentrality.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Betweenness</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {node.betweennessCentrality.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Module z</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {node.zScore.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Expression Trajectory</span>
                <span className="font-mono-tabular text-slate-200">
                  {(interpolatedExpr * 100).toFixed(0)}% ({Number(driftDelta) >= 0 ? `+${driftDelta}%` : `${driftDelta}%`} age drift)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-150"
                  style={{ width: `${Math.round(interpolatedExpr * 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {target.kind === 'hallmark' && (() => {
        const hm = HALLMARK_MODULES.find((h) => h.id === target.id);
        if (!hm) return null;
        const memberGenes = PROTEIN_NODES.filter(
          (p) => p.hallmarkId === hm.id,
        );

        return (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  className="font-display text-base font-semibold"
                  style={{ color: hm.color }}
                >
                  {hm.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stage 2 Hallmark Module · {hm.seedCount} OpenGenes Seeds
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              {hm.description}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-500">z-Score</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {hm.zScore.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">p-Value</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {hm.pValue}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">LCC Ratio</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {(hm.lccRatio * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400 mb-2">
                Core Hub Proteins
              </div>
              <div className="flex flex-wrap gap-1.5">
                {memberGenes.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectTarget({ kind: 'protein', id: g.id })}
                    className="px-2.5 py-1 text-xs font-mono-tabular bg-slate-900 border border-slate-700/80 text-slate-200 rounded hover:border-sky-500/70 transition-colors"
                  >
                    {g.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {target.kind === 'intervention' && (() => {
        const token = INTERVENTION_TOKENS.find((t) => t.id === target.id);
        if (!token) return null;
        const deployedTarget = deployedInterventions[token.id];
        const targetHm = HALLMARK_MODULES.find(
          (h) => h.id === (deployedTarget ?? token.targetHallmark),
        );

        return (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {token.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {token.classification} · Target: {targetHm?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              {token.mechanism}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-500">Proximity z</div>
                <div className="font-mono-tabular text-sm font-semibold text-emerald-400 mt-0.5">
                  {token.proximityZ.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Path d_c</div>
                <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-0.5">
                  {token.shortestDistance.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Reversal</div>
                <div className="font-mono-tabular text-sm font-semibold text-sky-400 mt-0.5">
                  {token.reversalPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">
                Targets: {token.targetGenes.join(' · ')}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onToggleIntervention(token.id, token.targetHallmark)
              }
              className={`mt-3 w-full py-2 px-4 text-xs font-medium rounded-md transition-colors ${
                deployedTarget
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {deployedTarget
                ? 'Recall Intervention Token'
                : `Deploy Near ${targetHm?.shortName ?? 'Module'}`}
            </button>
          </div>
        );
      })()}

      {target.kind === 'stage' && (() => {
        const meta = STAGE_METADATA[target.id];
        const sTasks = tasks.filter((t) => t.stage === target.id);
        const doneCount = sTasks.filter((t) => t.status === 'Done').length;

        return (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {meta.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
                  {doneCount} of {sTasks.length} research tasks complete
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              {meta.summary}
            </p>

            <button
              type="button"
              onClick={() => onOpenStageTasks(target.id)}
              className="mt-4 w-full py-2 px-4 text-xs font-medium bg-sky-500 text-slate-950 rounded-md hover:bg-sky-400 transition-colors"
            >
              Open Stage {target.id} Task Checklist
            </button>
          </div>
        );
      })()}

      {/* Persistent Observation Note Editor */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <label
          htmlFor="spatial-observation-note"
          className="block text-xs font-medium text-slate-300 mb-1.5"
        >
          Observation Note
        </label>
        <textarea
          id="spatial-observation-note"
          rows={2}
          value={currentNote}
          onChange={(e) => onUpdateNote(noteKey, e.target.value)}
          placeholder="Log hypothesis, z-score anomaly, or curation note..."
          className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 resize-none"
        />
      </div>
    </section>
  );
}
