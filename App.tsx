import React, { useState, useRef } from 'react';
import { Blackboard } from './components/Blackboard';
import { Toolbar } from './components/Toolbar';
import { ToolType, Theme, BlackboardRef } from './types';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const App: React.FC = () => {
  const blackboardRef = useRef<BlackboardRef>(null);

  const [currentTool, setCurrentTool] = useState<ToolType>('chalk');
  const [currentColor, setCurrentColor] = useState<string>('#ffffff');
  const [theme, setTheme] = useState<Theme>('dark');
  
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useKeyboardShortcuts({
    setCurrentTool,
    blackboardRef
  });

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

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans transition-colors duration-500 ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Header/Title */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none select-none">
        <h1 className={`text-2xl font-bold font-sans ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
          Quickboard
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