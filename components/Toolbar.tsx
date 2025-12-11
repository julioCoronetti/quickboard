import React from 'react';
import { 
  Pencil, MousePointer2, Eraser, Trash2, 
  Square, Circle, MoveUpRight, Undo2, Redo2, Sun, Moon 
} from 'lucide-react';
import { ToolType, Theme } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  setTool: (tool: ToolType) => void;
  currentColor: string;
  setColor: (color: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  theme: Theme;
  toggleTheme: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  setTool,
  onClear,
  onUndo,
  onRedo,
  theme,
  toggleTheme,
  canUndo,
  canRedo
}) => {
  const isDark = theme === 'dark';
  const bgColor = isDark ? 'bg-gray-800/90 border-gray-700' : 'bg-white/90 border-gray-200';
  const textColor = isDark ? 'text-gray-400' : 'text-gray-600';
  const activeBg = isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white';
  const hoverBg = isDark ? 'hover:bg-gray-700 hover:text-white' : 'hover:bg-gray-100 hover:text-gray-900';

  const ButtonClass = (isActive: boolean) => 
    `p-2.5 rounded-lg transition-all ${
      isActive 
        ? `${activeBg} shadow-md scale-105` 
        : `${textColor} ${hoverBg}`
    }`;

  return (
    <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 ${bgColor} backdrop-blur-sm border p-2 rounded-2xl shadow-2xl flex items-center gap-3 z-50 transition-colors duration-300`}>
      
      {/* History Group */}
      <div className="flex gap-1 pr-2 border-r border-gray-600/30">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-lg transition-all ${!canUndo ? 'opacity-30 cursor-not-allowed ' + textColor : textColor + ' ' + hoverBg}`}
          title="Desfazer"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-lg transition-all ${!canRedo ? 'opacity-30 cursor-not-allowed ' + textColor : textColor + ' ' + hoverBg}`}
          title="Refazer"
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Tools Group */}
      <div className={`flex ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'} rounded-xl p-1 gap-1`}>
        <button onClick={() => setTool('select')} className={ButtonClass(currentTool === 'select')} title="Selecionar">
          <MousePointer2 size={18} />
        </button>
        <div className="w-px h-6 bg-gray-500/30 self-center mx-1" />
        <button onClick={() => setTool('chalk')} className={ButtonClass(currentTool === 'chalk')} title="Lápis">
          <Pencil size={18} />
        </button>
        <button onClick={() => setTool('rect')} className={ButtonClass(currentTool === 'rect')} title="Quadrado">
          <Square size={18} />
        </button>
        <button onClick={() => setTool('circle')} className={ButtonClass(currentTool === 'circle')} title="Círculo">
          <Circle size={18} />
        </button>
        <button onClick={() => setTool('arrow')} className={ButtonClass(currentTool === 'arrow')} title="Seta">
          <MoveUpRight size={18} />
        </button>
        <div className="w-px h-6 bg-gray-500/30 self-center mx-1" />
        <button onClick={() => setTool('eraser')} className={ButtonClass(currentTool === 'eraser')} title="Borracha">
          <Eraser size={18} />
        </button>
      </div>

      <div className="w-px h-8 bg-gray-600/30 mx-1" />

      {/* Actions Group */}
      <div className="flex gap-2 items-center">
        <button
          onClick={toggleTheme}
          className={`p-2.5 rounded-lg transition-all ${textColor} ${hoverBg}`}
          title={isDark ? "Modo Claro" : "Modo Escuro"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          onClick={onClear}
          className="p-2.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100/50 transition-all"
          title="Limpar lousa"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};