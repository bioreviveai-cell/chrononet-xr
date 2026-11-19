export type StageId = 1 | 2 | 3;

export type TaskCadence = 'Daily' | 'Weekly' | 'Milestone';
export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Done';

export interface ResearchTask {
  id: string;
  title: string;
  stage: StageId;
  cadence: TaskCadence;
  status: TaskStatus;
  metricNote: string;
  updatedAt: string;
}

export type HallmarkId =
  | 'genomic'
  | 'senescence'
  | 'mitochondrial'
  | 'telomere'
  | 'proteostasis';

export interface HallmarkModule {
  id: HallmarkId;
  name: string;
  shortName: string;
  color: string;
  localCenter: [number, number, number];
  radius: number;
  zScore: number;
  pValue: string;
  seedCount: number;
  lccRatio: number;
  description: string;
}

export interface ProteinNode {
  id: string;
  symbol: string;
  fullName: string;
  hallmarkId: HallmarkId;
  secondaryHallmarks?: HallmarkId[];
  degreeCentrality: number;
  betweennessCentrality: number;
  zScore: number;
  youngExpr: number;
  oldExpr: number;
  openGenesConfidence: 'High' | 'Moderate' | 'Curated';
  isBottleneck: boolean;
  isSeedGene: boolean;
  localOffset: [number, number, number];
  summary: string;
}

export interface ProteinEdge {
  source: string;
  target: string;
  isBridge: boolean;
  weight: number;
}

export interface InterventionToken {
  id: string;
  name: string;
  classification: 'Small Molecule' | 'Senolytic Cocktail' | 'Nutritional Dark Matter';
  color: string;
  targetHallmark: HallmarkId;
  targetGenes: string[];
  proximityZ: number;
  shortestDistance: number;
  reversalPct: number;
  mechanism: string;
  defaultLocalPos: [number, number, number];
}

export type SelectionTarget =
  | { kind: 'protein'; id: string }
  | { kind: 'hallmark'; id: HallmarkId }
  | { kind: 'intervention'; id: string }
  | { kind: 'stage'; id: StageId };

export interface ChronoNetSavedState {
  version: number;
  tasks: ResearchTask[];
  notes: Record<string, string>;
  ageFactor: number;
  deployedInterventions: Record<string, HallmarkId | null>;
}
