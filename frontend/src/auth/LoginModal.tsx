import React, { useState } from 'react';
import { Lock, Mail, X, LogIn, UserPlus, User, Store, AlertCircle, CheckCircle2, ShieldCheck, KeyRound } from 'lucide-react';
import { API_ROOT } from '../api/posApi';
import type { AuthRestaurant } from './AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (
    user: { name: string; role: string; email: string },
    token: string,
    restaurant?: AuthRestaurant | null
  ) => void;
  isLoggedIn?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  isLoggedIn = false,
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [requiresTotp, setRequiresTotp] = useState(false);
  const [totpToken, setTotpToken] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  if (!isOpen) return null;

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccessMessage('');
  };

  const openForgotPassword = () => {
    setIsForgotPassword(true);
    setError('');
    setSuccessMessage('');
  };

  const backToSignIn = () => {
    setIsForgotPassword(false);
    setError('');
    setSuccessMessage('');
  };

  const cancelTotpStep = () => {
    setRequiresTotp(false);
    setTotpToken('');
    setError('');
  };

  const API_BASE_URL = `${API_ROOT}/api/auth`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (isForgotPassword) {
      if (!email) {
        setError('Please enter your email.');
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
        setSuccessMessage(data.message);
        setEmail('');
      } catch (err: any) {
        setError(err.message || 'Failed to connect to backend server.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isSignUp && !name) {
      setError('Please enter your full name.');
      return;
    }

    if (isSignUp && !restaurantName) {
      setError('Please enter your restaurant name.');
      return;
    }

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setLoading(true);

      const endpoint = isSignUp ? `${API_BASE_URL}/register` : `${API_BASE_URL}/login`;
      const payload = isSignUp
        ? { name, email, password, restaurantName }
        : requiresTotp
        ? { email, password, totpToken }
        : { email, password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Read response as text first to avoid JSON parsing crashes on 404/500 HTML pages
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned status ${response.status}. Ensure server.js has registered this route.`);
      }

      if (!response.ok) {
        throw new Error(data.message || (isSignUp ? 'Registration failed.' : 'Invalid email or password.'));
      }

      if (isSignUp) {
        // Success flow for Registration
        setName('');
        setRestaurantName('');
        setEmail(email);
        setPassword('');
        setIsSignUp(false);
        setSuccessMessage('Restaurant created successfully! Please sign in.');
      } else if (data.requiresTotp) {
        // Correct password, but this account has 2FA enabled — the same
        // form resubmits with a totpToken once the user enters it, rather
        // than issuing any token yet (no separate pending-session state).
        setRequiresTotp(true);
      } else {
        // Success flow for Login — AuthContext owns writing to storage.
        onLoginSuccess(data.user, data.token, data.restaurant);

        setEmail('');
        setPassword('');
        setRequiresTotp(false);
        setTotpToken('');
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError(err.message || 'Failed to connect to backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">

        {isLoggedIn && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            title="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            {isForgotPassword ? <KeyRound className="w-6 h-6" /> : requiresTotp ? <ShieldCheck className="w-6 h-6" /> : isSignUp ? <UserPlus className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isForgotPassword ? 'Reset Password' : requiresTotp ? 'Two-Factor Authentication' : isSignUp ? 'Register Your Restaurant' : 'Sign In'}
          </h2>
          <p className="text-xs text-slate-400">
            {isForgotPassword
              ? "Enter your account's email and we'll send you a reset link"
              : requiresTotp
              ? 'Enter the 6-digit code from your authenticator app'
              : isSignUp
              ? 'Create your restaurant and become its Owner'
              : 'Enter your staff credentials to access POS controls'}
          </p>
        </div>

        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isForgotPassword ? (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          ) : requiresTotp ? (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Authentication Code</label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 tracking-widest text-center font-mono focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          ) : (
            <>
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required={isSignUp}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Restaurant Name
              </label>
              <div className="relative">
                <Store className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required={isSignUp}
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="Your Restaurant's Name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {!isSignUp && (
            <button
              type="button"
              onClick={openForgotPassword}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 -mt-1"
            >
              Forgot password?
            </button>
          )}
            </>
          )}

          {isForgotPassword && (
            <button
              type="button"
              onClick={backToSignIn}
              className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              Back to sign in
            </button>
          )}

          {requiresTotp && (
            <button
              type="button"
              onClick={cancelTotpStep}
              className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              Back to sign in
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              'Processing...'
            ) : isForgotPassword ? (
              <>
                <KeyRound className="w-4 h-4" /> Send Reset Link
              </>
            ) : requiresTotp ? (
              <>
                <ShieldCheck className="w-4 h-4" /> Verify
              </>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" /> Create Restaurant
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Sign In
              </>
            )}
          </button>
        </form>

        {!requiresTotp && !isForgotPassword && (
        <div className="mt-5 text-center text-xs text-slate-400">
          {isSignUp ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 ml-1"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 ml-1"
              >
                Sign Up
              </button>
            </p>
          )}
        </div>
        )}

      </div>
    </div>
  );
};