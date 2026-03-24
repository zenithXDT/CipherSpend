import React, { useEffect, useMemo, useState } from 'react';
import { useCrypto } from '../../context/CryptoContext';
import { ShieldPlus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_CURRENCIES, type SupportedCurrency, getCurrencySymbol } from '@/lib/currency';
import { getDefaultCurrency } from '@/lib/preferences';
import { apiUrl } from '@/lib/api';

export interface ExpenseRecord {
  id: string;
  description: string;
  category: string;
  currency: string;
  amountCiphertext: string;
  timestamp: string;
}

const DEFAULT_CATEGORIES = ['Utilities', 'Food', 'Transportation', 'Travel', 'Education', 'Others'];
const CUSTOM_CATEGORIES_STORAGE_KEY = 'cipherspend.customCategories';

/* ── shared input style — mirrors Login page inputs ── */
const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 13px',
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${focused ? 'rgba(20,184,166,0.55)' : 'rgba(255,255,255,0.09)'}`,
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 14,
  fontFamily: '"IBM Plex Mono", monospace',
  outline: 'none',
  transition: 'border-color .2s, box-shadow .2s',
  boxShadow: focused ? '0 0 0 3px rgba(20,184,166,0.08)' : 'none',
  boxSizing: 'border-box' as const,
});

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 14,
  fontFamily: '"IBM Plex Mono", monospace',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  boxSizing: 'border-box' as const,
  colorScheme: 'dark' as const,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#52525b',
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  fontFamily: '"IBM Plex Mono", monospace',
  marginBottom: 7,
};

/* ── Overlay backdrop ── */
function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(3px)',
        animation: 'fadeIn .15s ease',
      }}
    />
  );
}

export const AddExpenseForm: React.FC<{
  onAdd: (expense: ExpenseRecord) => void;
  editExpense?: ExpenseRecord | null;
  onCancelEdit?: () => void;
}> = ({ onAdd, editExpense = null, onCancelEdit }) => {
  const { isCryptoReady, encryptAmount, decryptAmount, token } = useCrypto();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [currency, setCurrency] = useState<SupportedCurrency>('LKR');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  /* focused field tracking */
  const [focused, setFocused] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (editExpense && !DEFAULT_CATEGORIES.includes(editExpense.category) && !customCategories.includes(editExpense.category)) {
      return [...DEFAULT_CATEGORIES, ...customCategories, editExpense.category];
    }
    return [...DEFAULT_CATEGORIES, ...customCategories];
  }, [customCategories, editExpense]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setCustomCategories(parsed.filter((c): c is string => typeof c === 'string' && c.trim().length > 0));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (editExpense) return;
    try { setCurrency(getDefaultCurrency()); } catch { setCurrency('LKR'); }
  }, [editExpense]);

  const persistCustomCategories = (next: string[]) => {
    setCustomCategories(next);
    window.localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
  };

  const handleAddCategory = () => {
    const normalized = newCategory.trim();
    if (!normalized) return;
    const exists = [...DEFAULT_CATEGORIES, ...customCategories].some(
      (e) => e.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) { toast.error('Category already exists'); return; }
    const next = [...customCategories, normalized];
    persistCustomCategories(next);
    setCategory(normalized);
    setNewCategory('');
    toast.success('Category added');
  };

  const close = () => {
    setOpen(false);
    if (editExpense && onCancelEdit) onCancelEdit();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCryptoReady || !token || !desc || !amount) return;
    const val = parseFloat(amount);
    if (isNaN(val)) return;
    setIsSubmitting(true);
    toast('Encrypting…', { description: 'Running WASM CKKS Encryption' });
    setTimeout(() => {
      try {
        const ct = encryptAmount(val);
        const newExp: ExpenseRecord = {
          id: editExpense?.id ?? Math.random().toString(36).substr(2, 9),
          description: desc, category, currency,
          amountCiphertext: ct,
          timestamp: editExpense?.timestamp ?? new Date().toISOString(),
        };
        fetch(
          editExpense
            ? apiUrl(`/api/expenses/${editExpense.id}`)
            : apiUrl('/api/expenses'),
          {
            method: editExpense ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(newExp),
          }
        )
          .then(async (res) => { if (!res.ok) throw new Error(`Save failed (${res.status})`); return res.json(); })
          .then((data) => {
            onAdd(data);
            toast.success(editExpense ? 'Expense updated!' : 'Expense encrypted and stored!');
            setDesc(''); setAmount(''); setCategory(DEFAULT_CATEGORIES[0]);
            try { setCurrency(getDefaultCurrency()); } catch { setCurrency('LKR'); }
            close();
          })
          .catch((err) => { console.error(err); toast.error('Failed to save expense'); })
          .finally(() => setIsSubmitting(false));
      } catch (e) {
        console.error(e); toast.error('Encryption failed'); setIsSubmitting(false);
      }
    }, 50);
  };

  useEffect(() => {
    if (!editExpense) return;
    setDesc(editExpense.description);
    setCategory(editExpense.category);
    setCurrency((editExpense.currency as SupportedCurrency) || 'LKR');
    setOpen(true);
    try {
      const val = decryptAmount(editExpense.amountCiphertext);
      if (Number.isFinite(val)) setAmount(val.toFixed(2));
    } catch { setAmount(''); }
  }, [editExpense, decryptAmount]);

  const sym = getCurrencySymbol(currency);

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 9,
          background: '#0d9488',
          border: '1px solid rgba(20,184,166,0.4)',
          color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '-0.01em',
          boxShadow: '0 0 18px rgba(20,184,166,0.2)',
          transition: 'background .2s',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#0f766e')}
        onMouseLeave={e => (e.currentTarget.style.background = '#0d9488')}
      >
        <Plus size={15} />
        New Expense
      </button>

      {/* ── Modal ── */}
      {open && (
        <>
          <Backdrop onClick={close} />

          <div style={{
            position: 'fixed', inset: 0,
            zIndex: 101,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: '100%',
            padding: '56px 16px 24px',
            overflowY: 'auto',
            animation: 'slideUp .2s ease',
          }}>
            <div style={{
              width: '100%',
              maxWidth: 460,
              background: '#0c0e10',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              position: 'relative',
            }}>

              {/* Teal corner glow */}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: 120, height: 120,
                background: 'radial-gradient(circle at 0 0, rgba(20,184,166,0.07), transparent 70%)',
                pointerEvents: 'none',
              }} />

              {/* ── Modal header ── */}
              <div style={{
                padding: '20px 22px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: 'rgba(20,184,166,0.08)',
                    border: '1px solid rgba(20,184,166,0.22)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <ShieldPlus size={17} color="#14b8a6" />
                  </div>
                  <div>
                    {/* mini section label */}
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: '#3f3f46',
                      letterSpacing: '0.09em', textTransform: 'uppercase',
                      fontFamily: '"IBM Plex Mono", monospace', marginBottom: 3,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{ width: 12, height: 1, background: 'rgba(20,184,166,0.4)', display: 'inline-block' }} />
                      {editExpense ? 'Edit Entry' : 'New Entry'}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                      Secure {editExpense ? 'Update' : 'Expense'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#52525b', transition: 'all .15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#a1a1aa'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#52525b'; }}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Description subtitle */}
              <div style={{
                padding: '10px 22px 0',
                fontSize: 12, color: '#52525b',
                fontFamily: '"IBM Plex Mono", monospace',
              }}>
                {editExpense
                  ? 'Update the expense, then re-encrypt before sync.'
                  : 'Amounts are encrypted locally via CKKS before leaving your browser.'}
              </div>

              {/* ── Form ── */}
              <form onSubmit={handleSubmit} style={{ padding: '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    type="text"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    onFocus={() => setFocused('desc')}
                    onBlur={() => setFocused(null)}
                    placeholder="e.g. AWS Hosting Bill"
                    required
                    style={inputStyle(focused === 'desc')}
                  />
                </div>

                {/* Category + Currency row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        style={selectStyle}
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat} style={{ background: '#0c0e10' }}>{cat}</option>
                        ))}
                      </select>
                      {/* chevron */}
                      <svg viewBox="0 0 10 6" fill="none" style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        width: 10, pointerEvents: 'none',
                      }}>
                        <path d="M1 1l4 4 4-4" stroke="#52525b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    {/* add custom category */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                      <input
                        type="text"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        onFocus={() => setFocused('newcat')}
                        onBlur={() => setFocused(null)}
                        placeholder="Add category…"
                        style={{ ...inputStyle(focused === 'newcat'), padding: '7px 10px', fontSize: 12 }}
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        style={{
                          padding: '7px 12px', borderRadius: 7, flexShrink: 0,
                          background: 'rgba(20,184,166,0.08)',
                          border: '1px solid rgba(20,184,166,0.2)',
                          color: '#14b8a6', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'background .15s',
                          fontFamily: '"IBM Plex Mono", monospace',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.14)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.08)')}
                      >+ Add</button>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Currency</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={currency}
                        onChange={e => setCurrency(e.target.value as SupportedCurrency)}
                        style={selectStyle}
                      >
                        {SUPPORTED_CURRENCIES.map(cur => (
                          <option key={cur} value={cur} style={{ background: '#0c0e10' }}>{cur}</option>
                        ))}
                      </select>
                      <svg viewBox="0 0 10 6" fill="none" style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        width: 10, pointerEvents: 'none',
                      }}>
                        <path d="M1 1l4 4 4-4" stroke="#52525b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label style={labelStyle}>Amount ({currency})</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                      color: '#14b8a6', fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 15, fontWeight: 700, pointerEvents: 'none',
                    }}>{sym}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      onFocus={() => setFocused('amount')}
                      onBlur={() => setFocused(null)}
                      placeholder="0.00"
                      required
                      style={{ ...inputStyle(focused === 'amount'), paddingLeft: 44 }}
                    />
                  </div>
                </div>

                {/* Encryption notice */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 7,
                  background: 'rgba(20,184,166,0.04)',
                  border: '1px solid rgba(20,184,166,0.12)',
                }}>
                  <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }}>
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#14b8a6" strokeWidth="1.4" strokeLinecap="round" />
                    <rect x="2" y="7" width="12" height="8" rx="2.5" fill="#14b8a6" opacity=".25" />
                  </svg>
                  <span style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.5 }}>
                    Amount will be CKKS-encrypted via WASM before leaving your device
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  {editExpense && (
                    <button
                      type="button"
                      onClick={close}
                      style={{
                        flex: '0 0 auto', width: '33%',
                        padding: '11px', borderRadius: 9,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        color: '#71717a', fontSize: 14, fontWeight: 500,
                        cursor: 'pointer', transition: 'all .15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#a1a1aa'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#71717a'; }}
                    >Cancel</button>
                  )}
                  <button
                    type="submit"
                    disabled={!isCryptoReady || isSubmitting}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 9,
                      background: (!isCryptoReady || isSubmitting) ? 'rgba(20,184,166,0.25)' : '#0d9488',
                      border: '1px solid rgba(20,184,166,0.4)',
                      color: '#fff', fontSize: 15, fontWeight: 700,
                      cursor: (!isCryptoReady || isSubmitting) ? 'not-allowed' : 'pointer',
                      letterSpacing: '-0.01em',
                      boxShadow: (!isCryptoReady || isSubmitting) ? 'none' : '0 0 20px rgba(20,184,166,0.2)',
                      transition: 'background .2s, box-shadow .2s',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (!isSubmitting && isCryptoReady) e.currentTarget.style.background = '#0f766e'; }}
                    onMouseLeave={e => { if (!isSubmitting && isCryptoReady) e.currentTarget.style.background = '#0d9488'; }}
                  >
                    {isSubmitting ? (
                      <>
                        <span style={{
                          width: 13, height: 13, borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.25)',
                          borderTopColor: '#fff',
                          display: 'inline-block',
                          animation: 'spin .7s linear infinite',
                        }} />
                        Encrypting…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }}>
                          <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <rect x="2" y="7" width="12" height="8" rx="2.5" fill="currentColor" opacity=".9" />
                        </svg>
                        {editExpense ? 'Encrypt & Update' : 'Encrypt & Store'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn  { from { opacity: 0; }                    to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(14px); }
                             to   { opacity: 1; transform: translateY(0); } }
        @keyframes spin    { to   { transform: rotate(360deg); } }
      `}</style>
    </>
  );
};
