// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bxcqjjzxwkqytcmpyfuj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3Fqanp4d2txeXRjbXB5ZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDQ3MjQsImV4cCI6MjA5Mjg4MDcyNH0.edQEf7WwkXQlLClOSBf8pze4rA2kywU9b_v-IVy3oUA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Admin email - only this user sees admin panel
const ADMIN_EMAIL = 'jsantospro3@gmail.com';

const ALLERGENS = [
  { id: 'gluten',     label: 'Gluten',       emoji: '🌾' },
  { id: 'leche',      label: 'Leche',        emoji: '🥛' },
  { id: 'huevo',      label: 'Huevo',        emoji: '🥚' },
  { id: 'frutos',     label: 'Frutos secos', emoji: '🥜' },
  { id: 'cacahuete',  label: 'Cacahuete',    emoji: '🫘' },
  { id: 'soja',       label: 'Soja',         emoji: '🫱' },
  { id: 'pescado',    label: 'Pescado',      emoji: '🐟' },
  { id: 'crustaceos', label: 'Crustáceos',   emoji: '🦐' },
  { id: 'moluscos',   label: 'Moluscos',     emoji: '🦪' },
  { id: 'sesamo',     label: 'Sésamo',       emoji: '🌿' },
  { id: 'mostaza',    label: 'Mostaza',      emoji: '🌭' },
  { id: 'apio',       label: 'Apio',         emoji: '🥬' },
  { id: 'sulfitos',   label: 'Sulfitos',     emoji: '🍷' },
  { id: 'altramuz',   label: 'Altramuz',     emoji: '🌸' },
];

const CHILD_EMOJIS = ['👦','👧','🧒','👶','🦁','🐯','🐻','🦊','🐼','🐨','🦄','⭐'];

let state = {
  user: null, profile: null, children: [], activeChild: null,
  scanMode: 'label', selectedEmoji: '👦', selectedAllergens: [],
  pendingAllergenId: null, editingChildId: null, recognition: null,
  childDocs: [], // docs for the child being edited/created
};

// ── Init ───────────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { state.user = session.user; await loadUserData(); showScreen('screenHome'); }
  else showScreen('screenAuth');

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user; await loadUserData(); showScreen('screenHome');
    } else if (event === 'SIGNED_OUT') {
      state = { ...state, user: null, profile: null, children: [], activeChild: null };
      showScreen('screenAuth');
    }
  });

  renderEmojiPicker();
  renderAllergenGrid();
  document.getElementById('fileInput').addEventListener('change', handleFileInput);
  document.getElementById('fileInputGallery').addEventListener('change', handleFileInput);
  // Inyectar estilos del banner
  const bannerStyle = document.createElement('style');
  bannerStyle.textContent = `
    .app-banner { width:100%; padding:8px 16px 0; box-sizing:border-box; }
    .app-banner-img { width:100%; height:auto; border-radius:12px; display:block; object-fit:cover; max-height:90px; }
    .app-banner--result { padding:16px 16px 0; }
  `;
  document.head.appendChild(bannerStyle);
})();

// ── Auth ───────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tabLogin').classList.toggle('hidden', tab !== 'login');
  document.getElementById('tabRegister').classList.toggle('hidden', tab !== 'register');
  hideAuthError();
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) return showAuthError('Completa todos los campos');
  setAuthLoading('loginBtnText', 'Entrando...');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  setAuthLoading('loginBtnText', 'Entrar');
  if (error) showAuthError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message);
}

async function register() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) return showAuthError('Completa todos los campos');
  if (pass.length < 6) return showAuthError('La contraseña debe tener al menos 6 caracteres');
  setAuthLoading('regBtnText', 'Creando cuenta...');
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
  setAuthLoading('regBtnText', 'Crear cuenta gratis');
  if (error) showAuthError(error.message);
  else showAuthError('✅ Cuenta creada. Puedes entrar ahora.', true);
}

async function logout() { await sb.auth.signOut(); }
function showAuthError(msg, ok=false) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.color = ok ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
}
function hideAuthError() { document.getElementById('authError').classList.add('hidden'); }
function setAuthLoading(id, text) { document.getElementById(id).textContent = text; }

// ── Load data ──────────────────────────────────────────────────────────────────
async function loadUserData() {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = profile;
  const { data: children } = await sb.from('children').select('*').eq('user_id', state.user.id).order('created_at');
  state.children = children || [];
  if (state.children.length > 0 && !state.activeChild) state.activeChild = state.children[0];

  // Show admin button if admin
  if (state.user.email === ADMIN_EMAIL) {
    const topbar = document.querySelector('#screenHome .topbar-right');
    if (topbar && !document.getElementById('adminBtn')) {
      const btn = document.createElement('button');
      btn.id = 'adminBtn';
      btn.className = 'topbar-btn';
      btn.title = 'Admin';
      btn.innerHTML = '⚙️';
      btn.style.fontSize = '16px';
      btn.onclick = () => { showScreen('screenAdmin'); loadAdminData(); };
      topbar.prepend(btn);
    }
  }

  renderHome(); renderProfileScreen();
}

// ── Render home ────────────────────────────────────────────────────────────────
function renderHome() {
  const inner = document.getElementById('childBarInner');
  inner.innerHTML = '';
  state.children.forEach(child => {
    const chip = document.createElement('button');
    chip.className = 'child-chip' + (state.activeChild?.id === child.id ? ' active' : '');
    chip.innerHTML = `<span class="child-chip-emoji">${child.emoji}</span>${child.name}`;
    chip.onclick = () => { state.activeChild = child; renderHome(); };
    inner.appendChild(chip);
  });
  if (state.activeChild) {
    const a = state.activeChild.allergens || [];
    document.getElementById('heroChildName').textContent = state.activeChild.name;
    document.getElementById('heroBadgeEmoji').textContent = state.activeChild.emoji;
    document.getElementById('heroAllergens').textContent = a.length ? a.map(x => x.label).join(' · ') : 'Sin alérgenos configurados';
  } else {
    document.getElementById('heroChildName').textContent = 'Añade un hijo';
    document.getElementById('heroBadgeEmoji').textContent = '👶';
    document.getElementById('heroAllergens').textContent = 'Toca + para crear un perfil';
  }
  // Sin límites durante beta — scansBar eliminado
}

// ── Render profile ─────────────────────────────────────────────────────────────
function renderProfileScreen() {
  if (!state.user) return;
  const name = state.profile?.name || state.user.email.split('@')[0];
  document.getElementById('profileAvatar').textContent = name[0].toUpperCase();
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileEmail').textContent = state.user.email;
  document.getElementById('planLabel').textContent = `Plan ${state.profile?.plan === 'premium' ? 'PREMIUM ⭐' : 'GRATUITO'}`;

  const list = document.getElementById('profileChildrenList');
  list.innerHTML = '';
  state.children.forEach(child => {
    const card = document.createElement('div');
    card.className = 'child-profile-card';
    card.innerHTML = `
      <span class="child-profile-emoji">${child.emoji}</span>
      <div style="flex:1">
        <p class="child-profile-name">${child.name}</p>
        <p class="child-profile-allergens">${(child.allergens||[]).map(a=>a.label).join(', ')||'Sin alérgenos'}</p>
      </div>
      <button class="edit-child-btn" onclick="openEditChild('${child.id}')">✏️ Editar</button>`;
    list.appendChild(card);
  });
}

// ── Add / Edit child ───────────────────────────────────────────────────────────
function openAddChild() {
  state.editingChildId = null; state.selectedEmoji = '👦'; state.selectedAllergens = []; state.childDocs = [];
  document.getElementById('childName').value = '';
  document.getElementById('addChildTitle').textContent = 'Añadir hijo';
  document.getElementById('saveChildBtnText').textContent = 'Guardar perfil';
  document.getElementById('childError').classList.add('hidden');
  document.getElementById('childDocsList').innerHTML = '';
  renderEmojiPicker(); renderAllergenGrid(); showScreen('screenAddChild');
}

async function openEditChild(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;
  state.editingChildId = childId;
  state.selectedEmoji = child.emoji;
  state.selectedAllergens = [...(child.allergens || [])];
  state.childDocs = [];
  document.getElementById('childName').value = child.name;
  document.getElementById('addChildTitle').textContent = 'Editar perfil';
  document.getElementById('saveChildBtnText').textContent = 'Guardar cambios';
  document.getElementById('childError').classList.add('hidden');
  renderEmojiPicker(); renderAllergenGrid();
  await loadChildDocs(childId);
  showScreen('screenAddChild');
}

async function loadChildDocs(childId) {
  const { data } = await sb.from('documents').select('*').eq('child_id', childId).order('created_at');
  state.childDocs = data || [];
  renderChildDocsList();
}

function renderChildDocsList() {
  const list = document.getElementById('childDocsList');
  list.innerHTML = '';
  state.childDocs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    item.innerHTML = `
      <span class="doc-item-icon">📄</span>
      <span class="doc-item-name">${doc.name}</span>
      <span class="doc-item-size">${formatBytes(doc.size || 0)}</span>
      <button class="doc-item-del" onclick="deleteChildDoc('${doc.id}', '${doc.path}')" title="Eliminar">✕</button>`;
    list.appendChild(item);
  });
}

async function uploadChildDoc() {
  const input = document.getElementById('childDocInput');
  const files = Array.from(input.files);
  if (!files.length) return;

  // Need childId — if creating new, save child first
  let childId = state.editingChildId;
  if (!childId) {
    const name = document.getElementById('childName').value.trim();
    if (!name) { document.getElementById('childError').textContent = 'Guarda el perfil del hijo antes de subir documentos'; document.getElementById('childError').classList.remove('hidden'); return; }
    const { data, error } = await sb.from('children').insert({ user_id: state.user.id, name, emoji: state.selectedEmoji, allergens: state.selectedAllergens }).select().single();
    if (error) return;
    state.editingChildId = data.id; childId = data.id;
    state.children.push(data); state.activeChild = data;
  }

  const list = document.getElementById('childDocsList');
  for (const file of files) {
    const uploading = document.createElement('p');
    uploading.className = 'doc-uploading'; uploading.textContent = `Subiendo ${file.name}...`;
    list.appendChild(uploading);

    const path = `children/${childId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, file);
    list.removeChild(uploading);
    if (upErr) { alert('Error subiendo: ' + upErr.message); continue; }

    const { data } = await sb.from('documents').insert({
      user_id: state.user.id, child_id: childId,
      name: file.name, path, size: file.size, type: 'child'
    }).select().single();
    if (data) state.childDocs.push(data);
  }
  renderChildDocsList();
  input.value = '';
}

async function deleteChildDoc(docId, path) {
  if (!confirm('¿Eliminar este documento?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', docId);
  state.childDocs = state.childDocs.filter(d => d.id !== docId);
  renderChildDocsList();
}

function renderEmojiPicker() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  CHILD_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-option' + (emoji === state.selectedEmoji ? ' selected' : '');
    btn.textContent = emoji;
    btn.onclick = () => { state.selectedEmoji = emoji; document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); };
    grid.appendChild(btn);
  });
}

function renderAllergenGrid() {
  const grid = document.getElementById('allergenGrid');
  grid.innerHTML = '';
  ALLERGENS.forEach(a => {
    const sel = state.selectedAllergens.find(x => x.id === a.id);
    const chip = document.createElement('button');
    chip.className = 'allergen-chip' + (sel ? ' selected' : '');
    const sE = sel?.severity === 'leve' ? '🟡' : sel?.severity === 'moderada' ? '🟠' : sel?.severity === 'grave' ? '🔴' : '';
    chip.innerHTML = `<span class="allergen-chip-name">${a.emoji} ${a.label}</span>${sel ? `<span class="allergen-chip-severity">${sE} ${sel.severity}</span>` : ''}`;
    chip.onclick = () => {
      if (sel) { state.selectedAllergens = state.selectedAllergens.filter(x => x.id !== a.id); renderAllergenGrid(); }
      else { state.pendingAllergenId = a.id; openSeverityModal(a.label); }
    };
    grid.appendChild(chip);
  });
}

function openSeverityModal(name) { document.getElementById('modalAllergenName').textContent = name; document.getElementById('severityModal').classList.remove('hidden'); }
function closeSeverityModal() { document.getElementById('severityModal').classList.add('hidden'); state.pendingAllergenId = null; }
function selectSeverity(severity) {
  const a = ALLERGENS.find(x => x.id === state.pendingAllergenId);
  if (a) state.selectedAllergens.push({ ...a, severity });
  closeSeverityModal(); renderAllergenGrid();
}

async function saveChild() {
  const name = document.getElementById('childName').value.trim();
  if (!name) { document.getElementById('childError').textContent = 'El nombre es obligatorio'; document.getElementById('childError').classList.remove('hidden'); return; }
  const payload = { name, emoji: state.selectedEmoji, allergens: state.selectedAllergens };

  if (state.editingChildId) {
    const { data, error } = await sb.from('children').update(payload).eq('id', state.editingChildId).select().single();
    if (error) { document.getElementById('childError').textContent = 'Error: ' + error.message; document.getElementById('childError').classList.remove('hidden'); return; }
    const idx = state.children.findIndex(c => c.id === state.editingChildId);
    if (idx !== -1) state.children[idx] = data;
    if (state.activeChild?.id === state.editingChildId) state.activeChild = data;
  } else {
    const { data, error } = await sb.from('children').insert({ user_id: state.user.id, ...payload }).select().single();
    if (error) { document.getElementById('childError').textContent = 'Error: ' + error.message; document.getElementById('childError').classList.remove('hidden'); return; }
    state.children.push(data); state.activeChild = data;
  }

  state.selectedAllergens = []; state.selectedEmoji = '👦'; state.editingChildId = null; state.childDocs = [];
  document.getElementById('childName').value = '';
  document.getElementById('childError').classList.add('hidden');
  renderHome(); renderProfileScreen(); showScreen('screenHome');
}

// ── Admin ──────────────────────────────────────────────────────────────────────
async function loadAdminData() {
  // Stats
  const { count: usersCount } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const { count: scansCount } = await sb.from('scans').select('*', { count: 'exact', head: true });
  const { count: childrenCount } = await sb.from('children').select('*', { count: 'exact', head: true });
  document.getElementById('statUsers').textContent = usersCount || 0;
  document.getElementById('statScans').textContent = scansCount || 0;
  document.getElementById('statChildren').textContent = childrenCount || 0;

  // Admin docs (Laztan knowledge base)
  const { data: docs } = await sb.from('documents').select('*').eq('type', 'admin').order('created_at', { ascending: false });
  renderAdminDocs(docs || []);

  // Recent users
  const { data: users } = await sb.from('profiles').select('id, name, plan, scans_this_month').order('created_at', { ascending: false }).limit(10);
  renderAdminUsers(users || []);
}

function renderAdminDocs(docs) {
  const list = document.getElementById('adminDocsList');
  list.innerHTML = '';
  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    item.innerHTML = `
      <span class="doc-item-icon">📖</span>
      <span class="doc-item-name">${doc.name}</span>
      <span class="doc-item-size">${formatBytes(doc.size || 0)}</span>
      <button class="doc-item-del" onclick="deleteAdminDoc('${doc.id}', '${doc.path}')" title="Eliminar">✕</button>`;
    list.appendChild(item);
  });
}

function renderAdminUsers(users) {
  const list = document.getElementById('adminUsersList');
  list.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'admin-user-row';
    row.innerHTML = `
      <span class="admin-user-email">${u.name || 'Usuario'}</span>
      <span class="admin-user-plan">${(u.plan || 'free').toUpperCase()}</span>
      <span class="admin-user-scans">${u.scans_this_month || 0} escaneos</span>`;
    list.appendChild(row);
  });
}

async function uploadAdminDoc() {
  const input = document.getElementById('adminDocInput');
  const files = Array.from(input.files);
  const list = document.getElementById('adminDocsList');

  for (const file of files) {
    const uploading = document.createElement('p');
    uploading.className = 'doc-uploading'; uploading.textContent = `Subiendo ${file.name}...`;
    list.prepend(uploading);

    const path = `admin/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, file);
    list.removeChild(uploading);
    if (upErr) { alert('Error: ' + upErr.message); continue; }

    await sb.from('documents').insert({
      user_id: state.user.id, name: file.name, path, size: file.size, type: 'admin'
    });
  }
  input.value = '';
  await loadAdminData();
}

async function deleteAdminDoc(docId, path) {
  if (!confirm('¿Eliminar este protocolo?')) return;
  await sb.storage.from('documents').remove([path]);
  await sb.from('documents').delete().eq('id', docId);
  await loadAdminData();
}

// ── Scan ───────────────────────────────────────────────────────────────────────
function triggerCamera(mode) {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = mode; document.getElementById('fileInput').click();
}

function triggerUpload(mode) {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = mode; document.getElementById('fileInputGallery').click();
}

function showTextInput() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = 'text';
  document.getElementById('textInputArea').classList.toggle('hidden');
  document.getElementById('voiceUI').classList.add('hidden');
}

async function handleFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;
  showLoading('Procesando imagen...', 'Comprimiendo para análisis');
  try {
    const dataUrl = await compressImageFromFile(file);
    hideLoading();
    await analyze(dataUrl, state.scanMode);
  } catch(err) {
    hideLoading();
    document.getElementById('scanStatus').textContent = '⚠️ Error al procesar imagen: ' + err.message;
  }
  e.target.value = '';
}

async function analyzeText() {
  const text = document.getElementById('manualText').value.trim();
  if (!text) return;
  await analyze(text, 'text');
}

async function analyze(data, mode) {
  if (!checkScanLimit()) return;
  showLoading(mode === 'menu' ? 'Analizando menú...' : 'Analizando ingredientes...', 'IA con protocolos Laztan');
  try {
    // Check image size before sending (base64 > 900KB = probable timeout)
    if (mode !== 'text' && data.length > 900000) {
      throw new Error('Imagen demasiado grande. Fotografía solo la etiqueta de ingredientes, más cerca y con buena luz.');
    }

    // Load admin docs context (Laztan knowledge base)
    const { data: adminDocs } = await sb.from('documents').select('name, path').eq('type', 'admin').limit(5);
    // Load child docs context
    const childDocs = state.activeChild
      ? (await sb.from('documents').select('name, path').eq('child_id', state.activeChild.id).limit(3)).data || []
      : [];

    // AbortController para timeout de 25 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let res;
    try {
      res = await fetch('/.netlify/functions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          imageDataUrl: data,
          allergens: state.activeChild?.allergens || [],
          childName: state.activeChild?.name || 'tu hijo',
          mode,
          adminDocNames: (adminDocs || []).map(d => d.name),
          childDocNames: childDocs.map(d => d.name),
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Detectar si Netlify devuelve HTML en vez de JSON (función no encontrada)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Respuesta no-JSON de la función:', text.substring(0, 200));
      throw new Error('Error de configuración del servidor. Contacta con soporte.');
    }

    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Error en el análisis');
    hideLoading(); showResult(result);
    saveScan(result).catch(e => console.warn('[SafeBite] saveScan bg error:', e.message));
    incrementScans().catch(e => console.warn('[SafeBite] incrementScans bg error:', e.message));
  } catch (err) {
    hideLoading();
    let msg = err.message;
    if (err.name === 'AbortError') msg = 'Tiempo de espera agotado. Inténtalo de nuevo.';
    document.getElementById('scanStatus').textContent = '⚠️ ' + msg;
  }
}

function checkScanLimit() {
  return true; // Sin límites durante beta
}

async function incrementScans() {
  try {
    const n = (state.profile?.scans_this_month || 0) + 1;
    await sb.from('profiles').update({ scans_this_month: n }).eq('id', state.user.id);
    if (state.profile) state.profile.scans_this_month = n;
    renderHome();
  } catch(e) {
    console.warn('[SafeBite] incrementScans error (no crítico):', e.message);
  }
}

async function saveScan(result) {
  try {
    const { error } = await sb.from('scans').insert({
      user_id: state.user.id, child_id: state.activeChild?.id,
      result: result.explanation, status: result.status,
      ingredients: result.ingredients_found || '', risks: result.risks || [],
    });
    if (error) console.warn('[SafeBite] saveScan error (no crítico):', error.message);
  } catch(e) {
    console.warn('[SafeBite] saveScan excepción (no crítico):', e.message);
  }
}

// ── Show result ────────────────────────────────────────────────────────────────
function showResult(result) {
  const card = document.getElementById('resultCard');
  card.className = 'result-status-card';
  const map = { APTO: ['🟢','var(--green)','apto'], PRECAUCION: ['🟡','var(--amber)','precaucion'] };
  const [icon, color, cls] = map[result.status] || ['🔴','var(--red)','no-apto'];
  card.classList.add(cls);
  document.getElementById('resultIcon').textContent = icon;
  document.getElementById('resultTitle').textContent = result.status;
  document.getElementById('resultTitle').style.color = color;
  document.getElementById('resultChild').textContent = state.activeChild ? `Perfil: ${state.activeChild.emoji} ${state.activeChild.name}` : '';
  document.getElementById('resultExplanation').textContent = result.explanation || '';

  const rL = document.getElementById('risksList'); rL.innerHTML = '';
  if (result.risks?.length) { result.risks.forEach(r => { const c = document.createElement('span'); c.className = 'risk-chip'; c.textContent = r; rL.appendChild(c); }); document.getElementById('risksBlock').style.display = 'block'; }
  else document.getElementById('risksBlock').style.display = 'none';

  const hL = document.getElementById('hiddenList'); hL.innerHTML = '';
  if (result.hidden_allergens?.length) { result.hidden_allergens.forEach(h => { const c = document.createElement('span'); c.className = 'hidden-chip'; c.textContent = h; hL.appendChild(c); }); document.getElementById('hiddenBlock').style.display = 'block'; }
  else document.getElementById('hiddenBlock').style.display = 'none';

  if (result.ingredients_found) { document.getElementById('ingredientsFound').textContent = result.ingredients_found; document.getElementById('ingredientsBlock').style.display = 'block'; }
  else document.getElementById('ingredientsBlock').style.display = 'none';

  showScreen('screenResult');
}

function resetScan() {
  document.getElementById('manualText').value = '';
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('scanStatus').textContent = '';
  showScreen('screenHome');
}

// ── Voice ──────────────────────────────────────────────────────────────────────
function startVoice() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome.'); return; }
  state.recognition = new SR();
  state.recognition.lang = 'es-ES'; state.recognition.continuous = false; state.recognition.interimResults = true;
  document.getElementById('voiceUI').classList.remove('hidden');
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('voiceTranscript').textContent = '';
  state.recognition.onresult = e => { document.getElementById('voiceTranscript').textContent = Array.from(e.results).map(r => r[0].transcript).join(''); };
  state.recognition.onend = async () => {
    const t = document.getElementById('voiceTranscript').textContent;
    document.getElementById('voiceUI').classList.add('hidden');
    if (t.trim()) await analyze(t, 'text');
  };
  state.recognition.onerror = () => document.getElementById('voiceUI').classList.add('hidden');
  state.recognition.start();
  document.getElementById('voiceStatus').textContent = 'Escuchando... habla ahora';
}

function stopVoice() { if (state.recognition) state.recognition.stop(); document.getElementById('voiceUI').classList.add('hidden'); }

// ── WhatsApp ───────────────────────────────────────────────────────────────────
function contactExpert() {
  const child = state.activeChild;
  const allergens = child?.allergens?.map(a => `${a.label} (${a.severity})`).join(', ') || 'no especificados';
  const msg = encodeURIComponent(`Hola, soy usuario de SafeBite.\n\nPerfil: ${child?.name || 'mi hijo'}\nAlergias: ${allergens}\n\nTengo una consulta sobre seguridad alimentaria.`);
  window.open(`https://wa.me/34946489032?text=${msg}`, '_blank');
}

// ── History ────────────────────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="empty-state">Cargando...</p>';
  const { data: scans } = await sb.from('scans').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(20);
  if (!scans?.length) { list.innerHTML = '<p class="empty-state">No hay escaneos todavía.<br/>¡Escanea tu primer producto!</p>'; return; }
  list.innerHTML = '';
  scans.forEach(scan => {
    const icon = scan.status === 'APTO' ? '🟢' : scan.status === 'PRECAUCION' ? '🟡' : '🔴';
    const cls  = scan.status === 'APTO' ? 'apto' : scan.status === 'PRECAUCION' ? 'precaucion' : 'no-apto';
    const date = new Date(scan.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<span class="history-icon">${icon}</span><div style="flex:1;min-width:0"><p class="history-status ${cls}">${scan.status}</p><p class="history-explanation">${scan.result||'—'}</p></div><span class="history-date">${date}</span>`;
    list.appendChild(item);
  });
}

// ── Screen routing ─────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
  const t = document.getElementById(id);
  if (t) { t.classList.remove('hidden'); t.classList.add('active'); }
  if (id === 'screenHistory') loadHistory();
  if (id === 'screenAddChild') { renderEmojiPicker(); renderAllergenGrid(); }
}

// ── Loading ────────────────────────────────────────────────────────────────────
function showLoading(text='Analizando...', sub='') {
  let o = document.getElementById('loadingOverlay');
  if (!o) { o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay'; document.body.appendChild(o); }
  o.innerHTML = `<div class="loading-spinner"></div><p class="loading-text">${text}</p>${sub?`<p class="loading-sub">${sub}</p>`:''}`;
  o.classList.remove('hidden');
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if (o) o.classList.add('hidden'); }

// ── Utils ──────────────────────────────────────────────────────────────────────
function toDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer')); r.readAsDataURL(file); });
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// ── Image compression ─────────────────────────────────────────────────────────
// Comprime directamente desde File (evita cargar imagen entera en memoria en móvil)
function compressImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Máximo 600px — suficiente para OCR de etiquetas, mínimo peso
      const MAX = 600;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      // Calidad 0.6 → base64 resultante ~80-150KB, bien dentro del límite de 1MB
      let result = canvas.toDataURL('image/jpeg', 0.6);

      // Doble check: si aún supera 500KB base64, reducir más
      if (result.length > 500000) {
        const canvas2 = document.createElement('canvas');
        const scale = Math.sqrt(450000 / result.length);
        canvas2.width = Math.round(width * scale);
        canvas2.height = Math.round(height * scale);
        canvas2.getContext('2d').drawImage(img, 0, 0, canvas2.width, canvas2.height);
        result = canvas2.toDataURL('image/jpeg', 0.55);
      }

      console.log('[SafeBite] Imagen comprimida:', Math.round(result.length/1024) + 'KB base64');
      resolve(result);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

// Mantener compressImage para compatibilidad con otros usos
function compressImage(dataUrl, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
