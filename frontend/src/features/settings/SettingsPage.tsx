import React, { useEffect, useState } from 'react';
import { Settings, ShieldAlert, Save, Download, ShieldCheck, Smartphone, Gift } from 'lucide-react';
import { posApi } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';

export const SettingsPage: React.FC = () => {
  const { hasPermission, updateRestaurant } = useAuth();
  const canEdit = hasPermission('settings.restaurant');

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [currency, setCurrency] = useState('');
  const [taxRatePercent, setTaxRatePercent] = useState('');
  // Stored as points-per-Rs.100-spent for a friendlier settings input; the
  // API takes/returns the raw per-Rs. ratio (loyaltyEarnRatePerRs * 100).
  const [loyaltyPointsPer100, setLoyaltyPointsPer100] = useState('');
  const [loyaltyPointValueRs, setLoyaltyPointValueRs] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isDisablingTotp, setIsDisablingTotp] = useState(false);
  const [isTotpBusy, setIsTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');

  useEffect(() => {
    posApi
      .getRestaurantSettings()
      .then((r) => {
        setName(r.name);
        setLogoUrl(r.logoUrl);
        setCurrency(r.currency);
        setTaxRatePercent(String(r.taxRatePercent));
        setLoyaltyPointsPer100(String((r.loyaltyEarnRatePerRs ?? 0.01) * 100));
        setLoyaltyPointValueRs(String(r.loyaltyPointValueRs ?? 1));
      })
      .catch((err) => console.error('Failed to load restaurant settings:', err))
      .finally(() => setLoading(false));

    posApi
      .getTotpStatus()
      .then((r) => setTotpEnabled(r.totpEnabled))
      .catch((err) => console.error('Failed to load two-factor status:', err));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (!name.trim()) {
      setError('Restaurant name is required.');
      return;
    }
    try {
      setIsSaving(true);
      const updated = await posApi.updateRestaurantSettings({
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        currency: currency.trim(),
        taxRatePercent: Number(taxRatePercent),
        loyaltyEarnRatePerRs: Number(loyaltyPointsPer100) / 100,
        loyaltyPointValueRs: Number(loyaltyPointValueRs),
      });
      updateRestaurant({
        name: updated.name,
        logoUrl: updated.logoUrl,
        currency: updated.currency,
        taxRatePercent: updated.taxRatePercent,
        loyaltyEarnRatePerRs: updated.loyaltyEarnRatePerRs,
        loyaltyPointValueRs: updated.loyaltyPointValueRs,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setExportError('');
    try {
      setIsExporting(true);
      const blob = await posApi.exportOrdersCsv({
        startDate: exportStartDate || undefined,
        endDate: exportEndDate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-export-${exportStartDate || 'all'}-to-${exportEndDate || 'now'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError('Failed to export sales data.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetTotpForm = () => {
    setTotpSetupData(null);
    setTotpCode('');
    setIsDisablingTotp(false);
    setTotpError('');
  };

  const handleStartTotpSetup = async () => {
    resetTotpForm();
    try {
      setIsTotpBusy(true);
      const data = await posApi.setupTotp();
      setTotpSetupData({ secret: data.secret, qrCodeDataUrl: data.qrCodeDataUrl });
    } catch (err: any) {
      setTotpError(err?.response?.data?.message || 'Failed to start two-factor setup.');
    } finally {
      setIsTotpBusy(false);
    }
  };

  const handleConfirmEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError('');
    try {
      setIsTotpBusy(true);
      await posApi.enableTotp(totpCode.trim());
      setTotpEnabled(true);
      setTotpSuccess('Two-factor authentication is now enabled.');
      setTimeout(() => setTotpSuccess(''), 2500);
      resetTotpForm();
    } catch (err: any) {
      setTotpError(err?.response?.data?.message || 'Invalid authentication code.');
    } finally {
      setIsTotpBusy(false);
    }
  };

  const handleConfirmDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError('');
    try {
      setIsTotpBusy(true);
      await posApi.disableTotp(totpCode.trim());
      setTotpEnabled(false);
      setTotpSuccess('Two-factor authentication has been disabled.');
      setTimeout(() => setTotpSuccess(''), 2500);
      resetTotpForm();
    } catch (err: any) {
      setTotpError(err?.response?.data?.message || 'Invalid authentication code.');
    } finally {
      setIsTotpBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" /> Restaurant Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">Organization-wide details — name, branding, currency, and tax rate.</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
      ) : !canEdit ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-md">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">View only</p>
          <p className="text-xs text-slate-500 mt-1">
            Ask an Owner to grant your role "Restaurant &amp; billing settings" to make changes here.
          </p>
          <div className="mt-5 text-left space-y-2 text-xs text-slate-400">
            <div><span className="text-slate-500">Name:</span> {name}</div>
            <div><span className="text-slate-500">Currency:</span> {currency}</div>
            <div><span className="text-slate-500">Tax rate:</span> {taxRatePercent}%</div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
              Settings saved.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Restaurant Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Logo URL</label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Currency Symbol</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="Rs."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <Gift className="w-3 h-3" /> Loyalty Program
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Points per Rs. 100 spent</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={loyaltyPointsPer100}
                  onChange={(e) => setLoyaltyPointsPer100(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Rs. value per point</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={loyaltyPointValueRs}
                  onChange={(e) => setLoyaltyPointValueRs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      )}

      {!loading && canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Download className="w-4 h-4 text-indigo-400" /> Export Sales Data
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Download a CSV of orders — one row per order with subtotal, discount, tax, tip, and total — for handoff to an accountant.
            </p>
          </div>

          {exportError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{exportError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">From</label>
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">To</label>
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {isExporting ? 'Exporting…' : 'Download CSV'}
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" /> Two-Factor Authentication
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Require a 6-digit code from an authenticator app on top of your password, for your own login.
          </p>
        </div>

        {totpSuccess && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
            {totpSuccess}
          </div>
        )}
        {totpError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{totpError}</div>
        )}

        {totpEnabled === null ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : totpSetupData ? (
          <form onSubmit={handleConfirmEnableTotp} className="space-y-4">
            <div className="flex flex-col items-center gap-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <img src={totpSetupData.qrCodeDataUrl} alt="Scan with your authenticator app" className="w-40 h-40 rounded-lg" />
              <p className="text-[11px] text-slate-500 text-center">
                Scan this with Google Authenticator, Authy, or 1Password. Can't scan?{' '}
                <span className="font-mono text-slate-400 break-all">{totpSetupData.secret}</span>
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Enter the 6-digit code to confirm
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 tracking-widest text-center font-mono focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetTotpForm}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 border border-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isTotpBusy || totpCode.length !== 6}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isTotpBusy ? 'Confirming…' : 'Confirm & Enable'}
              </button>
            </div>
          </form>
        ) : totpEnabled ? (
          isDisablingTotp ? (
            <form onSubmit={handleConfirmDisableTotp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Enter your current 6-digit code to disable
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 tracking-widest text-center font-mono focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetTotpForm}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 border border-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTotpBusy || totpCode.length !== 6}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {isTotpBusy ? 'Disabling…' : 'Confirm & Disable'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Enabled
              </span>
              <button
                type="button"
                onClick={() => {
                  resetTotpForm();
                  setIsDisablingTotp(true);
                }}
                className="text-rose-400 hover:text-rose-300 text-xs font-semibold transition"
              >
                Disable
              </button>
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={handleStartTotpSetup}
            disabled={isTotpBusy}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Smartphone className="w-4 h-4" /> {isTotpBusy ? 'Starting…' : 'Enable Two-Factor Authentication'}
          </button>
        )}
      </div>
    </div>
  );
};
