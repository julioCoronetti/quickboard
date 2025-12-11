import { Point, Stroke, BoundingBox, ResizeHandle } from '../types';

// --- Basic Math ---

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export const rotatePoint = (p: Point, center: Point, angle: number): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos)
  };
};

export const getCenter = (box: BoundingBox): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
});

// --- Stroke Bounds & Geometry ---

// Get the unrotated bounding box based on points + position
export const getUnrotatedBounds = (stroke: Stroke): BoundingBox => {
  const { position, points } = stroke;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  if (points.length === 0) return { x: position.x, y: position.y, width: 0, height: 0 };

  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  return {
    x: minX + position.x,
    y: minY + position.y,
    width: maxX - minX,
    height: maxY - minY
  };
};

export const getStrokeCenter = (stroke: Stroke): Point => {
  return getCenter(getUnrotatedBounds(stroke));
};

// --- Hit Testing ---

// Hit test handles for resizing/rotating
export const getHandleCoords = (stroke: Stroke): Record<ResizeHandle, Point> => {
  const bounds = getUnrotatedBounds(stroke);
  const center = getCenter(bounds);
  const { rotation } = stroke;

  // Unrotated corners relative to center
  const nw = { x: bounds.x, y: bounds.y };
  const ne = { x: bounds.x + bounds.width, y: bounds.y };
  const se = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  const sw = { x: bounds.x, y: bounds.y + bounds.height };
  
  // Midpoints
  const n = { x: bounds.x + bounds.width / 2, y: bounds.y };
  const s = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
  const e = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
  const w = { x: bounds.x, y: bounds.y + bounds.height / 2 };

  const rot = { x: bounds.x + bounds.width / 2, y: bounds.y - 30 }; // Handle stick

  // Rotate them
  return {
    nw: rotatePoint(nw, center, rotation),
    ne: rotatePoint(ne, center, rotation),
    se: rotatePoint(se, center, rotation),
    sw: rotatePoint(sw, center, rotation),
    n: rotatePoint(n, center, rotation),
    s: rotatePoint(s, center, rotation),
    e: rotatePoint(e, center, rotation),
    w: rotatePoint(w, center, rotation),
    rot: rotatePoint(rot, center, rotation),
  };
};

export const hitTestHandles = (stroke: Stroke, p: Point, scale = 1): ResizeHandle | null => {
  const handles = getHandleCoords(stroke);
  const threshold = 10 / scale; // Adjust based on zoom if needed, currently 1

  if (distance(p, handles.rot) < threshold) return 'rot';
  
  if (distance(p, handles.nw) < threshold) return 'nw';
  if (distance(p, handles.ne) < threshold) return 'ne';
  if (distance(p, handles.se) < threshold) return 'se';
  if (distance(p, handles.sw) < threshold) return 'sw';

  if (distance(p, handles.n) < threshold) return 'n';
  if (distance(p, handles.s) < threshold) return 's';
  if (distance(p, handles.e) < threshold) return 'e';
  if (distance(p, handles.w) < threshold) return 'w';

  return null;
};

// Main Hit Test
export const hitTestStroke = (stroke: Stroke, p: Point, threshold: number = 10): boolean => {
  const bounds = getUnrotatedBounds(stroke);
  const center = getCenter(bounds);
  
  // Rotate point backwards to test against unrotated axis-aligned shape
  const localP = rotatePoint(p, center, -stroke.rotation);
  
  // Shift localP to be relative to the stroke position for point comparison
  const relativeP = {
    x: localP.x - stroke.position.x,
    y: localP.y - stroke.position.y
  };

  const { points, type } = stroke;

  // Bounding box check first for optimization
  if (localP.x < bounds.x - threshold || localP.x > bounds.x + bounds.width + threshold ||
      localP.y < bounds.y - threshold || localP.y > bounds.y + bounds.height + threshold) {
    return false;
  }

  if (type === 'rect') {
     // Check if point is near borders of the rect
     const minX = bounds.x;
     const maxX = bounds.x + bounds.width;
     const minY = bounds.y;
     const maxY = bounds.y + bounds.height;
     
     // Check borders (hollow rect)
     const onVertical = (localP.y >= minY - threshold && localP.y <= maxY + threshold) && 
                        (Math.abs(localP.x - minX) < threshold || Math.abs(localP.x - maxX) < threshold);
     const onHorizontal = (localP.x >= minX - threshold && localP.x <= maxX + threshold) && 
                          (Math.abs(localP.y - minY) < threshold || Math.abs(localP.y - maxY) < threshold);
     
     return onVertical || onHorizontal;
  } else if (type === 'circle') {
     const radiusX = bounds.width / 2;
     const radiusY = bounds.height / 2;
     // Ellipse equation: (x-cx)^2/rx^2 + (y-cy)^2/ry^2 = 1
     const normX = (localP.x - center.x);
     const normY = (localP.y - center.y);
     
     // Check if point is on the perimeter (approximate)
     const dist = (normX * normX) / (radiusX * radiusX) + (normY * normY) / (radiusY * radiusY);
     return Math.abs(dist - 1) < 0.2; // Tolerance for ellipse stroke
  } else if (type === 'freehand' || type === 'arrow') {
    // For freehand/arrow, check distance to segments
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      if (distanceToSegment(relativeP, p1, p2) < threshold) return true;
    }
    return false;
  }
  
  return false;
};

// --- Helpers from previous version ---

export const distanceToSegment = (p: Point, v: Point, w: Point) => {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
};

export const normalizePoints = (points: Point[]): { points: Point[], offset: Point, width: number, height: number } => {
  if (points.length === 0) return { points: [], offset: { x: 0, y: 0 }, width: 0, height: 0 };
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => { 
    if (p.x < minX) minX = p.x; 
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; 
    if (p.y > maxY) maxY = p.y; 
  });

  const normalized = points.map(p => ({ x: p.x - minX, y: p.y - minY }));
  return { 
    points: normalized, 
    offset: { x: minX, y: minY },
    width: maxX - minX,
    height: maxY - minY
  };
};

export const getSelectionBoxBounds = (box: {start: Point, current: Point}): BoundingBox => {
  return {
    x: Math.min(box.start.x, box.current.x),
    y: Math.min(box.start.y, box.current.y),
    width: Math.abs(box.current.x - box.start.x),
    height: Math.abs(box.current.y - box.start.y)
  };
};

export const checkIntersection50Percent = (selection: BoundingBox, strokeBounds: BoundingBox): boolean => {
  // Simple AABB intersection for selection box (ignoring rotation for box selection simplicity)
  const xOverlap = Math.max(0, Math.min(selection.x + selection.width, strokeBounds.x + strokeBounds.width) - Math.max(selection.x, strokeBounds.x));
  const yOverlap = Math.max(0, Math.min(selection.y + selection.height, strokeBounds.y + strokeBounds.height) - Math.max(selection.y, strokeBounds.y));
  
  const intersectionArea = xOverlap * yOverlap;
  const strokeArea = strokeBounds.width * strokeBounds.height;

  if (strokeArea === 0) return false;
  return (intersectionArea / strokeArea) >= 0.5;
};

// Re-export needed for Blackboard
export const getStrokeBounds = getUnrotatedBounds;