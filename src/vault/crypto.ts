/** Vanilla vault v1. Each household member MUST use an independent secret. */
export type MemberId = "zekai" | "zewei" | "xiaofen";
export const MEMBERS: Record<MemberId, string> = { zekai: "哲愷", zewei: "哲緯", xiaofen: "曉芬" };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
const decode64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export interface VaultEnvelope { version: 1; member: MemberId; salt: string; iv: string; ciphertext: string; iterations: number; }
export async function deriveVaultKey(secret: string, salt: Uint8Array, iterations = 600000): Promise<CryptoKey> {
  if (secret.length < 12) throw new Error("請設定至少 12 字元的獨立加密密語");
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt: salt as BufferSource,iterations,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function encryptVault(member: MemberId, secret: string, data: unknown): Promise<VaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const key = await deriveVaultKey(secret, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode("vanilla:v1:"+member)},key,encoder.encode(JSON.stringify(data)));
  return {version:1,member,salt:encode64(salt),iv:encode64(iv),ciphertext:encode64(new Uint8Array(ciphertext)),iterations};
}
export async function decryptVault<T>(member: MemberId, secret: string, envelope: VaultEnvelope): Promise<T> {
  if (envelope.version !== 1 || envelope.member !== member || envelope.iterations !== 600000) throw new Error("保險庫格式或成員不符");
  const key = await deriveVaultKey(secret, decode64(envelope.salt), envelope.iterations);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:decode64(envelope.iv) as BufferSource,additionalData:encoder.encode("vanilla:v1:"+member)},key,decode64(envelope.ciphertext) as BufferSource);
  return JSON.parse(decoder.decode(plain)) as T;
}
