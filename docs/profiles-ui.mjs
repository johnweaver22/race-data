import { listProfiles, saveProfile, removeProfile, readProfilePhoto } from './profiles.mjs';

export function initializeProfiles() {
  const $ = id => document.getElementById(id);
  let profiles = [], editorId = '', editorPhoto = null, photoGeneration = 0;
  const status = message => { $('profile-status').textContent = message; };
  const option = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
  function racePhoto() {
    const profile = profiles.find(p => p.id === $('race-profile').value);
    const selected = profile && profile.name === $('swimmer').value.trim() ? profile : null;
    const img = $('race-profile-photo');
    img.hidden = !selected?.photo;
    if (selected?.photo) img.src = selected.photo;
    else img.removeAttribute('src');
    return selected;
  }
  function paintEditorPhoto() {
    $('profile-photo').hidden = !editorPhoto;
    $('profile-initials').hidden = !!editorPhoto;
    $('profile-initials').textContent = $('profile-name').value.trim().split(/\s+/).map(v => v[0] ?? '').slice(0, 2).join('').toUpperCase() || 'RL';
    if (editorPhoto) $('profile-photo').src = editorPhoto;
    else $('profile-photo').removeAttribute('src');
    $('remove-photo').hidden = !editorPhoto;
  }
  function edit(id = '') {
    photoGeneration++;
    const profile = profiles.find(p => p.id === id);
    editorId = profile?.id ?? ''; editorPhoto = profile?.photo ?? null;
    $('profile-picker').value = editorId;
    $('profile-name').value = profile?.name ?? '';
    $('profile-editor-title').textContent = profile ? 'EDIT SWIMMER' : 'ADD SWIMMER';
    $('delete-profile').hidden = !profile;
    $('save-profile').disabled = false;
    status(''); paintEditorPhoto();
  }
  async function refresh() {
    const raceId = $('race-profile').value;
    profiles = await listProfiles();
    $('profile-picker').replaceChildren(option('', 'New swimmer'), ...profiles.map(p => option(p.id, p.name)));
    $('race-profile').replaceChildren(option('', 'Enter a name below'), ...profiles.map(p => option(p.id, p.name)));
    if (profiles.some(p => p.id === raceId)) $('race-profile').value = raceId;
    $('profile-count').textContent = profiles.length ? `${profiles.length} saved swimmer${profiles.length === 1 ? '' : 's'}.` : 'No saved swimmers yet.';
    racePhoto();
  }
  $('race-profile').addEventListener('change', () => {
    const profile = profiles.find(p => p.id === $('race-profile').value);
    if (profile) { $('swimmer').value = profile.name; $('swimmer').setCustomValidity(''); }
    racePhoto();
  });
  $('swimmer').addEventListener('input', () => {
    if (!racePhoto()) $('race-profile').value = '';
  });
  $('profile-picker').addEventListener('change', () => edit($('profile-picker').value));
  $('new-profile').addEventListener('click', () => { edit(); $('profile-name').focus(); });
  $('profile-name').addEventListener('input', paintEditorPhoto);
  $('choose-photo').addEventListener('click', () => $('photo-upload').click());
  $('take-photo').addEventListener('click', () => $('photo-camera').click());
  for (const id of ['photo-upload', 'photo-camera']) $(id).addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const generation = ++photoGeneration;
    $('save-profile').disabled = true; status('Opening photo…');
    try {
      const photo = await readProfilePhoto(file);
      if (generation !== photoGeneration) return;
      editorPhoto = photo; paintEditorPhoto(); status('Photo ready. Save swimmer to keep it.');
    } catch (error) { if (generation === photoGeneration) status(error.message); }
    finally { if (generation === photoGeneration) $('save-profile').disabled = false; }
  });
  $('remove-photo').addEventListener('click', () => {
    photoGeneration++; editorPhoto = null; paintEditorPhoto(); $('save-profile').disabled = false;
    status('Photo removed. Save swimmer to keep this change.');
  });
  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('save-profile').disabled) return;
    $('save-profile').disabled = true;
    try {
      const profile = await saveProfile({ id: editorId, name: $('profile-name').value, photo: editorPhoto });
      // Use the edited/created swimmer in the next race setup, but completed
      // captures retain their original name and photo snapshot.
      await refresh(); edit(profile.id);
      $('race-profile').value = profile.id; $('swimmer').value = profile.name; racePhoto();
      status('Swimmer saved on this device.');
    } catch (error) { status(`Could not save. ${error.message}`); }
    finally { $('save-profile').disabled = false; }
  });
  $('delete-profile').addEventListener('click', () => {
    $('delete-profile-dialog').returnValue = 'cancel'; $('delete-profile-dialog').showModal();
  });
  $('delete-profile-dialog').addEventListener('close', async () => {
    if ($('delete-profile-dialog').returnValue !== 'delete') return;
    try { await removeProfile(editorId); await refresh(); edit(); status('Swimmer deleted from this device.'); }
    catch (error) { status(`Could not delete. ${error.message}`); }
  });
  void refresh().catch(() => status('Profiles are unavailable. Check browser storage, then reload. You can still enter a name for a race.'));
  return { forRace: () => { const p = racePhoto(); return { profileId: p?.id ?? null, photo: p?.photo ?? null }; } };
}
