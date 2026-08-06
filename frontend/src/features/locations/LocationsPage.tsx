import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2, X, ShieldAlert } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Location } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.response?.data?.error || fallback;
}

export const LocationsPage: React.FC = () => {
  const { isOwner, currentLocation, setCurrentLocation } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const loadLocations = async () => {
    try {
      const data = await posApi.getLocations();
      setLocations(data);
    } catch (err) {
      console.error('Failed to load locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  if (!isOwner) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Owner access only</p>
          <p className="text-xs text-slate-500 mt-1">Only Owners can add, edit, or remove locations.</p>
        </div>
      </div>
    );
  }

  const resetCreateForm = () => {
    setName('');
    setAddress('');
    setPhone('');
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Location name is required.');
      return;
    }
    try {
      setIsSaving(true);
      await posApi.createLocation({ name: name.trim(), address: address.trim(), phone: phone.trim() });
      resetCreateForm();
      setIsCreateOpen(false);
      await loadLocations();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create location.'));
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc._id);
    setEditName(loc.name);
    setEditAddress(loc.address || '');
    setEditPhone(loc.phone || '');
  };

  const saveEdit = async (loc: Location) => {
    try {
      const updated = await posApi.updateLocation(loc._id, {
        name: editName.trim(),
        address: editAddress.trim(),
        phone: editPhone.trim(),
      });
      setEditingId(null);
      await loadLocations();
      // Keep the switcher's label in sync if we just renamed the active location.
      if (currentLocation?.id === loc._id) {
        setCurrentLocation({ ...currentLocation, name: updated.name, address: updated.address, phone: updated.phone });
      }
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to update location.'));
    }
  };

  const handleDelete = async (loc: Location) => {
    if (!window.confirm(`Delete location "${loc.name}"?`)) return;
    try {
      await posApi.deleteLocation(loc._id);
      await loadLocations();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to delete location.'));
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-400" /> Locations
          </h1>
          <p className="text-xs text-slate-400 mt-1">Every physical branch this restaurant operates.</p>
        </div>
        <button
          onClick={() => {
            resetCreateForm();
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-3.5 h-3.5" /> Add location
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading locations…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {locations.map((loc) => (
            <div key={loc._id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              {editingId === loc._id ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Address"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(loc)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        {loc.name}
                        {loc._id === currentLocation?.id && (
                          <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{loc.address || 'No address set'}</div>
                      <div className="text-xs text-slate-500">{loc.phone || 'No phone set'}</div>
                    </div>
                    <button onClick={() => handleDelete(loc)} className="text-slate-500 hover:text-rose-400 transition p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => startEdit(loc)}
                    className="mt-3 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition"
                  >
                    Edit details
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-5">Add Location</h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{error}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Location name (e.g. Lakeside Branch)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSaving ? 'Adding…' : 'Add Location'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
