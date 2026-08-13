import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, User, CreditCard, UtensilsCrossed, XCircle, FolderPlus, ShoppingCart, ChevronUp, X } from 'lucide-react';
import { posApi } from '../../api/posApi';
import { TableDetailModal } from './TableDetailModal';
import { CategoryModal } from './CategoryModal';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { useOfflineQueueContext } from '../../offline/OfflineQueueContext';
import { useCurrency } from '../../hooks/useCurrency';
import type { Table, MenuItem, OrderItem, Order, InventoryItem } from '../../types';

// Helper function to safely extract string IDs across Mongo populated objects or standard strings
const getId = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return String(item._id || item.id || '');
};

export const PosPage = () => {
  const currency = useCurrency();
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<string[]>(['Appetizer']);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentCart, setCurrentCart] = useState<OrderItem[]>([]);

  // Mobile/tablet only — the cart lives in a slide-up sheet below lg instead
  // of a permanent column, opened from the persistent bottom bar.
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modal States
  const [showTableModal, setShowTableModal] = useState(false);
  const [modalTable, setModalTable] = useState<Table | null>(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryModal, setSelectedCategoryModal] = useState<string | null>(null);

  // New Table Form States
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableSeats, setNewTableSeats] = useState('4');

  const { saveOrderResilient, payOrderResilient } = useOfflineQueueContext();

  const loadData = async () => {
    try {
      const [tbls, mnu, ords, inv, cats] = await Promise.all([
        posApi.getTables(),
        posApi.getMenu(),
        posApi.getOrders(),
        posApi.getInventory(),
        posApi.getCategories().catch(() => []),
      ]);

      const fetchedTables = tbls || [];
      const fetchedOrders = ords || [];
      const fetchedMenu = mnu || [];

      setTables(fetchedTables);
      setMenu(fetchedMenu);
      setOrders(fetchedOrders);
      setInventoryList(inv || []);

      // Parse backend categories (handles string or CategoryItem objects)
      const parsedCats = (cats || []).map((c: any) => (typeof c === 'string' ? c : c.name)).filter(Boolean);

      // Derive categories from existing menu items while preserving backend categories
      const fetchedMenuCats = fetchedMenu.map((item) => item.category);
      const combined = Array.from(new Set([...parsedCats, ...fetchedMenuCats]));

      setCategories(combined.length > 0 ? combined : ['Appetizer']);

      // Sync selectedTable reference with newly loaded tables
      if (fetchedTables.length > 0) {
        setSelectedTable((prevSelected) => {
          if (!prevSelected) return fetchedTables[0];
          const updated = fetchedTables.find((t) => getId(t) === getId(prevSelected));
          return updated || fetchedTables[0];
        });
      }
    } catch (err) {
      console.error('Failed to connect to POS Server:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Another terminal saving/paying an order, or changing tables/menu/inventory,
  // should show up here without a manual refresh.
  useRealtimeRefresh(['order', 'table', 'menu', 'category', 'inventory'], loadData);

  // Synchronize cart with the active order whenever active table or orders list changes
  useEffect(() => {
    if (selectedTable) {
      const selectedId = getId(selectedTable);
      const activeOrder = orders.find((o) => {
        const orderTableId = getId(o.tableId);
        const isMatchingTable = orderTableId === selectedId;
        const statusStr = o.status as string;
        const isActiveStatus = statusStr === 'pending' || statusStr === 'unsettled' || statusStr === 'open';
        return isMatchingTable && isActiveStatus;
      });

      setCurrentCart(activeOrder?.items || []);
    }
  }, [selectedTable, orders]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedCategory = newCategoryName.trim();
    if (!formattedCategory) return;

    try {
      await posApi.createCategory(formattedCategory);
      if (!categories.includes(formattedCategory)) {
        setCategories((prev) => [...prev, formattedCategory]);
      }
      setNewCategoryName('');
      setShowAddCategoryModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create category:', err);
      alert('Failed to create category on server.');
    }
  };

  const handleDeleteCategory = async (catToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemsInCategory = menu.filter((item) => item.category === catToDelete);

    if (itemsInCategory.length > 0) {
      alert(
        `Cannot delete category "${catToDelete}" because it contains ${itemsInCategory.length} item(s). Please delete or move those items first.`
      );
      return;
    }

    if (confirm(`Are you sure you want to remove the category "${catToDelete}"?`)) {
      try {
        await posApi.deleteCategory(catToDelete);
        setCategories((prev) => prev.filter((c) => c !== catToDelete));
        await loadData();
      } catch (err) {
        console.error('Failed to delete category:', err);
        // Fallback UI removal if route handles deletion implicitly
        setCategories((prev) => prev.filter((c) => c !== catToDelete));
      }
    }
  };

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
    if (!confirm('Are you sure you want to delete this table?')) return;

    try {
      await posApi.deleteTable(id);
      setTables((prev) => prev.filter((t) => getId(t) !== id));
      if (getId(selectedTable) === id) setSelectedTable(null);
      if (getId(modalTable) === id) setModalTable(null);
    } catch (err) {
      alert('Failed to delete table');
    }
  };

  const addToCart = (item: MenuItem) => {
    if (!selectedTable) return alert('Please select a table first!');

    const itemId = getId(item);
    if (!itemId) return;

    setCurrentCart((prev) => {
      const existing = prev.find((i) => getId(i.menuItemId) === itemId);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { menuItemId: itemId, name: item.name, price: item.price || 0, quantity: 1 }];
    });
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCurrentCart((prev) =>
      prev
        .map((i) => (getId(i.menuItemId) === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleCancelOrder = async () => {
    if (!selectedTable) return;
    const tableId = getId(selectedTable);

    if (window.confirm(`Are you sure you want to cancel all items for Table #${selectedTable.number}?`)) {
      try {
        await posApi.cancelTableOrder(tableId);
        setCurrentCart([]);
        setIsCartOpen(false);
        await loadData();
      } catch (err) {
        alert('Failed to clear order.');
      }
    }
  };

  const handleSaveOrder = async () => {
    if (!selectedTable || currentCart.length === 0) return;
    const tableId = getId(selectedTable);

    try {
      const result = await saveOrderResilient(tableId, selectedTable.number, currentCart);
      if (result.synced) {
        setIsCartOpen(false);
        await loadData();
        alert(`Order saved for Table #${selectedTable.number}`);
      } else {
        alert(
          `No connection — Table #${selectedTable.number}'s order is saved on this device and will sync automatically once you're back online.`
        );
      }
    } catch (err) {
      console.error('Save order failed:', err);
      alert('Failed to save order.');
    }
  };

  const handlePayBill = async () => {
    if (!selectedTable) return;
    const tableId = getId(selectedTable);

    try {
      if (currentCart.length > 0) {
        const result = await saveOrderResilient(tableId, selectedTable.number, currentCart);
        if (result.synced) {
          await loadData();
        } else {
          alert(
            `No connection — the new items are saved on this device and will sync once you're back online. Payment isn't available for them until then, but you can still pay whatever was already on the bill.`
          );
          return;
        }
      }
      setIsCartOpen(false);
      setModalTable(selectedTable);
    } catch (err) {
      console.error('Failed to prepare bill payment:', err);
      alert('Failed to open payment options.');
    }
  };

  const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const cartItemCount = currentCart.reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Shared between the permanent desktop column and the mobile slide-up
  // sheet — same live state, just two different places to display it.
  const cartTopSection = (
    <div className="border-b border-slate-800 pb-3 mb-4 flex justify-between items-center">
      <div>
        <h2 className="font-bold text-base text-slate-100">
          {selectedTable ? `Table #${selectedTable.number} Order` : 'No Table Selected'}
        </h2>
        <p className="text-xs text-slate-400">Current order for this table</p>
      </div>
      {currentCart.length > 0 && (
        <button
          onClick={handleCancelOrder}
          className="text-xs text-rose-400 flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg"
        >
          <XCircle className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </div>
  );

  const cartItemsList = (
    <div className="space-y-1.5 lg:max-h-[450px] overflow-y-auto pr-1">
      {currentCart.length === 0 ? (
        <div className="text-center text-slate-500 text-xs py-12">
          Click a category card to add items to Table #{selectedTable?.number}.
        </div>
      ) : (
        currentCart.map((item) => (
          <div
            key={getId(item.menuItemId)}
            className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800"
          >
            <div>
              <h4 className="text-xs font-semibold text-slate-200">{item.name}</h4>
              <span className="text-[10px] text-slate-400">{currency} {(item.price || 0).toFixed(2)} each</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQty(getId(item.menuItemId), -1)}
                className="w-6 h-6 bg-slate-800 text-xs rounded font-bold text-slate-300 hover:bg-slate-700"
              >
                -
              </button>
              <span className="text-xs font-mono font-bold w-4 text-center">{item.quantity}</span>
              <button
                onClick={() => updateQty(getId(item.menuItemId), 1)}
                className="w-6 h-6 bg-slate-800 text-xs rounded font-bold text-slate-300 hover:bg-slate-700"
              >
                +
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const cartFooter = (
    <div className="border-t border-slate-800 pt-4 space-y-3 mt-4">
      <div className="flex justify-between text-sm font-bold text-slate-100">
        <span>Total</span>
        <span className="font-mono text-indigo-400">{currency} {subtotal.toFixed(2)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleSaveOrder}
          disabled={!selectedTable || currentCart.length === 0}
          className="py-2.5 bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-700 transition"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Save
        </button>
        <button
          onClick={handlePayBill}
          disabled={!selectedTable || currentCart.length === 0}
          className="py-2.5 bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-500 transition"
        >
          <CreditCard className="w-3.5 h-3.5" /> Pay
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 pb-24 lg:pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-950 text-slate-100">
      {/* Left Column */}
      <div className="lg:col-span-8 space-y-6">
        {/* Table Selection */}
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
              const tblId = getId(tbl);
              const isSelected = getId(selectedTable) === tblId;
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

        {/* Menu Categories Grid */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-indigo-400" />
              Menu Categories
            </h2>
            <button
              onClick={() => setShowAddCategoryModal(true)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition font-medium"
            >
              <FolderPlus className="w-4 h-4 text-indigo-400" />
              Add Category
            </button>
          </div>

          {/* Fixed height + overflow-y-auto to allow scrolling after 3 rows */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[380px] overflow-y-auto pr-1">
            {categories.map((cat) => {
              const itemCount = menu.filter((m) => m.category === cat).length;
              return (
                <div
                  key={cat}
                  onClick={() => setSelectedCategoryModal(cat)}
                  className="bg-slate-950 border border-slate-800 hover:border-indigo-500 p-4 rounded-xl cursor-pointer transition-all flex flex-col justify-between group relative"
                >
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                        Category
                      </span>
                      <button
                        onClick={(e) => handleDeleteCategory(cat, e)}
                        title="Delete Category"
                        className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h3 className="font-bold text-base text-slate-100 mt-1 group-hover:text-indigo-300 transition">
                      {cat}
                    </h3>
                  </div>
                  <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                    <span>{itemCount} Items</span>
                    <span className="text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform">
                      View →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column (Cart / Order Summary) — permanent at lg+, replaced by
          a bottom bar + slide-up sheet below lg (see end of this component) */}
      <div className="hidden lg:flex lg:col-span-4 flex-col justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div>
          {cartTopSection}
          {cartItemsList}
        </div>
        {cartFooter}
      </div>

      {/* Mobile/tablet: persistent bottom bar, shown once something's in the cart */}
      {selectedTable && currentCart.length > 0 && !isCartOpen && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="lg:hidden fixed inset-x-4 bottom-4 z-30 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-5 py-4 shadow-2xl shadow-indigo-900/40 flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart className="w-4 h-4" />
            {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-2 text-sm font-bold">
            {currency} {subtotal.toFixed(2)}
            <ChevronUp className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Mobile/tablet: slide-up cart sheet */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div onClick={() => setIsCartOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-h-[88vh] bg-slate-900 border-t border-slate-800 rounded-t-3xl flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 pt-4 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Order</span>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 -mr-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pt-2 shrink-0">{cartTopSection}</div>
            <div className="flex-1 overflow-y-auto px-4">{cartItemsList}</div>
            <div className="px-4 pb-4 shrink-0">{cartFooter}</div>
          </div>
        </div>
      )}

      {/* Category Items Modal */}
      {selectedCategoryModal && (
        <CategoryModal
          category={selectedCategoryModal}
          menuItems={menu.filter((m) => m.category === selectedCategoryModal)}
          inventoryList={inventoryList}
          onClose={() => setSelectedCategoryModal(null)}
          onAddToCart={addToCart}
          onItemCreated={loadData}
        />
      )}

      {/* Modal: Table Detail Modal */}
      {modalTable && (
        <TableDetailModal
          table={modalTable}
          tables={tables}
          order={orders.find((o) => {
            const modalId = getId(modalTable);
            const statusStr = o.status as string;
            return getId(o.tableId) === modalId && (statusStr === 'pending' || statusStr === 'unsettled' || statusStr === 'open');
          })}
          onClose={() => {
            setModalTable(null);
            setCurrentCart([]);
            loadData();
          }}
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
              await payOrderResilient(getId(modalTable), modalTable?.number || 0, orderId, paymentMethod);
            }
          }}
          onVoidOrder={async (tableId: string, reason: string) => {
            await posApi.cancelTableOrder(tableId, reason);
            setCurrentCart([]);
            setModalTable(null);
            await loadData();
          }}
          onSwitchTable={async (sourceTableId: string, destinationTableId: string) => {
            await posApi.switchTable(sourceTableId, destinationTableId);
            setCurrentCart([]);
            setModalTable(null);
            await loadData();
          }}
        />
      )}

      {/* Modal: Add Category */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateCategory} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-100">Add New Category</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Category Name</label>
              <input
                type="text"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Desserts, Drinks"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
              >
                Cancel
              </button>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Add Table */}
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