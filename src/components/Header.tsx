import React from 'react';
import { Search, Bell } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className='text-center text-2xl text-extrabold'>
        <h1>Real Deal Restaurant and Bar</h1>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
        </button>
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