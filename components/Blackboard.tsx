import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stroke, Point, ToolType, StrokeType, Theme, BlackboardRef } from '../types';

interface BlackboardProps {
  tool: ToolType;
  color: string;
  theme: Theme;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const Blackboard = forwardRef<BlackboardRef, BlackboardProps>(({ 
  tool, 
  color,
  theme,
  onHistoryChange
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const strokes = history[historyIndex] || [];
  
  const [currentStroke, setCurrentStroke] = useState<Partial<Stroke> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Selection State
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  
  // Dragging State
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [isDraggingObjects, setIsDraggingObjects] = useState(false);

  // Helper: Save state to history
  const pushToHistory = (newStrokes: Stroke[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newStrokes);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (historyIndex > 0) setHistoryIndex(prev => prev - 1);
    },
    redo: () => {
      if (historyIndex < history.length - 1) setHistoryIndex(prev => prev + 1);
    },
    clear: () => {
      pushToHistory([]);
      setSelectedStrokeIds(new Set());
    },
    deleteSelected: () => {
      if (selectedStrokeIds.size === 0) return;
      const remaining = strokes.filter(s => !selectedStrokeIds.has(s.id));
      pushToHistory(remaining);
      setSelectedStrokeIds(new Set());
    },
    getPngDataUrl: () => {
      if (!canvasRef.current) return null;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = theme === 'dark' ? '#1e293b' : '#ffffff';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(canvasRef.current, 0, 0);
      return tempCanvas.toDataURL('image/png');
    }
  }));

  useEffect(() => {
    onHistoryChange(historyIndex > 0, historyIndex < history.length - 1);
  }, [historyIndex, history.length, onHistoryChange]);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in event) {
      if (event.touches.length === 0) return null; 
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as React.MouseEvent).clientX;
      clientY = (event as React.MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getRenderColor = (colorHex: string) => {
    if (theme === 'light' && colorHex.toLowerCase() === '#ffffff') return '#000000';
    return colorHex;
  };

  // --- Geometry Helpers ---

  const distanceToSegment = (p: Point, v: Point, w: Point) => {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  // Get Bounding Box of a stroke in absolute coordinates
  const getStrokeBounds = (stroke: Stroke): BoundingBox => {
    const { position, points, type } = stroke;
    // Calculate relative bounds first
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (type === 'circle' && points.length >= 2) {
      // Circle logic: points[0] is start (corner), points[1] is end (corner of bounding box)
      // Actually in renderStroke for circle: center is mid of start/end, radii are half dists
      // The drawing logic defines a box from start to end.
      const start = points[0];
      const end = points[1];
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      
      minX = left; maxX = right; minY = top; maxY = bottom;
    } else {
      // Freehand, Rect, Arrow
      points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    }

    // Add position offset to get absolute bounds
    return {
      x: minX + position.x,
      y: minY + position.y,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  const getSelectionBoxBounds = (box: {start: Point, current: Point}): BoundingBox => {
    return {
      x: Math.min(box.start.x, box.current.x),
      y: Math.min(box.start.y, box.current.y),
      width: Math.abs(box.current.x - box.start.x),
      height: Math.abs(box.current.y - box.start.y)
    };
  };

  const checkIntersection50Percent = (selection: BoundingBox, stroke: BoundingBox): boolean => {
    // Intersection Rectangle
    const xOverlap = Math.max(0, Math.min(selection.x + selection.width, stroke.x + stroke.width) - Math.max(selection.x, stroke.x));
    const yOverlap = Math.max(0, Math.min(selection.y + selection.height, stroke.y + stroke.height) - Math.max(selection.y, stroke.y));
    
    const intersectionArea = xOverlap * yOverlap;
    const strokeArea = stroke.width * stroke.height;

    if (strokeArea === 0) return false; // Avoid division by zero for dots
    
    return (intersectionArea / strokeArea) >= 0.5;
  };

  const hitTestStroke = useCallback((stroke: Stroke, p: Point, threshold: number = 10): boolean => {
    const { position, points, type } = stroke;
    const absPoints = points.map(pt => ({ x: pt.x + position.x, y: pt.y + position.y }));

    if (type === 'freehand') {
      for (let i = 0; i < absPoints.length - 1; i++) {
        if (distanceToSegment(p, absPoints[i], absPoints[i+1]) < threshold) return true;
      }
      return false;
    } else if (type === 'rect') {
      const [start, end] = absPoints;
      const tl = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) };
      const br = { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) };
      const tr = { x: br.x, y: tl.y };
      const bl = { x: tl.x, y: br.y };
      
      return (
        distanceToSegment(p, tl, tr) < threshold ||
        distanceToSegment(p, tr, br) < threshold ||
        distanceToSegment(p, br, bl) < threshold ||
        distanceToSegment(p, bl, tl) < threshold
      );
    } else if (type === 'circle') {
      if (absPoints.length < 2) return false;
      const [start, end] = absPoints;
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;

      if (rx < threshold && ry < threshold) return Math.hypot(p.x - centerX, p.y - centerY) < threshold * 2;
      
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const outerRx = rx + threshold; const outerRy = ry + threshold;
      const innerRx = Math.max(0, rx - threshold); const innerRy = Math.max(0, ry - threshold);
      const inOuter = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy) <= 1;
      let inInner = false;
      if (innerRx > 0 && innerRy > 0) inInner = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy) <= 1;
      return inOuter && !inInner;
    } else if (type === 'arrow') {
      const [start, end] = absPoints;
      return distanceToSegment(p, start, end) < threshold;
    }
    return false;
  }, []);

  // --- Rendering ---
  const renderStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    ctx.beginPath();
    ctx.strokeStyle = getRenderColor(stroke.color);
    ctx.lineWidth = stroke.width;
    
    // Highlight if selected
    if (selectedStrokeIds.has(stroke.id) && tool === 'select') {
      ctx.shadowColor = theme === 'dark' ? '#3b82f6' : '#2563eb'; // Blue glow
      ctx.shadowBlur = 10;
      ctx.strokeStyle = theme === 'dark' ? '#60a5fa' : '#3b82f6'; // Lighter blue stroke when selected
    } else {
      ctx.shadowBlur = 0;
    }

    const { x: ox, y: oy } = stroke.position;
    const pts = stroke.points;

    if (stroke.type === 'freehand') {
      if (pts.length < 2) return;
      ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
      }
    } else if (stroke.type === 'rect') {
      if (pts.length < 2) return;
      const start = { x: pts[0].x + ox, y: pts[0].y + oy };
      const end = { x: pts[1].x + ox, y: pts[1].y + oy };
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (stroke.type === 'circle') {
      if (pts.length < 2) return;
      const start = { x: pts[0].x + ox, y: pts[0].y + oy };
      const end = { x: pts[1].x + ox, y: pts[1].y + oy };
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    } else if (stroke.type === 'arrow') {
      if (pts.length < 2) return;
      const start = { x: pts[0].x + ox, y: pts[0].y + oy };
      const end = { x: pts[1].x + ox, y: pts[1].y + oy };
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      const headLength = 20;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
    }
    
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
  }, [selectedStrokeIds, tool, theme]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw History Strokes
    strokes.forEach(s => renderStroke(ctx, s));

    // Draw Current Active Drawing
    if (currentStroke && currentStroke.points && currentStroke.points.length > 0) {
      const tempStroke: Stroke = {
        id: 'temp',
        type: currentStroke.type || 'freehand',
        points: currentStroke.points,
        color: currentStroke.color || color,
        width: currentStroke.width || 4,
        position: { x: 0, y: 0 },
      };
      renderStroke(ctx, tempStroke);
    }

    // Draw Selection Box
    if (selectionBox) {
      const bounds = getSelectionBoxBounds(selectionBox);
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // semi-transparent blue
      ctx.beginPath();
      ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

  }, [strokes, currentStroke, selectionBox, renderStroke, color]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        render();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);


  // --- Input Handlers ---

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    if (tool === 'chalk' || tool === 'rect' || tool === 'circle' || tool === 'arrow') {
      setIsDrawing(true);
      setCurrentStroke({
        type: tool === 'chalk' ? 'freehand' : tool,
        points: [coords],
        color: color,
        width: 4
      });
      setSelectedStrokeIds(new Set()); // Clear selection when drawing
    } 
    else if (tool === 'select') {
      // Check if clicked on an EXISTING selected item -> Drag Mode
      let clickedOnSelected = false;
      
      // First check items already in selection set to prioritize dragging existing selection
      for (const id of Array.from(selectedStrokeIds)) {
        const stroke = strokes.find(s => s.id === id);
        if (stroke && hitTestStroke(stroke, coords)) {
          clickedOnSelected = true;
          break;
        }
      }

      if (clickedOnSelected) {
        setIsDraggingObjects(true);
        setDragStartPos(coords);
      } else {
        // If not clicking a selected item, check if clicking ANY item
        let foundId: string | null = null;
        for (let i = strokes.length - 1; i >= 0; i--) {
          if (hitTestStroke(strokes[i], coords)) {
            foundId = strokes[i].id;
            break;
          }
        }

        if (foundId) {
          // Clicked on a new item -> Select only this item and start dragging
          setSelectedStrokeIds(new Set([foundId]));
          setIsDraggingObjects(true);
          setDragStartPos(coords);
        } else {
          // Clicked on empty space -> Start Selection Box
          // Clear current selection unless Shift key is handled (not implemented here)
          setSelectedStrokeIds(new Set());
          setSelectionBox({ start: coords, current: coords });
        }
      }
    } 
    else if (tool === 'eraser') {
       setIsDrawing(true);
       const remaining = strokes.filter(s => !hitTestStroke(s, coords));
       if (remaining.length !== strokes.length) pushToHistory(remaining);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    if (isDrawing && currentStroke) {
      if (currentStroke.type === 'freehand') {
         setCurrentStroke(prev => ({ ...prev, points: [...(prev?.points || []), coords] }));
      } else {
        setCurrentStroke(prev => ({ ...prev, points: [prev!.points![0], coords] }));
      }
    } 
    else if (tool === 'select') {
      if (isDraggingObjects && dragStartPos) {
        const dx = coords.x - dragStartPos.x;
        const dy = coords.y - dragStartPos.y;

        // Move all selected strokes
        const newStrokes = strokes.map(s => {
          if (selectedStrokeIds.has(s.id)) {
            return { ...s, position: { x: s.position.x + dx, y: s.position.y + dy } };
          }
          return s;
        });
        
        const newHistory = [...history];
        newHistory[historyIndex] = newStrokes;
        setHistory(newHistory);
        setDragStartPos(coords);
      } else if (selectionBox) {
        // Update selection box
        setSelectionBox(prev => prev ? { ...prev, current: coords } : null);
      }
    } 
    else if (tool === 'eraser' && isDrawing) {
      const remaining = strokes.filter(s => !hitTestStroke(s, coords));
      if (remaining.length !== strokes.length) {
         const newHistory = [...history];
         newHistory[historyIndex] = remaining;
         setHistory(newHistory);
      }
    }
  };

  const handleEnd = () => {
    if (isDrawing && currentStroke && currentStroke.points) {
      const pts = currentStroke.points;
      if (pts.length > 1 || (currentStroke.type === 'freehand' && pts.length > 0)) {
        let minX = Infinity, minY = Infinity;
        pts.forEach(p => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; });

        const normalizedPoints = pts.map(p => ({ x: p.x - minX, y: p.y - minY }));
        const newStroke: Stroke = {
          id: Date.now().toString() + Math.random().toString(),
          type: currentStroke.type as StrokeType,
          points: normalizedPoints,
          color: currentStroke.color || color,
          width: currentStroke.width || 4,
          position: { x: minX, y: minY }
        };
        pushToHistory([...strokes, newStroke]);
      }
      setCurrentStroke(null);
      setIsDrawing(false);
    } 
    else if (tool === 'select') {
      if (isDraggingObjects) {
        // Commit move
        pushToHistory([...strokes]);
        setIsDraggingObjects(false);
        setDragStartPos(null);
      } else if (selectionBox) {
        // Finalize Selection Box
        const bounds = getSelectionBoxBounds(selectionBox);
        const newSelection = new Set<string>();

        strokes.forEach(s => {
          const sBounds = getStrokeBounds(s);
          if (checkIntersection50Percent(bounds, sBounds)) {
            newSelection.add(s.id);
          }
        });

        setSelectedStrokeIds(newSelection);
        setSelectionBox(null);
      }
    } 
    else if (tool === 'eraser') {
      if (isDrawing) pushToHistory([...strokes]);
      setIsDrawing(false);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full overflow-hidden relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1e293b]' : 'bg-gray-100'}`}
      style={{
        backgroundImage: theme === 'dark' 
          ? "url('https://www.transparenttextures.com/patterns/black-scales.png')"
          : "url('https://www.transparenttextures.com/patterns/clean-gray-paper.png')",
        cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair'
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        className="block touch-none"
      />
    </div>
  );
});
