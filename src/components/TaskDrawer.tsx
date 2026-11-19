import { useRef, useState } from 'react';
import {
  CheckSquare,
  Download,
  Plus,
  RotateCcw,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type {
  ResearchTask,
  StageId,
  TaskCadence,
  TaskStatus,
} from '../types/chrononet';

interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  tasks: ResearchTask[];
  stageFilter: 'all' | StageId;
  onChangeStageFilter: (filter: 'all' | StageId) => void;
  onToggleTaskDone: (taskId: string) => void;
  onChangeTaskStatus: (taskId: string, status: TaskStatus) => void;
  onAddTask: (title: string, stage: StageId, cadence: TaskCadence, metricNote: string) => void;
  onDeleteTask: (taskId: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onResetDefaults: () => void;
  onFocusStage: (stage: StageId) => void;
}

const STATUS_OPTIONS: TaskStatus[] = ['To Do', 'In Progress', 'Blocked', 'Done'];
const CADENCE_OPTIONS: TaskCadence[] = ['Daily', 'Weekly', 'Milestone'];

function statusTextTone(status: TaskStatus): string {
  switch (status) {
    case 'Done':
      return 'text-emerald-400';
    case 'In Progress':
      return 'text-sky-400';
    case 'Blocked':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
  }
}

export function TaskDrawer({
  open,
  onClose,
  tasks,
  stageFilter,
  onChangeStageFilter,
  onToggleTaskDone,
  onChangeTaskStatus,
  onAddTask,
  onDeleteTask,
  onExportJson,
  onImportJson,
  onResetDefaults,
  onFocusStage,
}: TaskDrawerProps) {
  const [cadenceFilter, setCadenceFilter] = useState<'all' | TaskCadence>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStage, setNewStage] = useState<StageId>(stageFilter === 'all' ? 2 : stageFilter);
  const [newCadence, setNewCadence] = useState<TaskCadence>('Weekly');
  const [newNote, setNewNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const filteredTasks = tasks.filter((t) => {
    if (stageFilter !== 'all' && t.stage !== stageFilter) return false;
    if (cadenceFilter !== 'all' && t.cadence !== cadenceFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  const stageProgress = ([1, 2, 3] as StageId[]).map((s) => {
    const sTasks = tasks.filter((t) => t.stage === s);
    const done = sTasks.filter((t) => t.status === 'Done').length;
    return {
      stage: s,
      done,
      total: sTasks.length,
      pct: sTasks.length > 0 ? Math.round((done / sTasks.length) * 100) : 0,
    };
  });

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAddTask(trimmed, newStage, newCadence, newNote.trim() || 'Manual entry');
    setNewTitle('');
    setNewNote('');
    setShowComposer(false);
  };

  return (
    <aside
      aria-label="Research Task Monitor"
      className="fixed top-14 right-0 bottom-0 z-30 w-full sm:w-[410px] bg-[#090E18]/98 border-l border-slate-800 flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Research Task Monitor
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Completing tasks upgrades the corresponding 3D Stage Block
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Task Monitor"
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stage Milestone Completion Strip */}
      <div className="px-5 py-3 border-b border-slate-800/80 grid grid-cols-3 gap-2">
        {stageProgress.map((sp) => (
          <button
            key={sp.stage}
            type="button"
            onClick={() => {
              onChangeStageFilter(stageFilter === sp.stage ? 'all' : sp.stage);
              onFocusStage(sp.stage);
            }}
            className={`text-left p-2.5 rounded-md border transition-colors ${
              stageFilter === sp.stage
                ? 'bg-slate-800/90 border-sky-500/60'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">Stage {sp.stage}</span>
              <span className="font-mono-tabular text-slate-400">
                {sp.done}/{sp.total}
              </span>
            </div>
            <div className="mt-2 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-200"
                style={{ width: `${sp.pct}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="px-5 py-3 border-b border-slate-800/80 space-y-2.5">
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-md border border-slate-800">
          {(['all', 1, 2, 3] as const).map((s) => (
            <button
              key={String(s)}
              type="button"
              onClick={() => onChangeStageFilter(s)}
              className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                stageFilter === s
                  ? 'bg-slate-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? 'All Stages' : `Stage ${s}`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by cadence"
            value={cadenceFilter}
            onChange={(e) =>
              setCadenceFilter(e.target.value as 'all' | TaskCadence)
            }
            className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Cadences</option>
            {CADENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | TaskStatus)
            }
            className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowComposer((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-sky-500 text-slate-950 rounded-md hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>

        {showComposer && (
          <form
            onSubmit={handleSubmitNew}
            className="pt-2 border-t border-slate-800 space-y-2"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New curation or validation task..."
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
            <div className="flex items-center gap-2">
              <select
                value={newStage}
                onChange={(e) => setNewStage(Number(e.target.value) as StageId)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
              >
                <option value={1}>Stage 1</option>
                <option value={2}>Stage 2</option>
                <option value={3}>Stage 3</option>
              </select>
              <select
                value={newCadence}
                onChange={(e) => setNewCadence(e.target.value as TaskCadence)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
              >
                {CADENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Metric note (optional)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-medium bg-sky-500 text-slate-950 rounded-md hover:bg-sky-400"
              >
                Save Task
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Task Checklist */}
      <div className="flex-1 overflow-y-auto lab-scroll divide-y divide-slate-800/70">
        {filteredTasks.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-slate-500">
            No research tasks match the current filter criteria.
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isDone = task.status === 'Done';
            return (
              <div
                key={task.id}
                className="px-5 py-3.5 hover:bg-slate-900/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleTaskDone(task.id)}
                    aria-label={
                      isDone
                        ? `Mark "${task.title}" as To Do`
                        : `Mark "${task.title}" as Done`
                    }
                    className="mt-0.5 text-slate-400 hover:text-sky-400 transition-colors shrink-0"
                  >
                    {isDone ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium leading-relaxed ${
                        isDone ? 'text-slate-400 line-through' : 'text-slate-100'
                      }`}
                    >
                      {task.title}
                    </p>

                    {/* Clean unboxed metadata with typographic separators */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      <span>Stage {task.stage}</span>
                      <span aria-hidden="true">·</span>
                      <span>{task.cadence}</span>
                      <span aria-hidden="true">·</span>
                      <span className={statusTextTone(task.status)}>
                        {task.status}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] font-mono-tabular text-slate-500">
                      {task.metricNote}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <select
                      aria-label={`Change status for ${task.title}`}
                      value={task.status}
                      onChange={(e) =>
                        onChangeTaskStatus(
                          task.id,
                          e.target.value as TaskStatus,
                        )
                      }
                      className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-slate-300 focus:outline-none focus:border-sky-500"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      className="text-[11px] text-slate-600 hover:text-rose-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Persistence Footer: JSON Export / Import / Reset */}
      <div className="px-5 py-3 border-t border-slate-800 bg-[#070B13] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded-md hover:border-slate-500 transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700/80 rounded-md hover:border-slate-500 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportJson(file);
              e.target.value = '';
            }}
          />
        </div>

        <button
          type="button"
          onClick={onResetDefaults}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          title="Restore initial baseline research state"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>
    </aside>
  );
}
