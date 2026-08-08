import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Trash2,
  X,
  Mail,
  AlertTriangle,
  User as UserIcon,
  Plus,
  Crown,
  Briefcase,
  CreditCard as CardIcon,
  UtensilsCrossed,
  ChefHat,
  Sparkles,
  DollarSign,
  Download,
} from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { StaffMember, Role, PermissionSection, Location } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.response?.data?.error || fallback;
}

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Owner: Crown,
  Manager: Briefcase,
  Cashier: CardIcon,
  Waiter: UtensilsCrossed,
  Kitchen: ChefHat,
};

export const StaffPage: React.FC = () => {
  const { currentUser, isOwner } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'roles' | 'staff'>('roles');

  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionSection[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [roleError, setRoleError] = useState('');
  const [isSavingRole, setIsSavingRole] = useState(false);

  const [isNewRoleModalOpen, setIsNewRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleError, setNewRoleError] = useState('');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteLocationId, setInviteLocationId] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteEmailWarning, setInviteEmailWarning] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [payrollStartDate, setPayrollStartDate] = useState('');
  const [payrollEndDate, setPayrollEndDate] = useState('');
  const [isExportingPayroll, setIsExportingPayroll] = useState(false);
  const [payrollExportError, setPayrollExportError] = useState('');

  const loadAll = async () => {
    try {
      const [rolesData, catalogData, staffData] = await Promise.all([
        posApi.getRoles(),
        posApi.getPermissionCatalog(),
        posApi.getStaff(),
      ]);
      setRoles(rolesData);
      setCatalog(catalogData);
      setStaff(staffData);
      if (isOwner) {
        posApi.getLocations().then(setLocations).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load users & roles data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (roles.length === 0) return;
    if (!selectedRoleId || !roles.some((r) => r._id === selectedRoleId)) {
      selectRole(roles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  const myRole = useMemo(() => roles.find((r) => r.name === currentUser?.role), [roles, currentUser]);
  const canManageRoles = isOwner || !!myRole?.permissions.includes('settings.roles');
  const canManageStaff = isOwner || !!myRole?.permissions.includes('settings.staff');

  const locationName = (locationId: string | null) =>
    locationId ? locations.find((l) => l._id === locationId)?.name || 'Unknown location' : 'All locations';

  const selectedRole = roles.find((r) => r._id === selectedRoleId) || null;

  const selectRole = (role: Role) => {
    setSelectedRoleId(role._id);
    setEditName(role.name);
    setEditDescription(role.description);
    setEditPermissions(new Set(role.permissions));
    setRoleError('');
  };

  const resetEdits = () => {
    if (!selectedRole) return;
    selectRole(selectedRole);
  };

  const togglePermission = (key: string) => {
    if (selectedRole?.isOwnerRole) return;
    setEditPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSaveRole = async () => {
    if (!selectedRole || selectedRole.isOwnerRole) return;
    setRoleError('');
    try {
      setIsSavingRole(true);
      const updated = await posApi.updateRole(selectedRole._id, {
        name: editName.trim(),
        description: editDescription,
        permissions: [...editPermissions],
      });
      setRoles((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
      await loadAll();
    } catch (err) {
      setRoleError(extractErrorMessage(err, 'Failed to save role.'));
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!window.confirm(`Delete the "${role.name}" role? Staff must be reassigned off it first.`)) return;
    try {
      await posApi.deleteRole(role._id);
      setSelectedRoleId('');
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to delete role.'));
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewRoleError('');
    if (!newRoleName.trim()) {
      setNewRoleError('Give the role a name.');
      return;
    }
    try {
      const role = await posApi.createRole({ name: newRoleName.trim(), permissions: [] });
      setNewRoleName('');
      setIsNewRoleModalOpen(false);
      await loadAll();
      selectRole(role);
    } catch (err) {
      setNewRoleError(extractErrorMessage(err, 'Failed to create role.'));
    }
  };

  const resetInviteForm = () => {
    setInviteName('');
    setInviteEmail('');
    setInviteRoleId(roles.find((r) => !r.isOwnerRole)?._id || '');
    setInviteLocationId('');
    setInviteError('');
    setInviteEmailWarning('');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    if (!inviteName.trim() || !inviteEmail.trim() || !inviteRoleId) {
      setInviteError('Please fill in all fields.');
      return;
    }
    try {
      setIsInviting(true);
      const result = await posApi.inviteStaff({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
        locationId: inviteLocationId || null,
      });
      resetInviteForm();
      setIsInviteModalOpen(false);
      await loadAll();
      if (result.emailSent === false) {
        setInviteEmailWarning(
          `${result.name} was added, but the invite email failed to send. They can use "Forgot password" on the login screen with ${result.email} once you confirm it's correct.`
        );
      }
    } catch (err) {
      setInviteError(extractErrorMessage(err, 'Failed to add staff member.'));
    } finally {
      setIsInviting(false);
    }
  };

  const handleStaffRoleChange = async (member: StaffMember, roleId: string) => {
    if (roleId === member.roleId) return;
    try {
      await posApi.updateStaffRole(member.id, roleId);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, "Failed to update this staff member's role."));
    }
  };

  const handleRemove = async (member: StaffMember) => {
    if (!window.confirm(`Remove ${member.name} from this restaurant?`)) return;
    try {
      await posApi.removeStaff(member.id);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to remove this staff member.'));
    }
  };

  const handleRateChange = async (member: StaffMember, rawValue: string) => {
    const hourlyRate = Number(rawValue);
    if (Number.isNaN(hourlyRate) || hourlyRate < 0) {
      alert('Enter a valid, non-negative hourly rate.');
      await loadAll();
      return;
    }
    if (hourlyRate === member.hourlyRate) return;
    try {
      setSavingRateId(member.id);
      await posApi.updateStaffRate(member.id, hourlyRate);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, "Failed to update this staff member's hourly rate."));
    } finally {
      setSavingRateId(null);
    }
  };

  const handleExportPayroll = async () => {
    setPayrollExportError('');
    try {
      setIsExportingPayroll(true);
      const blob = await posApi.exportPayrollCsv({
        startDate: payrollStartDate || undefined,
        endDate: payrollEndDate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-export-${payrollStartDate || 'all'}-to-${payrollEndDate || 'now'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPayrollExportError('Failed to export payroll data.');
    } finally {
      setIsExportingPayroll(false);
    }
  };

  const isSelf = (member: StaffMember) => member.email === currentUser?.email;
  const dirty =
    !!selectedRole &&
    (editName !== selectedRole.name ||
      editDescription !== selectedRole.description ||
      editPermissions.size !== selectedRole.permissions.length ||
      [...editPermissions].some((p) => !selectedRole.permissions.includes(p)));

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Users &amp; Roles
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Define what each role can see and do, then assign it to your staff — no developer needed.
          </p>
        </div>
        {canManageStaff && (
          <button
            onClick={() => {
              resetInviteForm();
              setIsInviteModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" /> Invite staff member
          </button>
        )}
      </div>

      {inviteEmailWarning && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-amber-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{inviteEmailWarning}</span>
          <button onClick={() => setInviteEmailWarning('')} className="text-amber-400/70 hover:text-amber-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="inline-flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        {(['roles', 'staff'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeSubTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'roles' ? 'Roles & Permissions' : 'Staff Members'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
      ) : activeSubTab === 'roles' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {roles.map((role) => {
              const Icon = ROLE_ICONS[role.name] || Sparkles;
              return (
                <button
                  key={role._id}
                  onClick={() => selectRole(role)}
                  className={`flex flex-col gap-2.5 p-3.5 rounded-2xl border text-left transition ${
                    selectedRoleId === role._id
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedRoleId === role._id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold">{role.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                      {!ROLE_ICONS[role.name] && ' · custom role'}
                    </div>
                  </div>
                </button>
              );
            })}
            {canManageRoles && (
              <button
                onClick={() => {
                  setNewRoleName('');
                  setNewRoleError('');
                  setIsNewRoleModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 p-3.5 rounded-2xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition text-xs font-bold min-h-[76px]"
              >
                <Plus className="w-4 h-4" /> Create custom role
              </button>
            )}
          </div>

          {selectedRole && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  {canManageRoles && !selectedRole.isOwnerRole ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-sm font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition px-0.5"
                    />
                  ) : (
                    <h3 className="text-sm font-bold text-white">Editing: {selectedRole.name}</h3>
                  )}
                  {canManageRoles && !selectedRole.isOwnerRole ? (
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="What can this role do?"
                      className="mt-1 w-full text-[11px] text-slate-400 bg-transparent border-b border-transparent hover:border-slate-800 focus:border-indigo-500 focus:outline-none transition px-0.5 placeholder-slate-600"
                    />
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1 max-w-lg">{selectedRole.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
                    {selectedRole.userCount} {selectedRole.userCount === 1 ? 'person has' : 'people have'} this role
                  </span>
                  {canManageRoles && !selectedRole.isOwnerRole && selectedRole.userCount === 0 && (
                    <button
                      onClick={() => handleDeleteRole(selectedRole)}
                      className="text-rose-400 hover:text-rose-300 transition p-2.5 sm:p-1.5 rounded-lg hover:bg-rose-500/10"
                      title="Delete role"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {selectedRole.isOwnerRole && (
                <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs">
                  The Owner role always has full access and can't be edited or deleted.
                </div>
              )}
              {roleError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{roleError}</div>
              )}

              <div className="space-y-5">
                {catalog.map((section) => (
                  <div key={section.key} className="border-t border-slate-800/60 pt-4 first:border-t-0 first:pt-0">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2.5">
                      {section.label}
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                      {section.permissions.map((perm) => {
                        const on = editPermissions.has(perm.key);
                        const disabled = !canManageRoles || selectedRole.isOwnerRole;
                        return (
                          <label
                            key={perm.key}
                            className={`flex items-center justify-between gap-3 py-2 border-b border-slate-800/50 ${
                              disabled ? 'cursor-default' : 'cursor-pointer'
                            }`}
                          >
                            <span className={`text-xs ${on ? 'text-slate-200' : 'text-slate-500'}`}>{perm.label}</span>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={disabled}
                              onChange={() => togglePermission(perm.key)}
                              className="w-4 h-4 rounded accent-indigo-500 disabled:opacity-40"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {canManageRoles && !selectedRole.isOwnerRole && (
                <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-800">
                  <button
                    onClick={resetEdits}
                    disabled={!dirty}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 border border-slate-800 disabled:opacity-40 transition"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSaveRole}
                    disabled={!dirty || isSavingRole}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                  >
                    {isSavingRole ? 'Saving…' : 'Save role'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6">
        {canManageStaff && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-xl space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-indigo-400" /> Export Payroll
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Download a CSV of hours worked x hourly rate per staff member, computed from clocked attendance.
              </p>
            </div>

            {payrollExportError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                {payrollExportError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">From</label>
                <input
                  type="date"
                  value={payrollStartDate}
                  onChange={(e) => setPayrollStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">To</label>
                <input
                  type="date"
                  value={payrollEndDate}
                  onChange={(e) => setPayrollEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportPayroll}
              disabled={isExportingPayroll}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {isExportingPayroll ? 'Exporting…' : 'Download CSV'}
            </button>
          </div>
        )}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {staff.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No staff members found.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="text-left font-semibold px-5 py-3">Name</th>
                  <th className="text-left font-semibold px-5 py-3">Email</th>
                  <th className="text-left font-semibold px-5 py-3">Location(s)</th>
                  <th className="text-left font-semibold px-5 py-3">Role</th>
                  <th className="text-left font-semibold px-5 py-3">Hourly Rate</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  {canManageStaff && <th className="text-right font-semibold px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        {member.name}
                        {isSelf(member) && <span className="text-[10px] text-indigo-400 font-medium">(You)</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400">{member.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                        {locationName(member.locationId)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {canManageStaff && !isSelf(member) && member.role !== 'Owner' ? (
                        <select
                          value={member.roleId}
                          onChange={(e) => handleStaffRoleChange(member, e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {roles.map((r) => (
                            <option key={r._id} value={r._id}>
                              {r.name}
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
                      {canManageStaff ? (
                        <div className="relative w-24">
                          <DollarSign className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            key={`${member.id}-${member.hourlyRate}`}
                            type="number"
                            min={0}
                            step="0.5"
                            defaultValue={member.hourlyRate}
                            disabled={savingRateId === member.id}
                            onBlur={(e) => handleRateChange(member, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-2 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                          />
                        </div>
                      ) : (
                        <span className="tabular-nums">Rs. {member.hourlyRate.toFixed(2)}</span>
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
                    {canManageStaff && (
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
            </div>
          )}
        </div>
        </div>
      )}

      {isNewRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsNewRoleModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Create Custom Role</h2>
            {newRoleError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{newRoleError}</div>
            )}
            <form onSubmit={handleCreateRole} className="space-y-4">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Shift Lead"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <p className="text-[10px] text-slate-500">
                Starts with no permissions — you'll pick what it can do on the next screen.
              </p>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition"
              >
                Create Role
              </button>
            </form>
          </div>
        </div>
      )}

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
              <h2 className="text-lg font-bold text-white">Invite Staff Member</h2>
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

              <p className="text-[11px] text-slate-500 -mt-1">
                They'll get an email with a link to set their own password.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Role</label>
                <select
                  value={inviteRoleId}
                  onChange={(e) => setInviteRoleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  {roles.filter((r) => !r.isOwnerRole).map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              {locations.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Location</label>
                  <select
                    value={inviteLocationId}
                    onChange={(e) => setInviteLocationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                  >
                    <option value="">All locations</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={isInviting}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isInviting ? (
                  'Adding…'
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Invite Staff Member
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
