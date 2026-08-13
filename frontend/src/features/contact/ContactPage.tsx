import React, { useState } from 'react';
import { MessageCircle, Phone, MessageSquareText, Mail, ChevronDown, ChevronUp, Send, CheckCircle2, Layers } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { WhatsAppIcon } from '../../shared/components/WhatsAppIcon';
import { PlansModal } from '../../shared/components/PlansModal';

const WHATSAPP_NUMBER = '9779823011459';
const GMAIL_ADDRESS = '23prakashmul@gmail.com';
const PHONE_NUMBERS = ['+977-9823011459', '+977-9868730726'];

// Gmail's compose URL opens a pre-filled draft to this address in a new
// tab — the closest real equivalent to WhatsApp's wa.me for an email
// address, since there's no "start a chat with this email" deep link for
// Google Chat. The sender still has to hit Send on their end.
function buildGmailUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildFeedbackText(restaurantName: string | undefined, name: string, message: string): string {
  return [
    'Feedback from Restaurant Management Software',
    restaurantName ? `Restaurant: ${restaurantName}` : null,
    name.trim() ? `Name: ${name.trim()}` : null,
    '',
    `Message/Feedback: ${message.trim()}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

type SentChannel = 'whatsapp' | 'gmail' | null;

export const ContactPage: React.FC = () => {
  const { currentUser, currentRestaurant } = useAuth();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<SentChannel>(null);
  const [plansOpen, setPlansOpen] = useState(false);

  const handleSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // No WhatsApp Business API is wired up — this hands off to the
    // submitter's own WhatsApp client with the message pre-filled (the
    // standard wa.me click-to-chat pattern), same mechanism as the plain
    // WhatsApp card above. They still have to hit send on their end; there's
    // no way to deliver it silently without a paid Business API integration.
    const text = buildFeedbackText(currentRestaurant?.name, name, message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    setSent('whatsapp');
    setMessage('');
    setTimeout(() => setSent(null), 4000);
  };

  const handleSendGmail = () => {
    if (!message.trim()) return;

    const text = buildFeedbackText(currentRestaurant?.name, name, message);
    const subject = currentRestaurant?.name
      ? `Feedback from ${currentRestaurant.name}`
      : 'Feedback from Restaurant Management Software';
    const url = buildGmailUrl(GMAIL_ADDRESS, subject, text);
    window.open(url, '_blank', 'noopener,noreferrer');

    setSent('gmail');
    setMessage('');
    setTimeout(() => setSent(null), 4000);
  };

  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen space-y-6">
      <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <MessageCircle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Contact Us</h1>
          <p className="text-xs text-slate-400">Reach the team behind Restaurant Management Software directly.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 p-5 rounded-2xl transition group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center text-[#25D366] shrink-0">
            <WhatsAppIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition">
              Chat on WhatsApp
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">+977-9823011459</p>
          </div>
        </a>

        <a
          href={buildGmailUrl(
            GMAIL_ADDRESS,
            currentRestaurant?.name
              ? `Contact from ${currentRestaurant.name}`
              : 'Contact from Restaurant Management Software',
            'Name:\nMessage:'
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-[#EA4335]/40 p-5 rounded-2xl transition group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#EA4335]/10 border border-[#EA4335]/30 flex items-center justify-center text-[#EA4335] shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 group-hover:text-[#EA4335] transition">
              Email on Gmail
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 break-all">{GMAIL_ADDRESS}</p>
          </div>
        </a>

        <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Phone className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-100">Call Us</h2>
            {PHONE_NUMBERS.map((number) => (
              <a
                key={number}
                href={`tel:${number.replace(/-/g, '')}`}
                className="block text-xs text-slate-400 hover:text-indigo-400 transition font-mono"
              >
                {number}
              </a>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPlansOpen(true)}
        className="w-full max-w-4xl flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 p-5 rounded-2xl transition group text-left"
      >
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
          <Layers className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-100 group-hover:text-indigo-400 transition">
            {currentRestaurant?.planName ? `Current plan: ${currentRestaurant.planName}` : 'View Plans'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">See what's included in each plan, or request a change.</p>
        </div>
      </button>

      <div className="max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setFeedbackOpen((v) => !v)}
          className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-800/30 transition"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <MessageSquareText className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-100">Send Message/Feedback</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tell us what's working, what's not — send it via WhatsApp or Gmail.
            </p>
          </div>
          {feedbackOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {feedbackOpen && (
          <form onSubmit={handleSendWhatsApp} className="border-t border-slate-800 p-5 space-y-3">
            {sent && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {sent === 'whatsapp'
                  ? 'WhatsApp opened with your message — hit send there to deliver it.'
                  : 'Gmail opened with your message — hit send there to deliver it.'}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Your message/feedback</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                placeholder="What would you like us to know?"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition resize-none"
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="submit"
                disabled={!message.trim()}
                className="inline-flex items-center gap-2 bg-[#25D366] hover:brightness-110 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition disabled:opacity-50"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                Send via WhatsApp
              </button>
              <button
                type="button"
                onClick={handleSendGmail}
                disabled={!message.trim()}
                className="inline-flex items-center gap-2 bg-[#EA4335] hover:brightness-110 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Send via Gmail
              </button>
            </div>
          </form>
        )}
      </div>

      {plansOpen && <PlansModal onClose={() => setPlansOpen(false)} />}
    </div>
  );
};
