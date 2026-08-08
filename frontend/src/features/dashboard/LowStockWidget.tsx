import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { posApi } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import type { InventoryItem } from '../../types';

export const LowStockWidget: React.FC = () => {
  const { hasPermission, currentLocation } = useAuth();
  const canView = hasPermission('stock.view');

  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await posApi.getInventory();
      setLowStockItems(Array.isArray(data) ? data.filter((item) => item.isLowStock) : []);
    } catch (err) {
      console.error('Failed to load low-stock items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, currentLocation?.id]);

  useRealtimeRefresh(['inventory'], () => canView && load());

  if (!canView || loading || lowStockItems.length === 0) return null;

  return (
    <div className="print:hidden bg-amber-500/[0.04] border border-amber-500/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-300">
          Low Stock Alert — {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'items'} below threshold
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {lowStockItems.map((item) => {
          const itemId = item._id || item.id;
          return (
            <span
              key={itemId}
              title={`Alert threshold: ${item.lowStockThreshold} ${item.unit}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-amber-500/20 rounded-xl text-xs"
            >
              <span className="font-semibold text-slate-200">{item.name}</span>
              <span className="text-rose-400 font-mono">
                {(item.totalQuantity || 0).toFixed(2)} {item.unit}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
