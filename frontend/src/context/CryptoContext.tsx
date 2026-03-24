import React, { createContext, useContext, useState } from 'react';
import { generateVault, unlockVault, encryptAmount, decryptAmount, reWrapSecretKey } from '../crypto';
import { apiUrl } from '@/lib/api';

interface CryptoContextType {
  isCryptoReady: boolean;
  token: string | null;
  email: string | null;
  registerAndGenerateVault: (email: string, passphrase: string) => Promise<void>;
  loginAndUnlockVault: (email: string, passphrase: string) => Promise<void>;
  logout: () => void;
  encryptAmount: (amount: number) => string;
  decryptAmount: (ciphertextBase64: string) => number;
  rotatePassphrase: (newPassphrase: string) => Promise<void>;
  exportWrappedKey: () => Promise<string>;
}

const CryptoContext = createContext<CryptoContextType>({
  isCryptoReady: false,
  token: null,
  email: null,
  registerAndGenerateVault: async () => {},
  loginAndUnlockVault: async () => {},
  logout: () => {},
  encryptAmount: () => { throw new Error('Crypto not ready'); },
  decryptAmount: () => { throw new Error('Crypto not ready'); },
  rotatePassphrase: async () => {},
  exportWrappedKey: () => { throw new Error('Crypto not ready'); },
});

export const useCrypto = () => useContext(CryptoContext);

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCryptoReady, setIsCryptoReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [wrappedSk, setWrappedSk] = useState<string | null>(null);

  const registerAndGenerateVault = async (userEmail: string, passphrase: string) => {
    // 1. Generate local vault
    const { salt, pk, wrapped_sk } = await generateVault(passphrase);
    
    // 2. Register user on backend
    const regRes = await fetch(apiUrl('/api/users/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: passphrase,
        salt,
        public_key: pk,
        wrapped_sk
      })
    });

    if (!regRes.ok) {
      const err = await regRes.json();
      throw new Error(err.detail || 'Registration failed');
    }

    // 3. Login to get token
    await loginAndUnlockVault(userEmail, passphrase);
  };

  const loginAndUnlockVault = async (userEmail: string, passphrase: string) => {
    // 1. Authenticate and get vault parameters
    const formData = new URLSearchParams();
    formData.append('username', userEmail);
    formData.append('password', passphrase);

    const loginRes = await fetch(apiUrl('/api/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    if (!loginRes.ok) {
      throw new Error('Invalid email or passphrase');
    }

    const data = await loginRes.json();
    const { access_token, salt, public_key, wrapped_sk } = data;

    // 2. Unlock local vault
    await unlockVault(passphrase, salt, public_key, wrapped_sk);

    // 3. Set ready state
    setWrappedSk(wrapped_sk);
    setToken(access_token);
    setEmail(userEmail);
    setIsCryptoReady(true);
  };

  const rotatePassphrase = async (newPassphrase: string) => {
    if (!token) throw new Error("Not authenticated");
    const { newWrappedSk, newSalt } = await reWrapSecretKey(newPassphrase);
    
    const res = await fetch(apiUrl('/api/users/key'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ salt: newSalt, wrapped_sk: newWrappedSk })
    });
    
    if (!res.ok) {
      throw new Error("Failed to sync new key with backend");
    }
    
    setWrappedSk(newWrappedSk);
  };

  const exportWrappedKey = async () => {
    if (!wrappedSk) throw new Error("No wrapped key available");
    return wrappedSk;
  };

  const logout = () => {
    setToken(null);
    setEmail(null);
    setWrappedSk(null);
    setIsCryptoReady(false);
    // In a real app we'd also clear the SEAL context, but reloading the page works best for WASM memory cleanup
    window.location.reload();
  };

  return (
    <CryptoContext.Provider value={{
      isCryptoReady,
      token,
      email,
      registerAndGenerateVault,
      loginAndUnlockVault,
      logout,
      encryptAmount,
      decryptAmount,
      rotatePassphrase,
      exportWrappedKey
    }}>
      {children}
    </CryptoContext.Provider>
  );
};
