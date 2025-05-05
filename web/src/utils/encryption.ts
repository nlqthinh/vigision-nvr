const secret = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // 32 characters long

function xorEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function xorDecrypt(encrypted: string, key: string): string {
  const decoded = atob(encrypted);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

export function encrypt(text: string): string {
  return xorEncrypt(text, secret);
}

export function decrypt(encrypted: string): string {
  return xorDecrypt(encrypted, secret);
}
