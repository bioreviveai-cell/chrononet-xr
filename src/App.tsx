import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomControlDock } from './components/BottomControlDock';
import { SpatialInspector } from './components/SpatialInspector';
import { TaskDrawer } from './components/TaskDrawer';
import { TopBar } from './components/TopBar';
import {
  INITIAL_TASKS,
  INTERVENTION_TOKENS,
  STAGE_METADATA,
} from './data/agingNetwork';
import {
  ChronoNetSceneController,
  type CameraFocusView,
  type StageScreenAnchor,
} from './scene/ChronoNetScene';
import type {
  ChronoNetSavedState,
  HallmarkId,
  ResearchTask,
  SelectionTarget,
  StageId,
  TaskCadence,
  TaskStatus,
} from './types/chrononet';

const STORAGE_KEY = 'chrononet-xr-state-v1';

const DEFAULT_DEPLOYED: Record<string, HallmarkId | null> = {
  rapamycin: 'proteostasis',
  resveratrol: null,
  quercetin_dasatinib: null,
  spermidine: null,
};

function loadInitialState(): ChronoNetSavedState {
  const fallback: ChronoNetSavedState = {
    version: 1,
    tasks: INITIAL_TASKS,
    notes: {
      'protein:SIRT1':
        'Key NAD+-dependent bottleneck connecting mitochondrial biogenesis and SASP suppression.',
      'hallmark:mitochondrial':
        'Highest localization z-score (7.15) across curated OpenGenes seed pool.',
    },
    ageFactor: 0.65,
    deployedInterventions: DEFAULT_DEPLOYED,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ChronoNetSavedState>;
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return fallback;
    }
    return {
      version: 1,
      tasks: parsed.tasks,
      notes:
        parsed.notes && typeof parsed.notes === 'object'
          ? parsed.notes
          : fallback.notes,
      ageFactor:
        typeof parsed.ageFactor === 'number'
          ? Math.min(1, Math.max(0, parsed.ageFactor))
          : fallback.ageFactor,
      deployedInterventions:
        parsed.deployedInterventions &&
        typeof parsed.deployedInterventions === 'object'
          ? parsed.deployedInterventions
          : fallback.deployedInterventions,
    };
  } catch {
    return fallback;
  }
}

export default function App() {
  const initialState = useMemo(() => loadInitialState(), []);

  const [tasks, setTasks] = useState<ResearchTask[]>(initialState.tasks);
  const [notes, setNotes] = useState<Record<string, string>>(initialState.notes);
  const [ageFactor, setAgeFactor] = useState<number>(initialState.ageFactor);
  const [deployedInterventions, setDeployedInterventions] = useState<
    Record<string, HallmarkId | null>
  >(initialState.deployedInterventions);

  const [activeView, setActiveView] = useState<CameraFocusView>('overview');
  const [selectedTarget, setSelectedTarget] = useState<SelectionTarget | null>(
    null,
  );
  const [tasksOpen, setTasksOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<'all' | StageId>('all');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [xrSupported, setXrSupported] = useState(false);
  const [xrMode, setXrMode] = useState<'immersive-vr' | 'immersive-ar'>(
    'immersive-vr',
  );
  const [xrActive, setXrActive] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [stageAnchors, setStageAnchors] = useState<StageScreenAnchor[]>([]);

  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChronoNetSceneController | null>(null);

  const stageProgress = useMemo<Record<StageId, number>>(() => {
    const calc = (stage: StageId) => {
      const list = tasks.filter((t) => t.stage === stage);
      if (list.length === 0) return 0;
      const done = list.filter((t) => t.status === 'Done').length;
      return done / list.length;
    };
    return { 1: calc(1), 2: calc(2), 3: calc(3) };
  }, [tasks]);

  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === 'Done').length,
    [tasks],
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      const payload: ChronoNetSavedState = {
        version: 1,
        tasks,
        notes,
        ageFactor,
        deployedInterventions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [tasks, notes, ageFactor, deployedInterventions]);

  // Stable callbacks ref for Three.js scene mount
  const callbacksRef = useRef({
    onSelect: (target: SelectionTarget | null) => {
      setSelectedTarget(target);
    },
    onDeployIntervention: (tokenId: string, targetHallmark: HallmarkId | null) => {
      setDeployedInterventions((prev) => ({
        ...prev,
        [tokenId]: targetHallmark,
      }));
      const token = INTERVENTION_TOKENS.find((t) => t.id === tokenId);
      if (token) {
        showToast(
          targetHallmark
            ? `${token.name} deployed to ${targetHallmark} module`
            : `${token.name} returned to compound tray`,
        );
      }
    },
    onStageAnchorsUpdate: (anchors: StageScreenAnchor[]) => {
      setStageAnchors(anchors);
    },
    onXrStateChange: (active: boolean) => {
      setXrActive(active);
    },
    onContextLost: (lost: boolean) => {
      setContextLost(lost);
    },
  });

  // Initialize Three.js + WebXR Scene once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const controller = new ChronoNetSceneController(
      mount,
      {
        stageProgress,
        ageFactor,
        deployedInterventions,
        selectedTarget,
      },
      {
        onSelect: (t) => callbacksRef.current.onSelect(t),
        onDeployIntervention: (id, hm) =>
          callbacksRef.current.onDeployIntervention(id, hm),
        onStageAnchorsUpdate: (anchors) =>
          callbacksRef.current.onStageAnchorsUpdate(anchors),
        onXrStateChange: (active) =>
          callbacksRef.current.onXrStateChange(active),
        onContextLost: (lost) => callbacksRef.current.onContextLost(lost),
      },
    );

    sceneRef.current = controller;

    controller.checkXrSupport().then((res) => {
      setXrSupported(res.supported);
      if (res.mode) setXrMode(res.mode);
    });

    return () => {
      controller.dispose();
      sceneRef.current = null;
    };
    // Intentionally mounted once so React UI updates never rebuild the WebGL context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push reactive state changes into Three.js controller
  useEffect(() => {
    sceneRef.current?.updateState({
      stageProgress,
      ageFactor,
      deployedInterventions,
      selectedTarget,
    });
  }, [stageProgress, ageFactor, deployedInterventions, selectedTarget]);

  const handleFocusView = useCallback((view: CameraFocusView) => {
    setActiveView(view);
    sceneRef.current?.focusView(view);
  }, []);

  const handleToggleIntervention = useCallback(
    (tokenId: string, defaultHallmark: HallmarkId) => {
      setDeployedInterventions((prev) => {
        const nextTarget = prev[tokenId] ? null : defaultHallmark;
        return { ...prev, [tokenId]: nextTarget };
      });
    },
    [],
  );

  const handleToggleTaskDone = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: t.status === 'Done' ? 'To Do' : 'Done',
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
  }, []);

  const handleChangeTaskStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status, updatedAt: new Date().toISOString() }
            : t,
        ),
      );
    },
    [],
  );

  const handleAddTask = useCallback(
    (
      title: string,
      stage: StageId,
      cadence: TaskCadence,
      metricNote: string,
    ) => {
      const next: ResearchTask = {
        id: `task-${Date.now()}`,
        title,
        stage,
        cadence,
        status: 'To Do',
        metricNote,
        updatedAt: new Date().toISOString(),
      };
      setTasks((prev) => [next, ...prev]);
      showToast(`Added Stage ${stage} research task`);
    },
    [showToast],
  );

  const handleDeleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const handleUpdateNote = useCallback((key: string, text: string) => {
    setNotes((prev) => ({ ...prev, [key]: text }));
  }, []);

  const handleExportJson = useCallback(() => {
    const payload: ChronoNetSavedState = {
      version: 1,
      tasks,
      notes,
      ageFactor,
      deployedInterventions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chrononet-xr-state-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported research state JSON');
  }, [tasks, notes, ageFactor, deployedInterventions, showToast]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(
            String(reader.result),
          ) as Partial<ChronoNetSavedState>;
          if (!Array.isArray(parsed.tasks)) {
            showToast('Invalid JSON format: missing tasks array');
            return;
          }
          setTasks(parsed.tasks);
          if (parsed.notes && typeof parsed.notes === 'object') {
            setNotes(parsed.notes);
          }
          if (typeof parsed.ageFactor === 'number') {
            setAgeFactor(Math.min(1, Math.max(0, parsed.ageFactor)));
          }
          if (
            parsed.deployedInterventions &&
            typeof parsed.deployedInterventions === 'object'
          ) {
            setDeployedInterventions(parsed.deployedInterventions);
          }
          showToast('Imported ChronoNet XR research state');
        } catch {
          showToast('Could not parse JSON file');
        }
      };
      reader.readAsText(file);
    },
    [showToast],
  );

  const handleResetDefaults = useCallback(() => {
    setTasks(INITIAL_TASKS);
    setAgeFactor(0.65);
    setDeployedInterventions(DEFAULT_DEPLOYED);
    showToast('Restored baseline aging network state');
  }, [showToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.key === 't' || e.key === 'T') {
        setTasksOpen((o) => !o);
      } else if (e.key === '0') {
        handleFocusView('overview');
      } else if (e.key === '1') {
        handleFocusView(1);
      } else if (e.key === '2') {
        handleFocusView(2);
      } else if (e.key === '3') {
        handleFocusView(3);
      } else if (e.key === 'Escape') {
        setSelectedTarget(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleFocusView]);

  return (
    <div className="relative w-full h-full bg-[#070A10] text-slate-100 overflow-hidden">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 z-0"
        aria-label="ChronoNet XR 3D Spatial Viewport"
      />

      {/* Projected Semantic Stage Labels */}
      {!xrActive && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          {stageAnchors.map((anchor) => {
            if (!anchor.visible) return null;
            const meta = STAGE_METADATA[anchor.id];
            const sTasks = tasks.filter((t) => t.stage === anchor.id);
            const sDone = sTasks.filter((t) => t.status === 'Done').length;
            const isFocused = activeView === anchor.id;

            return (
              <button
                key={anchor.id}
                type="button"
                onClick={() => handleFocusView(anchor.id)}
                style={{
                  transform: `translate(${Math.round(anchor.x)}px, ${Math.round(anchor.y)}px) translate(-50%, -100%)`,
                }}
                className={`pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded border text-left transition-colors whitespace-nowrap ${
                  isFocused
                    ? 'bg-[#0C1322]/95 border-sky-500/70 text-slate-100'
                    : 'bg-[#090D16]/85 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2 text-[11px] font-medium">
                  <span
                    className="w-1.5 h-1.5 rounded-sm shrink-0"
                    style={{ backgroundColor: meta.accentColor }}
                  />
                  <span>{meta.name}</span>
                  <span className="font-mono-tabular text-slate-400">
                    {sDone}/{sTasks.length}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 bg-[#070A10]/95 flex items-center justify-center p-6">
          <div className="max-w-md border border-slate-800 bg-[#0B101A] rounded-lg p-6 text-center">
            <h2 className="font-display text-base font-semibold text-slate-100">
              3D Viewport Paused
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              The WebGL graphics context was suspended. Research tasks and notes
              remain safely stored in localStorage.
            </p>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <TopBar
        activeView={activeView}
        onFocusView={handleFocusView}
        tasksOpen={tasksOpen}
        onToggleTasks={() => setTasksOpen((o) => !o)}
        completedCount={completedCount}
        totalCount={tasks.length}
        xrSupported={xrSupported}
        xrActive={xrActive}
        onToggleXr={() => {
          sceneRef.current?.toggleXr(xrMode).catch(() => {
            showToast('Unable to start WebXR session');
          });
        }}
      />

      {/* Spatial Node / Block Inspector (Only visible when an item is selected) */}
      <SpatialInspector
        target={selectedTarget}
        onClose={() => setSelectedTarget(null)}
        onSelectTarget={(next) => setSelectedTarget(next)}
        notes={notes}
        onUpdateNote={handleUpdateNote}
        ageFactor={ageFactor}
        deployedInterventions={deployedInterventions}
        onToggleIntervention={handleToggleIntervention}
        tasks={tasks}
        onOpenStageTasks={(stage) => {
          setStageFilter(stage);
          setTasksOpen(true);
        }}
      />

      {/* Slide-Over Research Task Monitor Drawer */}
      <TaskDrawer
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        tasks={tasks}
        stageFilter={stageFilter}
        onChangeStageFilter={setStageFilter}
        onToggleTaskDone={handleToggleTaskDone}
        onChangeTaskStatus={handleChangeTaskStatus}
        onAddTask={handleAddTask}
        onDeleteTask={handleDeleteTask}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onResetDefaults={handleResetDefaults}
        onFocusStage={(stage) => handleFocusView(stage)}
      />

      {/* Collapsible Bottom Control Dock */}
      <BottomControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        ageFactor={ageFactor}
        onChangeAgeFactor={setAgeFactor}
        deployedInterventions={deployedInterventions}
        onToggleIntervention={handleToggleIntervention}
        onResetView={() => handleFocusView('overview')}
      />

      {/* Subtle Action Confirmation Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-18 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 text-xs font-medium text-slate-100 bg-[#0B111E]/95 border border-slate-700 rounded-md shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
