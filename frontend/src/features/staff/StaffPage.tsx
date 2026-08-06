import React, { useEffect, useState } from 'react';
import { Users, UserPlus, ShieldCheck, Trash2, X, Mail, Lock, User as UserIcon } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { StaffMember, StaffRole } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';

const ROLE_OPTIONS: StaffRole[] = ['Owner', 'Manager', 'Cashier', 'Waiter', 'Kitchen'];

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.response?.data?.error || fallback;
}

export const StaffPage: React.FC = () => {
  const { currentUser, isOwner } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('Waiter');
  const [inviteError, setInviteError] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const loadStaff = async () => {
    try {
      const data = await posApi.getStaff();
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load staff list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const resetInviteForm = () => {
    setInviteName('');
    setInviteEmail('');
    setInvitePassword('');
    setInviteRole('Waiter');
    setInviteError('');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');

    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) {
      setInviteError('Please fill in all fields.');
      return;
    }

    try {
      setIsInviting(true);
      await posApi.inviteStaff({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
        role: inviteRole,
      });
      resetInviteForm();
      setIsInviteModalOpen(false);
      await loadStaff();
    } catch (err) {
      setInviteError(extractErrorMessage(err, 'Failed to add staff member.'));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (member: StaffMember, role: StaffRole) => {
    if (role === member.role) return;
    try {
      await posApi.updateStaffRole(member.id, role);
      await loadStaff();
    } catch (err) {
      alert(extractErrorMessage(err, "Failed to update this staff member's role."));
    }
  };

  const handleRemove = async (member: StaffMember) => {
    if (!window.confirm(`Remove ${member.name} from this restaurant?`)) return;
    try {
      await posApi.removeStaff(member.id);
      await loadStaff();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to remove this staff member.'));
    }
  };

  const isSelf = (member: StaffMember) => member.email === currentUser?.email;

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Staff & Roles
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isOwner
              ? 'Manage who has access to this restaurant and what they can do.'
              : 'People with access to this restaurant.'}
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => {
              resetInviteForm();
              setIsInviteModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" /> Add Staff Member
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading staff…</div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No staff members found.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="text-left font-semibold px-5 py-3">Name</th>
                <th className="text-left font-semibold px-5 py-3">Email</th>
                <th className="text-left font-semibold px-5 py-3">Role</th>
                <th className="text-left font-semibold px-5 py-3">Status</th>
                {isOwner && <th className="text-right font-semibold px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-5 py-3 font-semibold text-slate-200">
                    <div className="flex items-center gap-2">
                      {member.name}
                      {isSelf(member) && (
                        <span className="text-[10px] text-indigo-400 font-medium">(You)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{member.email}</td>
                  <td className="px-5 py-3">
                    {isOwner && !isSelf(member) ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value as StaffRole)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-medium">
                        <ShieldCheck className="w-3 h-3" /> {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        member.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="px-5 py-3 text-right">
                      {!isSelf(member) && (
                        <button
                          onClick={() => handleRemove(member)}
                          className="text-rose-400 hover:text-rose-300 transition inline-flex items-center gap-1 font-semibold"
                          title="Remove staff member"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">Add Staff Member</h2>
              <p className="text-xs text-slate-400 mt-1">
                Create login credentials and assign a role for a new team member.
              </p>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="jane@restaurant.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Temporary Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as StaffRole)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  {ROLE_OPTIONS.filter((r) => r !== 'Owner').map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isInviting}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isInviting ? (
                  'Adding…'
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Add Staff Member
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
