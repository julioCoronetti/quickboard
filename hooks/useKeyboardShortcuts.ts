import { useEffect } from 'react';
import { ToolType, BlackboardRef } from '../types';

interface UseKeyboardShortcutsProps {
  setCurrentTool: (tool: ToolType) => void;
  blackboardRef: React.RefObject<BlackboardRef | null>;
}

export const useKeyboardShortcuts = ({ setCurrentTool, blackboardRef }: UseKeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      switch (e.key.toLowerCase()) {
        case 'p':
          setCurrentTool('chalk');
          break;
        case 'v':
        case 's':
          setCurrentTool('select');
          break;
        case 'e':
          setCurrentTool('eraser');
          break;
        case 'r':
          setCurrentTool('rect');
          break;
        case 'c':
          setCurrentTool('circle');
          break;
        case 'a':
          setCurrentTool('arrow');
          break;
        case 'delete':
        case 'backspace':
          blackboardRef.current?.deleteSelected();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentTool, blackboardRef]);
};