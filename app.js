// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bxcqjjzxwkqytcmpyfuj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3Fqanp4d2txeXRjbXB5ZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDQ3MjQsImV4cCI6MjA5Mjg4MDcyNH0.edQEf7WwkXQlLClOSBf8pze4rA2kywU9b_v-IVy3oUA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

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
};

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
})();

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

function showAuthError(msg, ok = false) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.color = ok ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
}
function hideAuthError() { document.getElementById('authError').classList.add('hidden'); }
function setAuthLoading(id, text) { document.getElementById(id).textContent = text; }

async function loadUserData() {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = profile;
  const { data: children } = await sb.from('children').select('*').eq('user_id', state.user.id).order('created_at');
  state.children = children || [];
  if (state.children.length > 0 && !state.activeChild) state.activeChild = state.children[0];
  renderHome(); renderProfileScreen();
}

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

  const left = Math.max(0, 5 - (state.profile?.scans_this_month || 0));
  document.getElementById('scansText').textContent = `${left} escaneos disponibles este mes`;
  document.getElementById('planBadge').textContent = state.profile?.plan === 'premium' ? 'PREMIUM ⭐' : 'GRATIS';
}

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
    const allergens = (child.allergens || []).map(a => a.label).join(', ');
    const card = document.createElement('div');
    card.className = 'child-profile-card';
    card.innerHTML = `
      <span class="child-profile-emoji">${child.emoji}</span>
      <div style="flex:1">
        <p class="child-profile-name">${child.name}</p>
        <p class="child-profile-allergens">${allergens || 'Sin alérgenos'}</p>
      </div>
      <button class="edit-child-btn" onclick="openEditChild('${child.id}')">✏️ Editar</button>`;
    list.appendChild(card);
  });
}

function openAddChild() {
  state.editingChildId = null; state.selectedEmoji = '👦'; state.selectedAllergens = [];
  document.getElementById('childName').value = '';
  document.getElementById('addChildTitle').textContent = 'Añadir hijo';
  document.getElementById('saveChildBtnText').textContent = 'Guardar perfil';
  document.getElementById('childError').classList.add('hidden');
  renderEmojiPicker(); renderAllergenGrid(); showScreen('screenAddChild');
}

function openEditChild(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;
  state.editingChildId = childId;
  state.selectedEmoji = child.emoji;
  state.selectedAllergens = [...(child.allergens || [])];
  document.getElementById('childName').value = child.name;
  document.getElementById('addChildTitle').textContent = 'Editar perfil';
  document.getElementById('saveChildBtnText').textContent = 'Guardar cambios';
  document.getElementById('childError').classList.add('hidden');
  renderEmojiPicker(); renderAllergenGrid(); showScreen('screenAddChild');
}

function renderEmojiPicker() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  CHILD_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-option' + (emoji === state.selectedEmoji ? ' selected' : '');
    btn.textContent = emoji;
    btn.onclick = () => {
      state.selectedEmoji = emoji;
      document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    grid.appendChild(btn);
  });
}

function renderAllergenGrid() {
  const grid = document.getElementById('allergenGrid');
  grid.innerHTML = '';
  ALLERGENS.forEach(a => {
    const selected = state.selectedAllergens.find(x => x.id === a.id);
    const chip = document.createElement('button');
    chip.className = 'allergen-chip' + (selected ? ' selected' : '');
    const sEmoji = selected?.severity === 'leve' ? '🟡' : selected?.severity === 'moderada' ? '🟠' : selected?.severity === 'grave' ? '🔴' : '';
    chip.innerHTML = `<span class="allergen-chip-name">${a.emoji} ${a.label}</span>${selected ? `<span class="allergen-chip-severity">${sEmoji} ${selected.severity}</span>` : ''}`;
    chip.onclick = () => {
      if (selected) { state.selectedAllergens = state.selectedAllergens.filter(x => x.id !== a.id); renderAllergenGrid(); }
      else { state.pendingAllergenId = a.id; openSeverityModal(a.label); }
    };
    grid.appendChild(chip);
  });
}

function openSeverityModal(name) {
  document.getElementById('modalAllergenName').textContent = name;
  document.getElementById('severityModal').classList.remove('hidden');
}
function closeSeverityModal() {
  document.getElementById('severityModal').classList.add('hidden');
  state.pendingAllergenId = null;
}
function selectSeverity(severity) {
  const a = ALLERGENS.find(x => x.id === state.pendingAllergenId);
  if (a) state.selectedAllergens.push({ ...a, severity });
  closeSeverityModal(); renderAllergenGrid();
}

async function saveChild() {
  const name = document.getElementById('childName').value.trim();
  if (!name) {
    document.getElementById('childError').textContent = 'El nombre es obligatorio';
    document.getElementById('childError').classList.remove('hidden');
    return;
  }
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

  state.selectedAllergens = []; state.selectedEmoji = '👦'; state.editingChildId = null;
  document.getElementById('childName').value = '';
  document.getElementById('childError').classList.add('hidden');
  renderHome(); renderProfileScreen(); showScreen('screenHome');
}

function triggerCamera(mode) {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  state.scanMode = mode;
  document.getElementById('fileInput').click();
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
  const dataUrl = await toDataUrl(file);
  await analyze(dataUrl, state.scanMode);
  e.target.value = '';
}

async function analyzeText() {
  const text = document.getElementById('manualText').value.trim();
  if (!text) return;
  await analyze(text, 'text');
}

async function analyze(data, mode) {
  if (!checkScanLimit()) return;
  const msgs = { label: 'Analizando etiqueta...', menu: 'Analizando menú...', text: 'Analizando ingredientes...' };
  showLoading(msgs[mode] || 'Analizando...', 'IA con protocolos Laztan');
  try {
    const res = await fetch('/.netlify/functions/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: data, allergens: state.activeChild?.allergens || [], childName: state.activeChild?.name || 'tu hijo', mode }),
    });
    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Error en el análisis');
    await saveScan(result); await incrementScans(); hideLoading(); showResult(result);
  } catch (err) {
    hideLoading(); document.getElementById('scanStatus').textContent = '⚠️ ' + err.message;
  }
}

function checkScanLimit() {
  if (state.profile?.plan === 'premium') return true;
  if ((state.profile?.scans_this_month || 0) >= 5) {
    alert('Límite de 5 escaneos gratuitos alcanzado. Actualiza a Premium para ilimitados.'); return false;
  }
  return true;
}

async function incrementScans() {
  const n = (state.profile?.scans_this_month || 0) + 1;
  await sb.from('profiles').update({ scans_this_month: n }).eq('id', state.user.id);
  if (state.profile) state.profile.scans_this_month = n;
  renderHome();
}

async function saveScan(result) {
  await sb.from('scans').insert({
    user_id: state.user.id, child_id: state.activeChild?.id,
    result: result.explanation, status: result.status,
    ingredients: result.ingredients_found || '', risks: result.risks || [],
  });
}

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

  const risksList = document.getElementById('risksList');
  risksList.innerHTML = '';
  if (result.risks?.length) {
    result.risks.forEach(r => { const c = document.createElement('span'); c.className = 'risk-chip'; c.textContent = r; risksList.appendChild(c); });
    document.getElementById('risksBlock').style.display = 'block';
  } else document.getElementById('risksBlock').style.display = 'none';

  const hiddenList = document.getElementById('hiddenList');
  hiddenList.innerHTML = '';
  if (result.hidden_allergens?.length) {
    result.hidden_allergens.forEach(h => { const c = document.createElement('span'); c.className = 'hidden-chip'; c.textContent = h; hiddenList.appendChild(c); });
    document.getElementById('hiddenBlock').style.display = 'block';
  } else document.getElementById('hiddenBlock').style.display = 'none';

  if (result.ingredients_found) {
    document.getElementById('ingredientsFound').textContent = result.ingredients_found;
    document.getElementById('ingredientsBlock').style.display = 'block';
  } else document.getElementById('ingredientsBlock').style.display = 'none';

  showScreen('screenResult');
}

function resetScan() {
  document.getElementById('manualText').value = '';
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('scanStatus').textContent = '';
  showScreen('screenHome');
}

function startVoice() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome.'); return; }
  state.recognition = new SR();
  state.recognition.lang = 'es-ES'; state.recognition.continuous = false; state.recognition.interimResults = true;
  document.getElementById('voiceUI').classList.remove('hidden');
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('voiceTranscript').textContent = '';
  state.recognition.onresult = (e) => {
    document.getElementById('voiceTranscript').textContent = Array.from(e.results).map(r => r[0].transcript).join('');
  };
  state.recognition.onend = async () => {
    const t = document.getElementById('voiceTranscript').textContent;
    document.getElementById('voiceUI').classList.add('hidden');
    if (t.trim()) await analyze(t, 'text');
  };
  state.recognition.onerror = () => document.getElementById('voiceUI').classList.add('hidden');
  state.recognition.start();
  document.getElementById('voiceStatus').textContent = 'Escuchando... habla ahora';
}

function stopVoice() {
  if (state.recognition) state.recognition.stop();
  document.getElementById('voiceUI').classList.add('hidden');
}

function contactExpert() {
  const child = state.activeChild;
  const allergens = child?.allergens?.map(a => `${a.label} (${a.severity})`).join(', ') || 'no especificados';
  const msg = encodeURIComponent(`Hola, soy usuario de SafeBite.\n\nPerfil: ${child?.name || 'mi hijo'}\nAlergias: ${allergens}\n\nTengo una consulta sobre seguridad alimentaria.`);
  window.open(`https://wa.me/34946489032?text=${msg}`, '_blank');
}

async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="empty-state">Cargando...</p>';
  const { data: scans } = await sb.from('scans').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(20);
  if (!scans || !scans.length) { list.innerHTML = '<p class="empty-state">No hay escaneos todavía.<br/>¡Escanea tu primer producto!</p>'; return; }
  list.innerHTML = '';
  scans.forEach(scan => {
    const icon = scan.status === 'APTO' ? '🟢' : scan.status === 'PRECAUCION' ? '🟡' : '🔴';
    const cls  = scan.status === 'APTO' ? 'apto' : scan.status === 'PRECAUCION' ? 'precaucion' : 'no-apto';
    const date = new Date(scan.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<span class="history-icon">${icon}</span><div style="flex:1;min-width:0"><p class="history-status ${cls}">${scan.status}</p><p class="history-explanation">${scan.result || '—'}</p></div><span class="history-date">${date}</span>`;
    list.appendChild(item);
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
  const t = document.getElementById(id);
  if (t) { t.classList.remove('hidden'); t.classList.add('active'); }
  if (id === 'screenHistory') loadHistory();
  if (id === 'screenAddChild') { renderEmojiPicker(); renderAllergenGrid(); }
}

function showLoading(text = 'Analizando...', sub = '') {
  let o = document.getElementById('loadingOverlay');
  if (!o) { o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay'; document.body.appendChild(o); }
  o.innerHTML = `<div class="loading-spinner"></div><p class="loading-text">${text}</p>${sub ? `<p class="loading-sub">${sub}</p>` : ''}`;
  o.classList.remove('hidden');
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if (o) o.classList.add('hidden'); }

function toDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer'));
    r.readAsDataURL(file);
  });
}
