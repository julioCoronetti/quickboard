import React, { useState, useRef, useEffect } from 'react';
import { Blackboard } from './components/Blackboard';
import { Toolbar } from './components/Toolbar';
import { ToolType, Theme, BlackboardRef } from './types';

const App: React.FC = () => {
  const blackboardRef = useRef<BlackboardRef>(null);

  const [currentTool, setCurrentTool] = useState<ToolType>('chalk');
  const [currentColor, setCurrentColor] = useState<string>('#ffffff');
  const [theme, setTheme] = useState<Theme>('dark');
  
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja apagar tudo?')) {
      blackboardRef.current?.clear();
    }
  };

  const handleUndo = () => blackboardRef.current?.undo();
  const handleRedo = () => blackboardRef.current?.redo();

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if user is typing in an input (though there are none currently)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Ignore if modifier keys are pressed (except delete might be used with them, but usually not needed here)
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
  }, []);

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans transition-colors duration-500 ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Header/Title */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
        <h1 className={`text-3xl font-bold opacity-50 tracking-widest font-serif ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
          Quickboard.fun
        </h1>
      </div>

      {/* Main Canvas Area */}
      <main className="flex-1 relative">
        <Blackboard 
          ref={blackboardRef}
          tool={currentTool} 
          color={currentColor}
          theme={theme}
          onHistoryChange={(undo, redo) => {
            setCanUndo(undo);
            setCanRedo(redo);
          }}
        />
      </main>

      {/* Floating Toolbar */}
      <Toolbar 
        currentTool={currentTool}
        setTool={setCurrentTool}
        currentColor={currentColor}
        setColor={setCurrentColor}
        onClear={handleClear}
        onUndo={handleUndo}
        onRedo={handleRedo}
        theme={theme}
        toggleTheme={toggleTheme}
        canUndo={canUndo}
        canRedo={canRedo}
      />
    </div>
  );
};

export default App;