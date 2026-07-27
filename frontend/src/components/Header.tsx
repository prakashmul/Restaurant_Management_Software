import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className='ml-[300px] text-4xl text-extrabold'>
        <h1>Real Deal Restaurant and Bar</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-6 w-px bg-slate-800" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 border border-slate-600">
            BP
          </div>
          <div className="text-xs">
            <p className="font-semibold text-slate-200">Bishal Pariyar</p>
            <p className="text-slate-400">Owner</p>
          </div>
        </div>
      </div>
    </header>
  );
};

