import { apiUrl } from '@/lib/api';

export interface EncryptedExpenseRow {
  category: string;
  amountCiphertext: string;
}

export interface DecryptedAggregation {
  total: number;
  byCategory: Record<string, number>;
}

export async function fetchAndDecryptExpenseAggregates(
  token: string,
  decryptAmount: (ciphertextBase64: string) => number
): Promise<DecryptedAggregation> {
  const res = await fetch(apiUrl('/api/expenses'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Fallback expenses fetch failed: ${res.status}`);
  }

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error('Fallback expenses payload is not an array');
  }

  let total = 0;
  const byCategory: Record<string, number> = {};

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const category = 'category' in row && typeof row.category === 'string' ? row.category : 'General';
    const ciphertext = 'amountCiphertext' in row && typeof row.amountCiphertext === 'string' ? row.amountCiphertext : '';
    if (!ciphertext) continue;

    try {
      const value = decryptAmount(ciphertext);
      if (!Number.isFinite(value)) continue;
      total += value;
      byCategory[category] = (byCategory[category] ?? 0) + value;
    } catch (error) {
      console.warn('Fallback decrypt failed for one expense row', error);
    }
  }

  return { total, byCategory };
}
