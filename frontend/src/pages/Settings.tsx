import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useCrypto } from '@/context/CryptoContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { KeyRound, ShieldAlert, DownloadCloud, ArrowLeft, Copy, Settings2 } from 'lucide-react';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/currency';
import { getDefaultCurrency, setDefaultCurrency } from '@/lib/preferences';
import { apiUrl } from '@/lib/api';

/* ── Shared primitives (mirrors rest of suite) ── */

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 13px',
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${focused ? 'rgba(20,184,166,0.55)' : 'rgba(255,255,255,0.09)'}`,
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 13,
  fontFamily: '"IBM Plex Mono", monospace',
  outline: 'none',
  transition: 'border-color .2s, box-shadow .2s',
  boxShadow: focused ? '0 0 0 3px rgba(20,184,166,0.08)' : 'none',
  boxSizing: 'border-box' as const,
});

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 32px 10px 13px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 13,
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
  fontSize: 10,
  fontWeight: 700,
  color: '#52525b',
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  fontFamily: '"IBM Plex Mono", monospace',
  marginBottom: 6,
};

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: 80, height: 80,
        background: 'radial-gradient(circle at 0 0, rgba(20,184,166,0.06), transparent 70%)',
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#52525b',
      letterSpacing: '0.09em', textTransform: 'uppercase' as const,
      fontFamily: '"IBM Plex Mono", monospace',
      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
    }}>
      <span style={{ width: 16, height: 1, background: 'rgba(20,184,166,0.4)', display: 'inline-block' }} />
      {children}
    </div>
  );
}

/* ── Teal action button ── */
function TealBtn({
  children, onClick, disabled, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 9,
        background: disabled ? 'rgba(20,184,166,0.12)' : '#0d9488',
        border: '1px solid rgba(20,184,166,0.4)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        fontSize: 13, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.01em',
        boxShadow: disabled ? 'none' : '0 0 16px rgba(20,184,166,0.18)',
        transition: 'background .2s',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = '#0f766e'); }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget.style.background = '#0d9488'); }}
    >
      {children}
    </button>
  );
}

/* ── Ghost button ── */
function GhostBtn({
  children, onClick, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 9,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.09)',
        color: '#a1a1aa', fontSize: 13, fontWeight: 500,
        cursor: 'pointer', transition: 'all .15s',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
        e.currentTarget.style.color = '#f4f4f5';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
        e.currentTarget.style.color = '#a1a1aa';
      }}
    >
      {children}
    </button>
  );
}

/* ── VaultBadge (same as Dashboard) ── */
function VaultBadge({ label }: { label: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 6,
      background: 'rgba(20,184,166,0.07)',
      border: '1px solid rgba(20,184,166,0.2)',
      fontSize: 10, color: '#14b8a6',
      fontFamily: '"IBM Plex Mono", monospace',
      letterSpacing: '0.06em', fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#14b8a6', display: 'inline-block', boxShadow: '0 0 6px #14b8a6' }} />
      {label}
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN
───────────────────────────────────────── */
export default function Settings() {
  const { rotatePassphrase, exportWrappedKey, token, decryptAmount } = useCrypto();
  const [newPassphrase, setNewPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [defaultCurrency, setDefaultCurrencyState] = useState<SupportedCurrency>('LKR');
  const [focused, setFocused] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  useEffect(() => {
    try { setDefaultCurrencyState(getDefaultCurrency()); }
    catch { setDefaultCurrencyState('LKR'); }
  }, []);

  const handleDefaultCurrencyChange = (value: string) => {
    const next = value as SupportedCurrency;
    setDefaultCurrencyState(next);
    setDefaultCurrency(next);
    toast.success(`Default currency set to ${next}`);
  };

  const handleRotateKey = async () => {
    if (!newPassphrase) return;
    setIsRotating(true);
    toast('Rotating keys…', { description: 'Re-deriving KEK and wrapping secret key via AES-GCM.' });
    try {
      await rotatePassphrase(newPassphrase);
      toast.success('Passphrase changed. New encrypted key synced to server.');
      setNewPassphrase('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to rotate passphrase');
    } finally {
      setIsRotating(false);
    }
  };

  const handleBackup = async () => {
    try {
      const blob = await exportWrappedKey();
      navigator.clipboard.writeText(blob);
      toast.success('Wrapped Secret Key copied to clipboard.');
    } catch {
      toast.error('Could not export key');
    }
  };

  const handleCSVExport = async () => {
    if (!token) return;
    const id = toast.loading('Fetching encrypted data…');
    try {
      const res = await fetch(apiUrl('/api/expenses'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      toast.loading(`Decrypting ${data.length} rows locally…`, { id });
      let csv = 'data:text/csv;charset=utf-8,ID,Date,Currency,Category,Description,DecryptedAmount\n';
      data.forEach((exp: any) => {
        let val = 0;
        try { val = decryptAmount(exp.amountCiphertext); } catch { /* skip */ }
        csv += [exp.id, exp.timestamp, exp.currency || 'LKR', exp.category, `"${exp.description}"`, val.toFixed(2)].join(',') + '\r\n';
      });
      const link = document.createElement('a');
      link.href = encodeURI(csv);
      link.download = 'cipherspend_decrypted_export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV decrypted & exported.', { id });
    } catch {
      toast.error('Export failed', { id });
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080a0c',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Hex grid (same fixed background as all pages) */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', opacity: 0.025, pointerEvents: 'none', zIndex: 0 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hex-settings" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
            <polygon points="28,2 52,14 52,38 28,50 4,38 4,14" fill="none" stroke="#14b8a6" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-settings)" />
      </svg>

      <MainLayout>
        <div style={{
          maxWidth: 860, margin: '0 auto',
          position: 'relative', zIndex: 1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity .5s, transform .5s',
        }}>

          {/* ── Page header ── */}
          <div style={{ marginBottom: 32 }}>
            <VaultBadge label="VAULT SETTINGS" />
            <h2 style={{
              fontSize: 26, fontWeight: 700, color: '#f4f4f5',
              letterSpacing: '-0.02em', margin: '10px 0 4px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Settings2 style={{ color: '#14b8a6', width: 22, height: 22 }} />
              Vault Settings
            </h2>
            <p style={{ fontSize: 12, color: '#52525b', fontFamily: '"IBM Plex Mono", monospace', margin: '0 0 16px' }}>
              Advanced security, cryptographic keys &amp; preferences
            </p>
            <Link to="/dashboard" style={{ textDecoration: 'none' }}>
              <GhostBtn style={{ fontSize: 12, padding: '7px 14px' }}>
                <ArrowLeft size={13} />
                Back to Dashboard
              </GhostBtn>
            </Link>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 28 }} />

          {/* ── Two-col grid ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 20, alignItems: 'start',
          }}>

            {/* ── LEFT: Crypto Key Management ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'rgba(20,184,166,0.08)',
                  border: '1px solid rgba(20,184,166,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <KeyRound size={13} color="#14b8a6" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                  Cryptographic Key Management
                </span>
              </div>

              {/* Rotate passphrase */}
              <Panel>
                <SectionLabel>Change Master Passphrase</SectionLabel>
                <p style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.65, margin: '0 0 14px' }}>
                  Re-derives your KEK and re-encrypts your secret key on-device before syncing to the server.
                </p>

                <label style={labelStyle}>New passphrase</label>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="New strong passphrase"
                    value={newPassphrase}
                    onChange={e => setNewPassphrase(e.target.value)}
                    onFocus={() => setFocused('pass')}
                    onBlur={() => setFocused(null)}
                    style={{ ...inputStyle(focused === 'pass'), paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{
                      position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#52525b', fontSize: 14, padding: 4, transition: 'color .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#a1a1aa')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}
                  >
                    {showPass ? '🙈' : '👁'}
                  </button>
                </div>

                {/* Confirm dialog trigger */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <TealBtn disabled={!newPassphrase || isRotating} style={{ width: '100%', justifyContent: 'center' }}>
                      {isRotating ? (
                        <>
                          <span style={{
                            width: 12, height: 12, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.25)',
                            borderTopColor: '#fff',
                            display: 'inline-block',
                            animation: 'spin .7s linear infinite',
                          }} />
                          Re-wrapping SK…
                        </>
                      ) : 'Rotate Key & Update Server'}
                    </TealBtn>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.22)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <ShieldAlert size={15} color="#f87171" />
                        </div>
                        <AlertDialogTitle>Rotate Cryptographic Vault?</AlertDialogTitle>
                      </div>
                    </AlertDialogHeader>
                    <AlertDialogDescription>
                      This immediately re-encrypts your CKKS secret key with a new KEK derived from the new passphrase.
                      If you lose the new passphrase, your data is permanently inaccessible.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white border-none" onClick={handleRotateKey}>
                        Proceed with Rotation
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Panel>

              {/* Key backup */}
              <Panel>
                <SectionLabel>Backup AES-Wrapped SK</SectionLabel>
                <p style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.65, margin: '0 0 14px' }}>
                  Copies your fully encrypted homomorphic secret key blob to your clipboard. Safe to store — it cannot be decrypted without your passphrase.
                </p>
                <GhostBtn onClick={handleBackup} style={{ width: '100%', justifyContent: 'center' }}>
                  <Copy size={13} />
                  Copy <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#14b8a6', background: 'rgba(20,184,166,0.08)', padding: '1px 5px', borderRadius: 4 }}>wrapped_sk</code> Blob
                </GhostBtn>
              </Panel>
            </div>

            {/* ── RIGHT: Preferences ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Settings2 size={13} color="#71717a" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                  Preferences
                </span>
              </div>

              {/* Default currency */}
              <Panel>
                <SectionLabel>Default Currency</SectionLabel>
                <p style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.65, margin: '0 0 12px' }}>
                  Pre-selected when adding expenses and as the initial dashboard currency filter.
                </p>
                <div style={{ position: 'relative' }}>
                  <select
                    value={defaultCurrency}
                    onChange={e => handleDefaultCurrencyChange(e.target.value)}
                    style={selectStyle}
                  >
                    {SUPPORTED_CURRENCIES.map(cur => (
                      <option key={cur} value={cur} style={{ background: '#0c0e10' }}>{cur}</option>
                    ))}
                  </select>
                  <svg viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 10, pointerEvents: 'none' }}>
                    <path d="M1 1l4 4 4-4" stroke="#52525b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Panel>

              {/* CSV export */}
              <Panel>
                <SectionLabel>Data Export</SectionLabel>
                <p style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.65, margin: '0 0 14px' }}>
                  Downloads a decrypted CSV directly from browser memory. No plaintext is ever sent to the server.
                </p>
                <TealBtn onClick={handleCSVExport}>
                  <DownloadCloud size={14} />
                  Export Decrypted CSV Locally
                </TealBtn>
              </Panel>

              {/* Security notes */}
              <Panel style={{ padding: '16px 18px' }}>
                <SectionLabel>Security Notes</SectionLabel>
                {[
                  { icon: '🔑', text: 'PBKDF2-SHA256 · 600 000 iterations key derivation' },
                  { icon: '🔐', text: 'AES-256-GCM secret key wrapped at rest' },
                  { icon: '⚡', text: 'All decryption runs in your browser tab only' },
                  { icon: '⊕', text: 'CKKS SEAL context initialised locally via WASM' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '7px 0',
                    borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                    <span style={{ fontSize: 11, color: '#3f3f46', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.6 }}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </Panel>
            </div>
          </div>

          {/* ── Footer warning ── */}
          <div style={{
            marginTop: 24, padding: '10px 14px',
            background: 'rgba(245,158,11,0.03)',
            border: '1px solid rgba(245,158,11,0.1)',
            borderRadius: 8, fontSize: 11, color: '#57534e',
            fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.6,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: '#a16207' }}>⚠</span>
            Passphrase is unrecoverable by design. Keep it safe.
          </div>
        </div>
      </MainLayout>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
