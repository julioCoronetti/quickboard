export type ToolType = 'chalk' | 'select' | 'eraser' | 'rect' | 'circle' | 'arrow';

export type StrokeType = 'freehand' | 'rect' | 'circle' | 'arrow';

export type Theme = 'dark' | 'light';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rot';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stroke {
  id: string;
  type: StrokeType;
  points: Point[]; // For shapes: [start, end]
  color: string;
  width: number;
  position: Point; // Top-left coordinate for moving
  rotation: number; // In radians
  isSelected?: boolean;
}

export interface AnalysisResult {
  text: string;
}

export interface BlackboardRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  deleteSelected: () => void;
  getPngDataUrl: () => string | null;
}