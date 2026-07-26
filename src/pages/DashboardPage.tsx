import React from 'react';
import { TrendingUp, Receipt, AlertTriangle } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Daily Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white">$4,850.20</p>
          <p className="text-xs text-emerald-400 mt-1">+14.2% from yesterday</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Total Orders</span>
            <Receipt className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white">128</p>
          <p className="text-xs text-slate-400 mt-1">Average $37.89 per order</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Low Stock Items</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400">3 SKUs</p>
          <p className="text-xs text-slate-400 mt-1">Action required in inventory</p>
        </div>
      </div>
    </div>
  );
};