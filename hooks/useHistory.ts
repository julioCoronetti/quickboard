import { useState, useCallback } from 'react';
import { Stroke } from '../types';

export const useHistory = (initialState: Stroke[][] = [[]]) => {
  const [history, setHistory] = useState<Stroke[][]>(initialState);
  const [historyIndex, setHistoryIndex] = useState(0);

  const strokes = history[historyIndex] || [];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const pushToHistory = useCallback((newStrokes: Stroke[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newStrokes);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => {
      const nextIndex = prev + 1;
      return nextIndex > 49 ? 49 : nextIndex;
    });
  }, [historyIndex]);

  const updateCurrentHistory = useCallback((updatedStrokes: Stroke[]) => {
    setHistory(prev => {
      const newHistory = [...prev];
      newHistory[historyIndex] = updatedStrokes;
      return newHistory;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (canUndo) setHistoryIndex(prev => prev - 1);
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) setHistoryIndex(prev => prev + 1);
  }, [canRedo]);

  const clear = useCallback(() => {
    pushToHistory([]);
  }, [pushToHistory]);

  return {
    strokes,
    pushToHistory,
    updateCurrentHistory,
    undo,
    redo,
    clear,
    canUndo,
    canRedo
  };
};