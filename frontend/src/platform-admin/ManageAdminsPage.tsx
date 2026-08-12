import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Loader2, CheckCircle2, AlertCircle, Clock3 } from 'lucide-react';
import { platformAdminApi, type PlatformAdminSummary } from './platformAdminApi';

export const ManageAdminsPage: React.FC = () => {
  const [admins, setAdmins] = useState<PlatformAdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadAdmins = () => platformAdminApi.listAdmins().then(setAdmins);

  useEffect(() => {
    loadAdmins().finally(() => setLoading(false));
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    try {
      setInviting(true);
      await platformAdminApi.inviteAdmin(name.trim(), email.trim());
      setSuccessMessage(`Invite sent to ${email.trim()}.`);
      setName('');
      setEmail('');
      await loadAdmins();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Platform Admins</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Everyone with console access. Invite a new admin below — no code changes needed.
        </p>
      </div>

      <form onSubmit={handleInvite} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <UserPlus className="w-3.5 h-3.5 text-amber-400" /> Invite a new admin
        </h3>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {successMessage && (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {successMessage}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={inviting}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Send invite
        </button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">{a.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{a.email}</p>
                </div>
              </div>
              <div className="shrink-0">
                {a.isSeedAccount ? (
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                    Original
                  </span>
                ) : a.inviteAccepted ? (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-1 rounded-full inline-flex items-center gap-1">
                    <Clock3 className="w-3 h-3" /> Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
