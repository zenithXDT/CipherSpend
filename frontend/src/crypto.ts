import { apiUrl } from '@/lib/api';

let seal: any;
let context: any;
let publicKey: any;
let secretKey: any;
let encryptor: any;
let decryptor: any;
let encoder: any;

const SCALE = Math.pow(2, 40);

export async function initSealBase(): Promise<void> {
  if (!seal) {
    const { default: SEAL } = await import('node-seal');
    const publicBase = import.meta.env.BASE_URL ?? '/';
    seal = await SEAL({
      locateFile: (file: string) =>
        file.endsWith('.wasm') ? `${publicBase}${file}` : file,
    });
  }
}

function createSealContext() {
  const schemeType = seal.SchemeType.ckks;
  const securityLevel = seal.SecLevelType.tc128;
  const polyModulusDegree = 8192;
  const bitSizes = Int32Array.from([60, 40, 40, 60]);
  
  const parms = new seal.EncryptionParameters(schemeType);
  parms.setPolyModulusDegree(polyModulusDegree);
  parms.setCoeffModulus(seal.CoeffModulus.Create(polyModulusDegree, bitSizes));

  context = new seal.SEALContext(parms, true, securityLevel);
  if (!context.parametersSet()) {
    throw new Error("Could not set the SEAL parameters in the given context.");
  }
  return parms;
}

// Web Crypto API Helpers
export async function deriveKEK(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: 600000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapSecretKey(skBase64: string, kek: CryptoKey): Promise<{ wrappedSkBase64: string, ivBase64: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    kek,
    enc.encode(skBase64)
  );
  
  // Safe Base64 encoding for massive WASM key arrays to prevent call stack overflow
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  
  return {
    wrappedSkBase64: btoa(binary),
    ivBase64: btoa(String.fromCharCode(...iv))
  };
}

export async function unwrapSecretKey(wrappedSkBase64: string, ivBase64: string, kek: CryptoKey): Promise<string> {
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(wrappedSkBase64), c => c.charCodeAt(0));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    kek,
    encrypted
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

export function generateSaltBase64(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...salt));
}

// Workflows

export async function generateVault(passphrase: string): Promise<{ salt: string, pk: string, wrapped_sk: string }> {
  await initSealBase();
  const parms = createSealContext();
  
  const keyGenerator = new seal.KeyGenerator(context);
  const sk = keyGenerator.secretKey();
  const pk = keyGenerator.createPublicKey();

  const skBase64 = sk.saveToBase64(seal.ComprModeType.none);
  const pkBase64 = pk.saveToBase64(seal.ComprModeType.none);

  const salt = generateSaltBase64();
  const kek = await deriveKEK(passphrase, salt);
  
  const { wrappedSkBase64, ivBase64 } = await wrapSecretKey(skBase64, kek);
  
  // Store iv with wrapped_sk for simplicity (iv:wrappedSk)
  const wrapped_sk = `${ivBase64}:${wrappedSkBase64}`;

  // Hydrate memory
  secretKey = sk;
  publicKey = pk;
  encoder = new seal.CKKSEncoder(context);
  encryptor = new seal.Encryptor(context, publicKey);
  decryptor = new seal.Decryptor(context, secretKey);

  // Sync context
  try {
    const parmsBase64 = parms.saveToBase64(seal.ComprModeType.none);
    await fetch(apiUrl('/api/context'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextBase64: parmsBase64 })
    });
  } catch (e) {
    console.warn("Backend not reachable for Context Sync.");
  }

  return { salt, pk: pkBase64, wrapped_sk };
}

export async function unlockVault(passphrase: string, salt: string, pkBase64: string, wrapped_sk: string): Promise<void> {
  await initSealBase();
  createSealContext();

  const kek = await deriveKEK(passphrase, salt);
  const [ivBase64, wrappedSkBase64] = wrapped_sk.split(':');
  
  const skBase64 = await unwrapSecretKey(wrappedSkBase64, ivBase64, kek);

  secretKey = new seal.SecretKey();
  secretKey.loadFromBase64(context, skBase64);
  
  publicKey = new seal.PublicKey();
  publicKey.loadFromBase64(context, pkBase64);

  encoder = new seal.CKKSEncoder(context);
  encryptor = new seal.Encryptor(context, publicKey);
  decryptor = new seal.Decryptor(context, secretKey);
}

export function encryptAmount(amount: number): string {
  if (!encryptor || !encoder || !seal || !context) throw new Error("Crypto not ready");
  const plainText = new seal.Plaintext();
  encoder.encode(Float64Array.from([amount]), SCALE, plainText);
  const cipherText = new seal.Ciphertext();
  encryptor.encrypt(plainText, cipherText);
  const base64 = cipherText.saveToBase64(seal.ComprModeType.none);
  plainText.delete();
  cipherText.delete();
  return base64;
}

export function decryptAmount(ciphertextBase64: string): number {
  if (!decryptor || !encoder || !seal || !context) throw new Error("Crypto not ready");
  const cipherText = new seal.Ciphertext();
  cipherText.loadFromBase64(context, ciphertextBase64);
  const plainText = new seal.Plaintext();
  decryptor.decrypt(cipherText, plainText);
  const decodedResult = encoder.decodeFloat64(plainText);
  const amount = decodedResult[0];
  cipherText.delete();
  plainText.delete();
  return amount;
}

export async function reWrapSecretKey(newPassphrase: string): Promise<{ newWrappedSk: string, newSalt: string }> {
  if (!secretKey || !seal || !context) throw new Error("Vault is locked or uninitialized");
  
  const skBase64 = secretKey.saveToBase64(seal.ComprModeType.none);
  const newSalt = generateSaltBase64();
  const newKek = await deriveKEK(newPassphrase, newSalt);
  
  const { wrappedSkBase64, ivBase64 } = await wrapSecretKey(skBase64, newKek);
  const newWrapped_sk = `${ivBase64}:${wrappedSkBase64}`;
  
  return { newWrappedSk: newWrapped_sk, newSalt };
}
