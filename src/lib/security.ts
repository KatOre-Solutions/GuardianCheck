
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Simple obfuscation for "not plain text" storage that allows retrieval for "Show PIN"
export function obfuscatePin(pin: string): string {
  return btoa(pin.split('').reverse().join(''));
}

export function deobfuscatePin(obfuscated: string): string {
  try {
    return atob(obfuscated).split('').reverse().join('');
  } catch (e) {
    return "";
  }
}
