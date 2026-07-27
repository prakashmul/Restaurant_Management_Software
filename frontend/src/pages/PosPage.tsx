import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, User, CreditCard, UtensilsCrossed, XCircle, Filter } from 'lucide-react';
import { posApi } from '../api/posApi';
import { TableDetailModal } from '../components/TableDetailModal';
import type { Table, MenuItem, OrderItem, Order } from '../types';

export const PosPage = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentCart, setCurrentCart] = useState<OrderItem[]>([]);
  
  // Category Filtering State
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Modal States
  const [showTableModal, setShowTableModal] = useState(false);
  const [modalTable, setModalTable] = useState<Table | null>(null);

  // New Table Form States
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableSeats, setNewTableSeats] = useState('4');

  const loadData = async () => {
    try {
      const [tbls, mnu, ords] = await Promise.all([
        posApi.getTables(),
        posApi.getMenu(),
        posApi.getOrders(),
      ]);
      setTables(tbls || []);
      setMenu(mnu || []);
      setOrders(ords || []);

      if (tbls && tbls.length > 0 && !selectedTable) {
        setSelectedTable(tbls[0]);
      }
    } catch (err) {
      console.error('Failed to connect to POS Server:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync cart when active table changes safely
  useEffect(() => {
    if (selectedTable) {
      const selectedId = selectedTable._id || selectedTable.id;
      const activeOrder = orders.find(
        (o) => o.tableId === selectedId && o.status === 'pending'
      );
      setCurrentCart(activeOrder?.items || []);
    }
  }, [selectedTable, orders]);

  const handleTableCardClick = (tbl: Table) => {
    setSelectedTable(tbl);
    setModalTable(tbl);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNum) return;
    try {
      const created = await posApi.createTable(parseInt(newTableNum, 10), parseInt(newTableSeats, 10));
      setTables((prev) => [...prev, created]);
      setSelectedTable(created);
      setShowTableModal(false);
      setNewTableNum('');
    } catch (err) {
      alert('Failed to create table');
    }
  };

  const handleDeleteTable = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await posApi.deleteTable(id);
      setTables((prev) => prev.filter((t) => (t._id || t.id) !== id));
      if ((selectedTable?._id || selectedTable?.id) === id) setSelectedTable(null);
      if ((modalTable?._id || modalTable?.id) === id) setModalTable(null);
    } catch (err) {
      alert('Failed to delete table');
    }
  };

  const addToCart = (item: MenuItem) => {
    if (!selectedTable) return alert('Please select a table first!');

    // Robust extraction of ID string
    const itemId = String(item._id || item.id || '');
    if (!itemId) return;

    setCurrentCart((prev) => {
      const existing = prev.find((i) => i.menuItemId === itemId);
      if (existing) {
        return prev.map((i) => (i.menuItemId === itemId ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { menuItemId: itemId, name: item.name, price: item.price || 0, quantity: 1 }];
    });
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCurrentCart((prev) =>
      prev
        .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleCancelOrder = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable._id || selectedTable.id || '';

    if (window.confirm(`Are you sure you want to cancel all items for Table #${selectedTable.number}?`)) {
      try {
        await posApi.cancelTableOrder(tableId);
        setCurrentCart([]);
        await loadData();
      } catch (err) {
        alert('Failed to clear order.');
      }
    }
  };

  const handleSaveOrder = async () => {
    if (!selectedTable || currentCart.length === 0) return;
    const tableId = selectedTable._id || selectedTable.id || '';

    try {
      await posApi.saveOrder(tableId, currentCart);
      await loadData();
      alert(`Order saved for Table #${selectedTable.number}`);
    } catch (err) {
      console.error('Save order failed:', err);
      alert('Failed to save order.');
    }
  };

  const handlePayBill = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable._id || selectedTable.id || '';

    try {
      if (currentCart.length > 0) {
        await posApi.saveOrder(tableId, currentCart);
        await loadData();
      }
      setModalTable(selectedTable);
    } catch (err) {
      console.error('Failed to prepare bill payment:', err);
      alert('Failed to open payment options.');
    }
  };

  const categories = ['All', ...Array.from(new Set(menu.map((item) => item.category)))];

  const filteredMenu = selectedCategory === 'All' 
    ? menu 
    : menu.filter((item) => item.category === selectedCategory);

  const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  // const tax = subtotal * 0.08;
  const total = subtotal ;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-100">
              <User className="w-5 h-5 text-indigo-400" />
              Select Dining Table
            </h2>
            <button
              onClick={() => setShowTableModal(true)}
              className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Table
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tables.map((tbl) => {
              const tblId = tbl._id || tbl.id || '';
              const selectedTblId = selectedTable?._id || selectedTable?.id;
              const isSelected = selectedTblId === tblId;
              const isOccupied = tbl.status === 'occupied';

              return (
                <div
                  key={tblId}
                  onClick={() => handleTableCardClick(tbl)}
                  className={`p-3.5 rounded-xl border cursor-pointer relative transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/50 text-indigo-200'
                      : isOccupied
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:border-amber-400'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm">Table #{tbl.number}</span>
                    <button
                      onClick={(e) => handleDeleteTable(tblId, e)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition"
                      title="Delete Table"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{tbl.seats} Seats</p>
                  <div className="mt-2 flex justify-between items-center">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isOccupied ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {isOccupied ? 'Occupied' : 'Available'}
                    </span>
                    {isSelected && <span className="text-[10px] text-indigo-400 font-bold">Active</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-800 pb-3 gap-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-indigo-400" />
              Menu Items
            </h2>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full sm:w-48"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTable && (
            <div className="mb-4 text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg flex justify-between items-center">
              <span>Adding order to: <strong>Table #{selectedTable.number}</strong></span>
              <span className="text-[10px] text-indigo-400">Showing: {selectedCategory}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredMenu.map((item) => {
              const uniqueMenuId = item._id || item.id;
              return (
                <div
                  key={uniqueMenuId}
                  onClick={() => addToCart(item)}
                  className="bg-slate-950 border border-slate-800 hover:border-indigo-500/60 p-3.5 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                      {item.category}
                    </span>
                    <h3 className="font-semibold text-sm text-slate-200 mt-0.5 group-hover:text-indigo-300 transition">
                      {item.name}
                    </h3>
                  </div>
                  <div className="mt-3 flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-slate-300">
                      Rs. {(item.price || 0).toFixed(0)}
                    </span>
                    <button className="bg-slate-800 group-hover:bg-indigo-600 text-slate-200 p-1.5 rounded-lg transition">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between h-min-h-screen">
        <div>
          <div className="border-b border-slate-800 pb-3 mb-4 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-base text-slate-100">
                {selectedTable ? `Table #${selectedTable.number} Order` : 'No Table Selected'}
              </h2>
              <p className="text-xs text-slate-400">Items added for current seat</p>
            </div>
            {currentCart.length > 0 && (
              <button
                onClick={handleCancelOrder}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg transition"
              >
                <XCircle className="w-3.5 h-3.5" /> Clear Order
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {currentCart.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-12">
                {selectedTable
                  ? `Click menu items on the left to add dishes to Table #${selectedTable.number}.`
                  : 'Select a table above to start taking orders.'}
              </div>
            ) : (
              currentCart.map((item) => (
                <div key={item.menuItemId} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">{item.name}</h4>
                    <span className="text-[10px] text-slate-400">Rs. {(item.price || 0).toFixed(0)} each</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-xs rounded font-bold transition text-slate-300"
                    >
                      -
                    </button>
                    <span className="text-xs font-mono font-bold w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.menuItemId, 1)}
                      className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-xs rounded font-bold transition text-slate-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-3 mt-4">
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono text-slate-200">Rs. {subtotal.toFixed(0)}</span>
            </div>
            {/* <div className="flex justify-between">
              <span>Tax (8%)</span>
              <span className="font-mono text-slate-200">Rs. {tax.toFixed(0)}</span>
            </div> */}
            <div className="flex justify-between text-sm font-bold text-slate-100 pt-2 border-t border-slate-800">
              <span>Total</span>
              <span className="font-mono text-indigo-400">Rs. {total.toFixed(0)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={handleSaveOrder}
              disabled={!selectedTable || currentCart.length === 0}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Save Order
            </button>
            <button
              onClick={handlePayBill}
              disabled={!selectedTable || currentCart.length === 0}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" /> Pay
            </button>
          </div>
        </div>
      </div>

      {modalTable && (
        <TableDetailModal
          table={modalTable}
          order={orders.find((o) => {
            const modalId = modalTable._id || modalTable.id;
            return (o.tableId === modalId) && (o.status === 'pending' || o.status === 'unsettled');
          })}
          onClose={() => setModalTable(null)}
          onAddItems={() => {
            setSelectedTable(modalTable);
            setModalTable(null);
          }}
          onPayOrder={async (orderId: string, paymentMethod: string, customerDetails?: { customerName: string; customerPhone: string }) => {
            if (paymentMethod === 'credit') {
              if (customerDetails) {
                await posApi.processFullCredit(orderId, customerDetails.customerName, customerDetails.customerPhone);
              }
            } else {
              await posApi.payOrder(orderId, paymentMethod);
            }
            setCurrentCart([]);
            setModalTable(null);
            await loadData();
          }}
          onVoidOrder={async (tableId: string) => {
            await posApi.cancelTableOrder(tableId);
            setCurrentCart([]);
            setModalTable(null);
            await loadData();
          }}
        />
      )}

      {showTableModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateTable} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-100">Create New Table</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Table Number</label>
              <input
                type="number"
                required
                value={newTableNum}
                onChange={(e) => setNewTableNum(e.target.value)}
                placeholder="e.g. 5"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Seating Capacity</label>
              <input
                type="number"
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition">
                Save Table
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};