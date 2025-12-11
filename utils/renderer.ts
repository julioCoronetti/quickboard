import { Stroke, Theme, Point, ToolType, BoundingBox } from '../types';
import { getUnrotatedBounds, getCenter, getHandleCoords } from './geometry';

export const getRenderColor = (colorHex: string, theme: Theme) => {
  if (theme === 'light' && colorHex.toLowerCase() === '#ffffff') return '#000000';
  return colorHex;
};

export const renderStroke = (
  ctx: CanvasRenderingContext2D, 
  stroke: Stroke, 
  theme: Theme, 
  tool: ToolType,
  isSelected: boolean
) => {
  const bounds = getUnrotatedBounds(stroke);
  const center = getCenter(bounds);

  ctx.save();
  
  // Move to center, rotate, move back to origin (conceptually)
  // Actually, we just move to center, rotate, and draw relative to center
  ctx.translate(center.x, center.y);
  ctx.rotate(stroke.rotation);
  ctx.translate(-center.x, -center.y);

  ctx.beginPath();
  ctx.strokeStyle = getRenderColor(stroke.color, theme);
  ctx.lineWidth = stroke.width;
  
  // Draw Shadow/Glow if selected
  if (isSelected && tool === 'select') {
    ctx.shadowColor = theme === 'dark' ? '#3b82f6' : '#2563eb';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = theme === 'dark' ? '#60a5fa' : '#3b82f6';
  } else {
    ctx.shadowBlur = 0;
  }

  const { x: ox, y: oy } = stroke.position;
  const pts = stroke.points;

  if (stroke.type === 'freehand') {
    if (pts.length < 2) {
        ctx.restore();
        return;
    }
    ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    }
  } else if (stroke.type === 'rect') {
    if (pts.length < 2) {
        ctx.restore();
        return;
    }
    // Logic: pts are [start, end] relative to offset ox,oy
    // Currently points are normalized, so start is usually 0,0 and end is w,h
    // ox,oy is top left.
    const w = bounds.width;
    const h = bounds.height;
    ctx.rect(bounds.x, bounds.y, w, h);
  } else if (stroke.type === 'circle') {
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
  } else if (stroke.type === 'arrow') {
     // Arrow is tricky because points[0] and [1] define start/end, not a box
     // We just draw the line from p1 to p2
     if (pts.length < 2) {
         ctx.restore();
         return;
     }
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
  ctx.restore();

  // Draw Selection Handles (Overlay, so we don't rotate with the shape context except for position calculation)
  if (isSelected && tool === 'select') {
    renderSelectionHandles(ctx, stroke);
  }
};

const renderSelectionHandles = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  const handles = getHandleCoords(stroke);
  const handleSize = 8;
  
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0; // No shadow for handles

  const drawSquareHandle = (p: Point) => {
    ctx.beginPath();
    ctx.rect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
    ctx.fill();
    ctx.stroke();
  };

  const drawCircleHandle = (p: Point) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  // Rotation Line
  ctx.beginPath();
  const bounds = getUnrotatedBounds(stroke);
  const center = getCenter(bounds);
  // Calculate top-center of unrotated box
  const topCenter = { x: center.x, y: bounds.y }; 
  // Rotate it to match shape
  const rotatedTopCenter = {
      x: center.x + (topCenter.x - center.x) * Math.cos(stroke.rotation) - (topCenter.y - center.y) * Math.sin(stroke.rotation),
      y: center.y + (topCenter.x - center.x) * Math.sin(stroke.rotation) + (topCenter.y - center.y) * Math.cos(stroke.rotation)
  };
  
  ctx.moveTo(rotatedTopCenter.x, rotatedTopCenter.y);
  ctx.lineTo(handles.rot.x, handles.rot.y);
  ctx.stroke();

  // Draw Corners
  drawSquareHandle(handles.nw);
  drawSquareHandle(handles.ne);
  drawSquareHandle(handles.sw);
  drawSquareHandle(handles.se);
  
  // Draw Edges
  drawSquareHandle(handles.n);
  drawSquareHandle(handles.s);
  drawSquareHandle(handles.e);
  drawSquareHandle(handles.w);

  drawCircleHandle(handles.rot); // Rotation handle is round

  ctx.restore();
};

export const renderSelectionBox = (ctx: CanvasRenderingContext2D, bounds: BoundingBox) => {
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

export const clearCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};