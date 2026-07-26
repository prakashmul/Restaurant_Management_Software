import type { OrderItem } from '../types';

interface CartDrawerProps {
  items: OrderItem[];
  onUpdateQty: (menuItemId: string, delta: number) => void;
}

export const CartDrawer = ({ items, onUpdateQty }: CartDrawerProps) => {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-4">
      <h3 className="font-bold text-slate-200 text-sm">Current Order</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.menuItemId} className="flex justify-between items-center text-xs">
            <span className="text-slate-300">{item.name}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdateQty(item.menuItemId, -1)}
                className="w-5 h-5 bg-slate-800 text-slate-200 rounded"
              >
                -
              </button>
              <span className="font-mono">{item.quantity}</span>
              <button
                onClick={() => onUpdateQty(item.menuItemId, 1)}
                className="w-5 h-5 bg-slate-800 text-slate-200 rounded"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 pt-2 font-bold text-xs flex justify-between">
        <span>Total:</span>
        <span className="text-indigo-400">${total.toFixed(2)}</span>
      </div>
    </div>
  );
};