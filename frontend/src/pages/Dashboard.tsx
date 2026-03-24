import { useState, useEffect, Suspense, lazy, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import type { ExpenseRecord } from '@/components/ledger/AddExpenseForm';
import { useCrypto } from '@/context/CryptoContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DownloadCloud, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/currency';
import { getDefaultCurrency } from '@/lib/preferences';
import { apiUrl } from '@/lib/api';

const TotalDisplay = lazy(() => import('@/components/dashboard/TotalDisplay').then((m) => ({ default: m.TotalDisplay })));
const AnalyticsCharts = lazy(() => import('@/components/dashboard/AnalyticsCharts').then((m) => ({ default: m.AnalyticsCharts })));
const AddExpenseForm = lazy(() => import('@/components/ledger/AddExpenseForm').then((m) => ({ default: m.AddExpenseForm })));
const LedgerView = lazy(() => import('@/components/ledger/LedgerView').then((m) => ({ default: m.LedgerView })));

type FilterRange = 'day' | 'week' | 'month' | 'custom';

/* ── Hex Grid Background ── */
function HexGrid() {
  return (
    <svg
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        opacity: 0.025, pointerEvents: 'none', zIndex: 0,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hex-dash" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
          <polygon points="28,2 52,14 52,38 28,50 4,38 4,14" fill="none" stroke="#14b8a6" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-dash)" />
    </svg>
  );
}

/* ── Cipher Stream Column ── */
const GLYPHS = '01アイウエオカキクケコABCDEF0123456789⊕⊗∑∫√≠≡';
function CipherStream({ col, side = 'left' }: { col: number; side?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const chars: string[] = Array.from({ length: 30 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
    const interval = setInterval(() => {
      frame++;
      chars[Math.floor(Math.random() * chars.length)] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.innerHTML = chars.map((c, i) => {
        const opacity = Math.max(0, 1 - Math.abs(i - (frame % chars.length)) / 8);
        const color = i === frame % chars.length ? '#14b8a6' : `rgba(20,184,166,${opacity * 0.2})`;
        return `<span style="color:${color};display:block;height:18px;font-size:11px;line-height:18px;">${c}</span>`;
      }).join('');
    }, 90);
    return () => clearInterval(interval);
  }, []);
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        [side]: `${col}px`,
        fontFamily: 'monospace',
        userSelect: 'none',
        pointerEvents: 'none',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 0,
        opacity: 0.6,
      }}
    />
  );
}

/* ── Status Badge ── */
function VaultBadge({ label }: { label: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 6,
      background: 'rgba(20,184,166,0.07)',
      border: '1px solid rgba(20,184,166,0.2)',
      fontSize: 11, color: '#14b8a6', fontFamily: 'monospace',
      letterSpacing: '0.06em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#14b8a6', display: 'inline-block', boxShadow: '0 0 6px #14b8a6' }} />
      {label}
    </div>
  );
}

/* ── Section Panel ── */
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '20px',
      backdropFilter: 'blur(4px)',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      {/* subtle teal corner accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: 60, height: 60,
        background: 'radial-gradient(circle at 0 0, rgba(20,184,166,0.08), transparent 70%)',
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

/* ── Section Label ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: '#52525b',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      fontFamily: 'monospace', marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 16, height: 1, background: 'rgba(20,184,166,0.4)', display: 'inline-block' }} />
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isChartVisible, setIsChartVisible] = useState(false);
  const [filterRange, setFilterRange] = useState<FilterRange>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>('LKR');
  const [mounted, setMounted] = useState(false);
  const { token, logout, email, decryptAmount } = useCrypto();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/expenses'), {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setExpenses(data))
      .catch(err => console.error("Could not fetch ledger.", err));
  }, [token]);

  useEffect(() => {
    try { setSelectedCurrency(getDefaultCurrency()); }
    catch { setSelectedCurrency('LKR'); }
  }, []);

  useEffect(() => {
    if (isChartVisible) return;
    const target = chartContainerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setIsChartVisible(true); observer.disconnect(); }
      },
      { root: null, threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isChartVisible]);

  const handleAddExpense = (exp: ExpenseRecord) => {
    if (editingExpenseId) {
      setExpenses((prev) => prev.map((item) => (item.id === exp.id ? exp : item)));
      setEditingExpenseId(null);
      return;
    }
    setExpenses(prev => [...prev, exp]);
  };

  const handleEditExpense = (expense: ExpenseRecord) => setEditingExpenseId(expense.id);

  const handleDeleteExpense = async (expenseId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/expenses/${expenseId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setExpenses((prev) => prev.filter((item) => item.id !== expenseId));
      toast.success('Expense deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete expense');
    }
  };

  const handleCSVExport = async () => {
    const recordsToExport = [...filteredExpenses].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (recordsToExport.length === 0) {
      toast.error('No visible ledger records to export');
      return;
    }

    const loadToast = toast.loading(`Decrypting ${recordsToExport.length} visible rows...`);
    try {
      let csvContent = 'data:text/csv;charset=utf-8,ID,Date,Currency,Category,Description,DecryptedAmount\n';
      recordsToExport.forEach((exp) => {
        let val = 0;
        try { val = decryptAmount(exp.amountCiphertext); } catch { /* ignore row */ }
        const row = [
          exp.id,
          exp.timestamp,
          exp.currency || 'LKR',
          exp.category,
          `"${String(exp.description ?? '').replaceAll('"', '""')}"`,
          val.toFixed(2),
        ].join(',');
        csvContent += `${row}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', 'cipherspend_decrypted_export.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('CSV Decrypted & Exported successfully!', { id: loadToast });
    } catch (error) {
      console.error(error);
      toast.error('Export failed', { id: loadToast });
    }
  };

  const getStartOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const parseLocalDateInput = (value: string): Date | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const parseExpenseTimestamp = (timestamp: string): Date | null => {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const normalized = timestamp.includes(' ') ? timestamp.replace(' ', 'T') : timestamp;
    const fallback = new Date(normalized);
    if (!Number.isNaN(fallback.getTime())) return fallback;

    return null;
  };

  const getDateRange = (): { start: Date | null; endExclusive: Date | null } => {
    const now = new Date();
    if (filterRange === 'day') {
      const start = getStartOfDay(now);
      return { start, endExclusive: addDays(start, 1) };
    }

    if (filterRange === 'week') {
      const start = getStartOfDay(new Date(now));
      const diff = start.getDay() === 0 ? 6 : start.getDay() - 1;
      start.setDate(start.getDate() - diff);
      return { start, endExclusive: addDays(getStartOfDay(now), 1) };
    }

    if (filterRange === 'month') {
      const start = getStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      return { start, endExclusive: addDays(getStartOfDay(now), 1) };
    }

    if (!customStart && !customEnd) return { start: null, endExclusive: null };

    const start = customStart ? parseLocalDateInput(customStart) : null;
    const end = customEnd ? parseLocalDateInput(customEnd) : null;
    return {
      start: start ? getStartOfDay(start) : null,
      endExclusive: end ? addDays(getStartOfDay(end), 1) : null,
    };
  };

  const { start: rangeStart, endExclusive: rangeEndExclusive } = getDateRange();
  const filteredExpenses = expenses.filter((expense) => {
    const ts = parseExpenseTimestamp(expense.timestamp);
    if (!ts) return false;

    if (rangeStart && ts.getTime() < rangeStart.getTime()) return false;
    if (rangeEndExclusive && ts.getTime() >= rangeEndExclusive.getTime()) return false;
    if ((expense.currency || 'LKR') !== selectedCurrency) return false;
    return true;
  });

  const FILTER_RANGES: { value: FilterRange; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080a0c',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      position: 'relative',
      color: '#f4f4f5',
    }}>
      <HexGrid />

      {/* Decorative cipher streams */}
      {[20, 55].map(c => <CipherStream key={`l${c}`} col={c} side="left" />)}
      {[20, 55].map(c => <CipherStream key={`r${c}`} col={c} side="right" />)}

      {/* Wrap with MainLayout for nav/sidebar */}
      <MainLayout>
        <div style={{
          position: 'relative', zIndex: 1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity .5s, transform .5s',
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'space-between', alignItems: 'flex-start',
            gap: 16, marginBottom: 32,
          }}>
            <div>
              <VaultBadge label="VAULT ACTIVE" />
              <h2 style={{
                fontSize: 28, fontWeight: 700, color: '#f4f4f5',
                margin: '10px 0 4px', letterSpacing: '-0.02em',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <ShieldCheck style={{ color: '#14b8a6', width: 22, height: 22 }} />
                Encrypted Dashboard
              </h2>
              <p style={{ fontSize: 13, color: '#52525b', fontFamily: 'monospace', margin: 0 }}>
                Vault synced · <span style={{ color: '#3f3f46' }}>{email}</span>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Suspense fallback={
                <div style={{ height: 38, width: 130, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
              }>
                <AddExpenseForm
                  onAdd={handleAddExpense}
                  editExpense={expenses.find((item) => item.id === editingExpenseId) ?? null}
                  onCancelEdit={() => setEditingExpenseId(null)}
                />
              </Suspense>

              <button
                onClick={logout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 16px', borderRadius: 9,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#71717a', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', transition: 'all .2s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                  e.currentTarget.style.color = '#f87171';
                  e.currentTarget.style.background = 'rgba(239,68,68,0.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = '#71717a';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
              >
                <LogOut style={{ width: 14, height: 14 }} />
                Lock Vault
              </button>
            </div>
          </div>

          {/* ── Main Grid: Total + Controls / Charts ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 20, marginBottom: 20,
          }}>
            {/* Left column: Total + filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Suspense fallback={
                <div style={{ height: 220, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }} />
              }>
                <TotalDisplay expenses={filteredExpenses} currency={selectedCurrency} />
              </Suspense>

              <Panel>
                <SectionLabel>Filters</SectionLabel>
                {/* Currency row */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 11, color: '#52525b', fontFamily: 'monospace',
                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
                  }}>Currency</div>
                  <Select value={selectedCurrency} onValueChange={(v) => setSelectedCurrency(v as SupportedCurrency)}>
                    <SelectTrigger style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: '#d4d4d8', fontSize: 14, borderRadius: 8,
                      fontFamily: 'monospace',
                    }}>
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent style={{ background: '#0f1214', border: '1px solid rgba(255,255,255,0.08)', color: '#d4d4d8' }}>
                      {SUPPORTED_CURRENCIES.map((cur) => (
                        <SelectItem key={cur} value={cur} style={{ fontFamily: 'monospace', fontSize: 14 }}>{cur}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Range pills */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 11, color: '#52525b', fontFamily: 'monospace',
                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
                  }}>Filter Range</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {FILTER_RANGES.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setFilterRange(value)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 7,
                          fontSize: 13, fontWeight: 600,
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          border: filterRange === value
                            ? '1px solid rgba(20,184,166,0.5)'
                            : '1px solid rgba(255,255,255,0.07)',
                          background: filterRange === value
                            ? 'rgba(20,184,166,0.12)'
                            : 'rgba(255,255,255,0.02)',
                          color: filterRange === value ? '#14b8a6' : '#52525b',
                          transition: 'all .15s',
                          letterSpacing: '0.04em',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {filterRange === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                    {[
                      { value: customStart, onChange: setCustomStart, placeholder: 'Start date' },
                      { value: customEnd, onChange: setCustomEnd, placeholder: 'End date' },
                    ].map((props, i) => (
                      <input
                        key={i}
                        type="date"
                        value={props.value}
                        onChange={e => props.onChange(e.target.value)}
                        style={{
                          padding: '8px 10px', borderRadius: 7, fontSize: 13,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          color: '#d4d4d8', fontFamily: 'monospace', outline: 'none',
                          colorScheme: 'dark',
                        }}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Right column: Charts */}
            <div ref={chartContainerRef}>
              <Panel style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 0 }}>
                  <SectionLabel>Analytics</SectionLabel>
                </div>
                <Suspense fallback={
                  <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: 12 }}>
                    loading charts…
                  </div>
                }>
                  {isChartVisible
                    ? <AnalyticsCharts expenses={filteredExpenses} />
                    : <div style={{ height: 440 }} />
                  }
                </Suspense>
              </Panel>
            </div>
          </div>

          {/* ── Ledger ── */}
          <Panel>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <div>
                <SectionLabel>Secure Ledger</SectionLabel>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: '#e4e4e7', margin: 0, letterSpacing: '-0.01em' }}>
                  Transaction Records
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleCSVExport}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 9,
                    background: 'rgba(20,184,166,0.08)',
                    border: '1px solid rgba(20,184,166,0.22)',
                    color: '#2dd4bf', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all .2s',
                    fontFamily: 'monospace',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(20,184,166,0.14)';
                    e.currentTarget.style.borderColor = 'rgba(20,184,166,0.35)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(20,184,166,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(20,184,166,0.22)';
                  }}
                >
                  <DownloadCloud style={{ width: 13, height: 13 }} />
                  Export CSV
                </button>

                <div style={{
                  padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(20,184,166,0.06)',
                  border: '1px solid rgba(20,184,166,0.15)',
                  fontSize: 12, color: '#14b8a6', fontFamily: 'monospace',
                }}>
                  {filteredExpenses.length} records
                </div>
              </div>
            </div>
            <Suspense fallback={
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: 12 }}>
                loading ledger…
              </div>
            }>
              <LedgerView expenses={filteredExpenses} onEdit={handleEditExpense} onDelete={handleDeleteExpense} />
            </Suspense>
          </Panel>

          {/* ── Footer note ── */}
          <div style={{
            marginTop: 24, padding: '10px 14px',
            background: 'rgba(245,158,11,0.03)',
            border: '1px solid rgba(245,158,11,0.1)',
            borderRadius: 8, fontSize: 12, color: '#57534e',
            fontFamily: 'monospace', lineHeight: 1.6,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: '#a16207' }}>⚠</span>
            All data is encrypted client-side. Passphrase is unrecoverable by design.
          </div>
        </div>
      </MainLayout>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
