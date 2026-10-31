const DB_NAME = 'race-data-swimmers';
const STORE = 'swimmers';
let connection;

export function validateProfile(profile) {
  const name = String(profile.name ?? '').trim();
  if (!name || name.length > 100) throw new Error('Enter a swimmer name (up to 100 characters).');
  const photo = profile.photo ?? null;
  if (photo !== null && (typeof photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 600000)) {
    throw new Error('Choose the photo again before saving.');
  }
  const newId = () => globalThis.crypto?.randomUUID?.() ?? `swimmer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id: profile.id || newId(), name, photo, updatedAt: new Date().toISOString() };
}

function database() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('This browser cannot save swimmer profiles.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Race Data tabs, then reload.'));
  }).catch(error => { connection = null; throw error; });
  return connection;
}

async function transact(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || new Error('Could not save the swimmer.'));
    tx.onabort = () => reject(tx.error || new Error('Swimmer save was cancelled.'));
  });
}

export async function listProfiles() {
  const profiles = await transact('readonly', store => store.getAll());
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveProfile(input) {
  const profile = validateProfile(input);
  await transact('readwrite', store => store.put(profile));
  // A denied persistence request never changes whether the save succeeded.
  void globalThis.navigator?.storage?.persist?.().catch(() => {});
  return profile;
}

export function removeProfile(id) { return transact('readwrite', store => store.delete(id)); }

async function loadImage(source) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('This photo could not be opened. Try a JPEG or PNG.'));
    img.src = source;
  });
  return img;
}

export async function readProfilePhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a photo smaller than 30 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 480);
    const crop = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - crop) / 2, (img.naturalHeight - crop) / 2, crop, crop, 0, 0, 480, 480);
    return canvas.toDataURL('image/jpeg', .88);
  } finally { URL.revokeObjectURL(url); }
}

export async function fadedReportPhoto(photo) {
  if (!photo) return null;
  const img = await loadImage(photo);
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 380;
  const ctx = canvas.getContext('2d');
  // Cover the portrait area without stretching; fade only toward bottom right.
  const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const fade = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  fade.addColorStop(0, '#ffffff00'); fade.addColorStop(.40, '#ffffff00');
  fade.addColorStop(.60, '#ffffff55'); fade.addColorStop(.87, '#ffffffff'); fade.addColorStop(1, '#ffffffff');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .9);
}
