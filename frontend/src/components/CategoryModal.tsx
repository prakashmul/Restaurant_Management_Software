import React, { useState } from 'react';
import { Plus, X, Utensils, Package, Trash2 } from 'lucide-react';
import type { MenuItem, InventoryItem } from '../types';
import { posApi } from '../api/posApi';

interface CategoryModalProps {
  category: string;
  menuItems: MenuItem[];
  inventoryList?: InventoryItem[];
  onClose: () => void;
  onAddToCart: (item: MenuItem) => void;
  onItemCreated: () => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  category,
  menuItems,
  inventoryList = [],
  onClose,
  onAddToCart,
  onItemCreated,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [recipe, setRecipe] = useState<{ inventoryItemId: string; quantityPerPortion: number }[]>([]);

  // Selected ingredient form input state
  const [selectedInvId, setSelectedInvId] = useState('');
  const [invQty, setInvQty] = useState('');

  const handleAddIngredient = () => {
    if (!selectedInvId || !invQty) return;
    setRecipe((prev) => [
      ...prev,
      { inventoryItemId: selectedInvId, quantityPerPortion: parseFloat(invQty) },
    ]);
    setSelectedInvId('');
    setInvQty('');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;

    try {
      await posApi.createMenuItem({
        name,
        category,
        price: parseFloat(price),
        recipe: recipe,
      });
      setName('');
      setPrice('');
      setRecipe([]);
      setShowAddForm(false);
      onItemCreated();
    } catch (err) {
      alert('Failed to add menu item');
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation(); // Prevents adding the item to cart when clicking delete
    if (!confirm('Are you sure you want to delete this menu item?')) return;

    try {
      await posApi.deleteMenuItem(itemId);
      onItemCreated(); // Refresh the list from backend
    } catch (err) {
      console.error('Failed to delete menu item:', err);
      alert('Failed to delete menu item');
    }
  };

  const handleSelectItem = (item: MenuItem) => {
    // Ensure both id and _id exist before pushing to cart to prevent duplicate entries
    const normalizedItem: MenuItem = {
      ...item,
      id: item.id || item._id || '',
      _id: item._id || item.id || '',
    };
    onAddToCart(normalizedItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-indigo-400" /> {category} Items
            </h2>
            <p className="text-xs text-slate-400">Select an item to add to active order</p>
          </div>
          <div className="flex items-center gap-2">
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Item
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {showAddForm ? (
            <form onSubmit={handleSaveItem} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-indigo-300">Add Item to {category}</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Item Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Spring Roll"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Price (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Recipe / Inventory Linking */}
              <div className="border-t border-slate-800 pt-3">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1 mb-2">
                  <Package className="w-3.5 h-3.5 text-indigo-400" /> Deduct Ingredients from Inventory
                </label>

                <div className="flex gap-2 mb-2">
                  <select
                    value={selectedInvId}
                    onChange={(e) => setSelectedInvId(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg p-2 flex-1 focus:outline-none"
                  >
                    <option value="">Select Inventory Item</option>
                    {inventoryList.map((inv) => (
                      <option key={inv._id || inv.id} value={inv._id || inv.id}>
                        {inv.name} ({inv.unit})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    className="w-20 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-3 py-2 rounded-lg font-medium"
                  >
                    Add
                  </button>
                </div>

                {/* Recipe List */}
                {recipe.length > 0 && (
                  <div className="space-y-1 bg-slate-900 p-2 rounded-lg">
                    {recipe.map((r, idx) => {
                      const invItem = inventoryList.find((i) => (i._id || i.id) === r.inventoryItemId);
                      return (
                        <div key={idx} className="flex justify-between text-xs text-slate-300">
                          <span>{invItem?.name || 'Item'}</span>
                          <span className="font-mono text-indigo-400">
                            {r.quantityPerPortion} {invItem?.unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg"
                >
                  Save Item
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {menuItems.map((item) => {
                const itemId = (item._id || item.id || '') as string;
                return (
                  <div
                    key={itemId}
                    onClick={() => handleSelectItem(item)}
                    className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-xl cursor-pointer transition-all flex flex-col justify-between group hover:bg-slate-800/40 relative"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <h4 className="font-semibold text-xs text-slate-200 group-hover:text-indigo-300 line-clamp-2">
                        {item.name}
                      </h4>
                      <button
                        onClick={(e) => handleDeleteItem(e, itemId)}
                        title="Delete item"
                        className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 flex justify-between items-center">
                      <span className="font-mono text-xs text-slate-400">Rs. {(item.price || 0).toFixed(2)}</span>
                      <span className="bg-indigo-600 text-white p-1 rounded-md text-[10px]">
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};