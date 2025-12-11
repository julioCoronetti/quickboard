import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stroke, Point, ToolType, StrokeType, Theme, BlackboardRef, ResizeHandle } from '../types';
import { useHistory } from '../hooks/useHistory';
import { 
  getStrokeBounds, 
  getSelectionBoxBounds, 
  checkIntersection50Percent, 
  hitTestStroke, 
  normalizePoints,
  hitTestHandles,
  getCenter,
  rotatePoint,
  getUnrotatedBounds
} from '../utils/geometry';
import { renderStroke, renderSelectionBox, clearCanvas } from '../utils/renderer';

interface BlackboardProps {
  tool: ToolType;
  color: string;
  theme: Theme;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
}

// Helper to determine cursor based on rotation and handle type
const getCursorForHandle = (handle: ResizeHandle | null, rotation: number): string => {
  if (!handle) return 'default';
  if (handle === 'rot') return 'grab';

  let angle = 0;
  switch (handle) {
    case 'n': angle = 0; break;
    case 'ne': angle = 45; break;
    case 'e': angle = 90; break;
    case 'se': angle = 135; break;
    case 's': angle = 180; break;
    case 'sw': angle = 225; break;
    case 'w': angle = 270; break;
    case 'nw': angle = 315; break;
  }

  // Add object rotation (convert radians to degrees)
  angle += (rotation * 180 / Math.PI);
  
  // Normalize to 0-360
  angle = (angle % 360 + 360) % 360;

  if (angle < 22.5 || angle >= 337.5) return 'ns-resize';
  if (angle < 67.5) return 'nesw-resize';
  if (angle < 112.5) return 'ew-resize';
  if (angle < 157.5) return 'nwse-resize';
  if (angle < 202.5) return 'ns-resize';
  if (angle < 247.5) return 'nesw-resize';
  if (angle < 292.5) return 'ew-resize';
  return 'nwse-resize';
};

export const Blackboard = forwardRef<BlackboardRef, BlackboardProps>(({ 
  tool, 
  color,
  theme,
  onHistoryChange
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Logic Hooks
  const { 
    strokes, 
    pushToHistory, 
    updateCurrentHistory, 
    undo, 
    redo, 
    clear, 
    canUndo, 
    canRedo 
  } = useHistory();

  // Local Interaction State
  const [currentStroke, setCurrentStroke] = useState<Partial<Stroke> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  const [cursor, setCursor] = useState('default');
  
  // Transform State
  const [interactionState, setInteractionState] = useState<{
    type: 'drag' | 'resize' | 'rotate' | 'idle',
    handle?: ResizeHandle,
    startPos: Point,
    initialStrokes: Stroke[] // Snapshot for diffing
  }>({ type: 'idle', startPos: {x:0, y:0}, initialStrokes: [] });

  // Sync History state with parent
  useEffect(() => {
    onHistoryChange(canUndo, canRedo);
  }, [canUndo, canRedo, onHistoryChange]);

  // Expose API
  useImperativeHandle(ref, () => ({
    undo,
    redo,
    clear: () => {
      clear();
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

  // Helper: Get Coordinates
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

  // --- Rendering Loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    clearCanvas(ctx, canvas.width, canvas.height);

    // Draw History Strokes
    strokes.forEach(s => renderStroke(ctx, s, theme, tool, selectedStrokeIds.has(s.id)));

    // Draw Current Active Drawing
    if (currentStroke && currentStroke.points && currentStroke.points.length > 0) {
      const tempStroke: Stroke = {
        id: 'temp',
        type: currentStroke.type || 'freehand',
        points: currentStroke.points,
        color: currentStroke.color || color,
        width: currentStroke.width || 4,
        position: { x: 0, y: 0 },
        rotation: 0
      };
      renderStroke(ctx, tempStroke, theme, tool, false);
    }

    // Draw Selection Box (only when selecting multiple or empty space)
    if (selectionBox) {
      renderSelectionBox(ctx, getSelectionBoxBounds(selectionBox));
    }

  }, [strokes, currentStroke, selectionBox, theme, tool, selectedStrokeIds, color]);

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


  // --- Event Handlers ---

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    // 1. Drawing Tools
    if (['chalk', 'rect', 'circle', 'arrow'].includes(tool)) {
      setIsDrawing(true);
      setCurrentStroke({
        type: tool === 'chalk' ? 'freehand' : (tool as StrokeType),
        points: [coords],
        color: color,
        width: 4
      });
      setSelectedStrokeIds(new Set()); 
      return;
    } 

    // 2. Select Tool
    if (tool === 'select') {
      // A. Check for Handle Hits (only if 1 item selected)
      if (selectedStrokeIds.size === 1) {
        const id = Array.from(selectedStrokeIds)[0];
        const stroke = strokes.find(s => s.id === id);
        if (stroke) {
          const handle = hitTestHandles(stroke, coords);
          if (handle) {
            setInteractionState({
              type: handle === 'rot' ? 'rotate' : 'resize',
              handle: handle,
              startPos: coords,
              initialStrokes: JSON.parse(JSON.stringify(strokes)) // Deep copy
            });
            // Update cursor immediately
            setCursor(handle === 'rot' ? 'grabbing' : getCursorForHandle(handle, stroke.rotation));
            return;
          }
        }
      }

      // B. Check for Stroke Hits (Dragging)
      let clickedId: string | null = null;
      
      // Prioritize currently selected
      for (const id of Array.from(selectedStrokeIds)) {
        const stroke = strokes.find(s => s.id === id);
        if (stroke && hitTestStroke(stroke, coords)) {
          clickedId = id;
          break;
        }
      }
      
      // If not, check others (top to bottom z-index)
      if (!clickedId) {
        for (let i = strokes.length - 1; i >= 0; i--) {
          if (hitTestStroke(strokes[i], coords)) {
            clickedId = strokes[i].id;
            break;
          }
        }
      }

      if (clickedId) {
        if (!selectedStrokeIds.has(clickedId)) {
          setSelectedStrokeIds(new Set([clickedId]));
        }
        
        setInteractionState({
          type: 'drag',
          startPos: coords,
          initialStrokes: strokes 
        });
        setCursor('move');
      } else {
        // C. Start Selection Box
        setSelectedStrokeIds(new Set());
        setSelectionBox({ start: coords, current: coords });
        setCursor('crosshair');
      }
    } 
    
    // 3. Eraser
    else if (tool === 'eraser') {
       setIsDrawing(true);
       const remaining = strokes.filter(s => !hitTestStroke(s, coords));
       if (remaining.length !== strokes.length) pushToHistory(remaining);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    // --- Cursor Update Logic (When Idle) ---
    if (interactionState.type === 'idle' && tool === 'select') {
      let foundHandleCursor = false;
      if (selectedStrokeIds.size === 1) {
        const id = Array.from(selectedStrokeIds)[0];
        const stroke = strokes.find(s => s.id === id);
        if (stroke) {
          const handle = hitTestHandles(stroke, coords);
          if (handle) {
             setCursor(getCursorForHandle(handle, stroke.rotation));
             foundHandleCursor = true;
          }
        }
      }
      if (!foundHandleCursor) {
        // Check if over a shape
        let overShape = false;
        // Prioritize selected
        for (const id of Array.from(selectedStrokeIds)) {
           if (strokes.find(s => s.id === id && hitTestStroke(s, coords))) { overShape = true; break; }
        }
        if (!overShape) {
          for (const s of strokes) { if (hitTestStroke(s, coords)) { overShape = true; break; } }
        }
        setCursor(overShape ? 'move' : 'default');
      }
    }

    // --- Interaction Logic ---

    // Drawing
    if (isDrawing && currentStroke) {
      if (currentStroke.type === 'freehand') {
         setCurrentStroke(prev => ({ ...prev, points: [...(prev?.points || []), coords] }));
      } else {
        setCurrentStroke(prev => ({ ...prev, points: [prev!.points![0], coords] }));
      }
      return;
    } 
    
    // Select / Transform Tool
    if (tool === 'select') {
      const { type, startPos, initialStrokes, handle } = interactionState;
      
      if (type === 'drag') {
        const dx = coords.x - startPos.x;
        const dy = coords.y - startPos.y;

        const newStrokes = strokes.map(s => {
          if (selectedStrokeIds.has(s.id)) {
            return { ...s, position: { x: s.position.x + dx, y: s.position.y + dy } };
          }
          return s;
        });
        updateCurrentHistory(newStrokes);
        setInteractionState(prev => ({ ...prev, startPos: coords })); // Reset start for next frame delta
      } 
      else if (type === 'rotate' && selectedStrokeIds.size === 1) {
        const id = Array.from(selectedStrokeIds)[0];
        const initialStroke = initialStrokes.find(s => s.id === id);
        if (!initialStroke) return;

        const bounds = getUnrotatedBounds(initialStroke);
        const center = getCenter(bounds);
        
        const startAngle = Math.atan2(startPos.y - center.y, startPos.x - center.x);
        const currentAngle = Math.atan2(coords.y - center.y, coords.x - center.x);
        const deltaRotation = currentAngle - startAngle;
        
        const newStrokes = strokes.map(s => {
          if (s.id === id) {
            return { ...s, rotation: initialStroke.rotation + deltaRotation };
          }
          return s;
        });
        updateCurrentHistory(newStrokes);
      }
      else if (type === 'resize' && selectedStrokeIds.size === 1) {
        const id = Array.from(selectedStrokeIds)[0];
        const initialStroke = initialStrokes.find(s => s.id === id);
        if (!initialStroke) return;

        // Local resize logic
        const bounds = getUnrotatedBounds(initialStroke);
        const center = getCenter(bounds);
        
        const localMouse = rotatePoint(coords, center, -initialStroke.rotation);
        const localStart = rotatePoint(startPos, center, -initialStroke.rotation);
        
        const dx = localMouse.x - localStart.x;
        const dy = localMouse.y - localStart.y;
        
        let newX = bounds.x;
        let newY = bounds.y;
        let newW = bounds.width;
        let newH = bounds.height;

        // Apply changes based on handle type
        if (handle === 'se') {
            newW += dx; newH += dy;
        } else if (handle === 'sw') {
            newX += dx; newW -= dx; newH += dy;
        } else if (handle === 'ne') {
            newY += dy; newH -= dy; newW += dx;
        } else if (handle === 'nw') {
            newX += dx; newY += dy; newW -= dx; newH -= dy;
        } else if (handle === 'n') {
            newY += dy; newH -= dy;
        } else if (handle === 's') {
            newH += dy;
        } else if (handle === 'e') {
            newW += dx;
        } else if (handle === 'w') {
            newX += dx; newW -= dx;
        }
        
        if (newW < 10) newW = 10;
        if (newH < 10) newH = 10;
        
        const newStrokes = strokes.map(s => {
            if (s.id === id) {
                if (s.type === 'rect' || s.type === 'circle') {
                    return {
                        ...s,
                        position: { x: newX, y: newY },
                        points: [{x: 0, y: 0}, {x: newW, y: newH}]
                    };
                } else if (s.type === 'arrow') {
                    // Arrow scaling
                    const scaleX = newW / bounds.width;
                    const scaleY = newH / bounds.height;
                    
                     const scaledPoints = initialStroke.points.map(p => ({
                         x: (p.x * scaleX), 
                         y: (p.y * scaleY)
                     }));
                     
                     return {
                         ...s,
                         position: { x: newX, y: newY }, 
                         points: scaledPoints
                     };
                }
            }
            return s;
        });
        
        updateCurrentHistory(newStrokes);
      }
      else if (selectionBox) {
        setSelectionBox(prev => prev ? { ...prev, current: coords } : null);
      }
    } 
    
    // Eraser
    else if (tool === 'eraser' && isDrawing) {
      const remaining = strokes.filter(s => !hitTestStroke(s, coords));
      if (remaining.length !== strokes.length) {
         updateCurrentHistory(remaining);
      }
    }
  };

  const handleEnd = () => {
    // Finish Drawing
    if (isDrawing && currentStroke && currentStroke.points) {
      const pts = currentStroke.points;
      if (pts.length > 1 || (currentStroke.type === 'freehand' && pts.length > 0)) {
        const { points: normalizedPoints, offset } = normalizePoints(pts);
        
        const newStroke: Stroke = {
          id: Date.now().toString() + Math.random().toString(),
          type: currentStroke.type as StrokeType,
          points: normalizedPoints,
          color: currentStroke.color || color,
          width: currentStroke.width || 4,
          position: offset,
          rotation: 0
        };
        pushToHistory([...strokes, newStroke]);
      }
      setCurrentStroke(null);
      setIsDrawing(false);
    } 
    
    // Finish Transform/Select
    else if (tool === 'select') {
      if (interactionState.type !== 'idle') {
        if (interactionState.type !== 'drag' || interactionState.startPos) {
           pushToHistory([...strokes]);
        }
        setInteractionState({ type: 'idle', startPos: {x:0,y:0}, initialStrokes: [] });
      } 
      else if (selectionBox) {
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
    
    // Finish Eraser
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
        cursor: tool === 'select' ? cursor : tool === 'eraser' ? 'not-allowed' : 'crosshair'
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