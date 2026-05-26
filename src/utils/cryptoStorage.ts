// AES-256-GCM 기반 localStorage 암호화 유틸리티
// 암호화 키는 IndexedDB에 분리 보관 (localStorage와 동일 위치 노출 방지)

const IDB_DB_NAME = 'ai-office-crypto'
const IDB_STORE_NAME = 'keys'
const KEY_ID = 'storage-key-v1'

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE_NAME) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase, id: string): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly')
    const req = tx.objectStore(IDB_STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbSet(db: IDBDatabase, id: string, value: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
    tx.objectStore(IDB_STORE_NAME).put(value, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let _key: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key
  const db = await openKeyDB()
  const raw = await idbGet(db, KEY_ID)
  if (raw) {
    _key = await crypto.subtle.importKey(
      'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    )
  } else {
    _key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    )
    const exported = await crypto.subtle.exportKey('raw', _key)
    await idbSet(db, KEY_ID, exported)
  }
  return _key
}

export async function encryptToBase64(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const out = new Uint8Array(12 + cipher.byteLength)
  out.set(iv)
  out.set(new Uint8Array(cipher), 12)
  return btoa(String.fromCharCode(...out))
}

export async function decryptFromBase64(data: string): Promise<string> {
  try {
    const key = await getKey()
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const iv = bytes.slice(0, 12)
    const cipher = bytes.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return new TextDecoder().decode(plain)
  } catch {
    // 복호화 실패 = 기존 평문 데이터 (마이그레이션 호환)
    return data
  }
}
