// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bxcqjjzxwkqytcmpyfuj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3Fqanp4d2txeXRjbXB5ZnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDQ3MjQsImV4cCI6MjA5Mjg4MDcyNH0.edQEf7WwkXQlLClOSBf8pze4rA2kywU9b_v-IVy3oUA';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Allergens DB ───────────────────────────────────────────────────────────
const ALLERGENS = [
  { id: 'gluten',      label: 'Gluten',       emoji: '🌾' },
  { id: 'leche',       label: 'Leche',        emoji: '🥛' },
  { id: 'huevo',       label: 'Huevo',        emoji: '🥚' },
  { id: 'frutos',      label: 'Frutos secos', emoji: '🥜' },
  { id: 'cacahuete',   label: 'Cacahuete',    emoji: '🫘' },
  { id: 'soja',        label: 'Soja',         emoji: '🫱' },
  { id: 'pescado',     label: 'Pescado',      emoji: '🐟' },
  { id: 'crustaceos',  label: 'Crustáceos',   emoji: '🦐' },
  { id: 'moluscos',    label: 'Moluscos',     emoji: '🦪' },
  { id: 'sesamo',      label: 'Sésamo',       emoji: '🌿' },
  { id: 'mostaza',     label: 'Mostaza',      emoji: '🌭' },
  { id: 'apio',        label: 'Apio',         emoji: '🥬' },
  { id: 'sulfitos',    label: 'Sulfitos',     emoji: '🍷' },
  { id: 'altramuz',    label: 'Altramuz',     emoji: '🌸' },
];

const CHILD_EMOJIS = ['👦','👧','🧒','👶','🦁','🐯','🐻','🦊','🐼','🐨','🦄','⭐'];

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  user:           null,
  profile:        null,
  children:       [],
  activeChild:    null,
  scanMode:       'label', // label | menu | text
  selectedEmoji:  '👦',
  selectedAllergens: [], // [{id, label, emoji, severity}]
  pendingAllergenId: null,
  recognition:    null,
};

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    await loadUserData();
    showScreen('screenHome');
  } else {
    showScreen('screenAuth');
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user;
      await loadUserData();
      showScreen('screenHome');
    } else if (event === 'SIGNED_OUT') {
      state = { ...state, user: null, profile: null, children: [], activeChild: null };
      showScreen('screenAuth');
    }
  });

  renderEmojiPicker();
  renderAllergenGrid();

  document.getElementById('fileInput').addEventListener('change', handleFileInput);
})();

// ── Auth ───────────────────────────────────────────────────────────────────
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
  if (error) showAuthError(error.message === 'Invalid login credentials'
    ? 'Email o contraseña incorrectos' : error.message);
}

async function register() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) return showAuthError('Completa todos los campos');
  if (pass.length < 6) return showAuthError('La contraseña debe tener al menos 6 caracteres');

  setAuthLoading('regBtnText', 'Creando cuenta...');
  const { error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name } }
  });
  setAuthLoading('regBtnText', 'Crear cuenta gratis');
  if (error) showAuthError(error.message);
  else showAuthError('✅ Cuenta creada. Puedes entrar ahora.', true);
}

async function logout() {
  await sb.auth.signOut();
}

function showAuthError(msg, ok = false) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
}
function hideAuthError() { document.getElementById('authError').classList.add('hidden'); }
function setAuthLoading(id, text) { document.getElementById(id).textContent = text; }

// ── Load user data ─────────────────────────────────────────────────────────
async function loadUserData() {
  // Load profile
  const { data: profile } = await sb
    .from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = profile;

  // Load children
  const { data: children } = await sb
    .from('children').select('*').eq('user_id', state.user.id).order('created_at');
  state.children = children || [];

  if (state.children.length > 0 && !state.activeChild) {
    state.activeChild = state.children[0];
  }

  renderHome();
  renderProfileScreen();
}

// ── Render home ────────────────────────────────────────────────────────────
function renderHome() {
  // Child bar
  const inner = document.getElementById('childBarInner');
  inner.innerHTML = '';
  state.children.forEach(child => {
    const chip = document.createElement('button');
    chip.className = 'child-chip' + (state.activeChild?.id === child.id ? ' active' : '');
    chip.innerHTML = `<span class="child-chip-emoji">${child.emoji}</span>${child.name}`;
    chip.onclick = () => { state.activeChild = child; renderHome(); };
    inner.appendChild(chip);
  });

  // Hero
  if (state.activeChild) {
    const allergens = state.activeChild.allergens || [];
    document.getElementById('heroChildName').textContent = state.activeChild.name;
    document.getElementById('heroBadgeEmoji').textContent = state.activeChild.emoji;
    document.getElementById('heroAllergens').textContent = allergens.length
      ? allergens.map(a => a.label).join(' · ')
      : 'Sin alérgenos configurados';
  } else {
    document.getElementById('heroChildName').textContent = 'Añade un hijo';
    document.getElementById('heroBadgeEmoji').textContent = '👶';
    document.getElementById('heroAllergens').textContent = 'Toca + para crear un perfil';
  }

  // Scans bar
  const scansLeft = 5 - (state.profile?.scans_this_month || 0);
  document.getElementById('scansText').textContent =
    `${Math.max(0, scansLeft)} escaneos disponibles este mes`;
  document.getElementById('planBadge').textContent =
    state.profile?.plan === 'premium' ? 'PREMIUM' : 'GRATIS';
}

// ── Render profile screen ──────────────────────────────────────────────────
function renderProfileScreen() {
  if (!state.user) return;
  const name = state.profile?.name || state.user.email.split('@')[0];
  document.getElementById('profileAvatar').textContent = name[0].toUpperCase();
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileEmail').textContent = state.user.email;
  document.getElementById('planLabel').textContent =
    `Plan ${state.profile?.plan === 'premium' ? 'PREMIUM' : 'GRATUITO'}`;

  const list = document.getElementById('profileChildrenList');
  list.innerHTML = '';
  state.children.forEach(child => {
    const allergens = (child.allergens || []).map(a => a.label).join(', ');
    const card = document.createElement('div');
    card.className = 'child-profile-card';
    card.innerHTML = `
      <span class="child-profile-emoji">${child.emoji}</span>
      <div>
        <p class="child-profile-name">${child.name}</p>
        <p class="child-profile-allergens">${allergens || 'Sin alérgenos'}</p>
      </div>`;
    list.appendChild(card);
  });
}

// ── Add child ──────────────────────────────────────────────────────────────
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
    const severity = selected?.severity || '';
    const severityEmoji = severity === 'leve' ? '🟡' : severity === 'moderada' ? '🟠' : severity === 'grave' ? '🔴' : '';
    chip.innerHTML = `
      <span class="allergen-chip-name">${a.emoji} ${a.label}</span>
      ${selected ? `<span class="allergen-chip-severity">${severityEmoji} ${severity}</span>` : ''}`;
    chip.onclick = () => {
      if (selected) {
        state.selectedAllergens = state.selectedAllergens.filter(x => x.id !== a.id);
        renderAllergenGrid();
      } else {
        state.pendingAllergenId = a.id;
        openSeverityModal(a.label);
      }
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
  const allergen = ALLERGENS.find(a => a.id === state.pendingAllergenId);
  if (allergen) {
    state.selectedAllergens.push({ ...allergen, severity });
  }
  closeSeverityModal();
  renderAllergenGrid();
}

async function saveChild() {
  const name = document.getElementById('childName').value.trim();
  if (!name) {
    document.getElementById('childError').textContent = 'El nombre es obligatorio';
    document.getElementById('childError').classList.remove('hidden');
    return;
  }

  const { data, error } = await sb.from('children').insert({
    user_id: state.user.id,
    name,
    emoji: state.selectedEmoji,
    allergens: state.selectedAllergens,
  }).select().single();

  if (error) {
    document.getElementById('childError').textContent = 'Error al guardar: ' + error.message;
    document.getElementById('childError').classList.remove('hidden');
    return;
  }

  state.children.push(data);
  state.activeChild = data;

  // Reset form
  state.selectedAllergens = [];
  state.selectedEmoji = '👦';
  document.getElementById('childName').value = '';
  document.getElementById('childError').classList.add('hidden');
  renderEmojiPicker();
  renderAllergenGrid();

  renderHome();
  showScreen('screenHome');
}

// ── Scan ───────────────────────────────────────────────────────────────────
function triggerCamera(mode) {
  if (!state.activeChild) {
    alert('Primero añade el perfil de un hijo');
    return;
  }
  state.scanMode = mode;
  document.getElementById('fileInput').click();
}

function showTextInput() {
  if (!state.activeChild) {
    alert('Primero añade el perfil de un hijo');
    return;
  }
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

  showLoading(mode === 'menu' ? 'Analizando el menú...' : 'Analizando ingredientes...',
    'IA con protocolos Laztan');

  try {
    const allergens = state.activeChild?.allergens || [];
    const childName = state.activeChild?.name || 'tu hijo';

    const res = await fetch('/.netlify/functions/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: data, allergens, childName, mode }),
    });

    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'Error en el análisis');

    await saveScan(result, mode);
    await incrementScans();
    hideLoading();
    showResult(result);

  } catch (err) {
    hideLoading();
    document.getElementById('scanStatus').textContent = 'Error: ' + err.message;
  }
}

function checkScanLimit() {
  if (state.profile?.plan === 'premium') return true;
  const used = state.profile?.scans_this_month || 0;
  if (used >= 5) {
    alert('Has alcanzado el límite de 5 escaneos gratuitos este mes. Actualiza a Premium para escaneos ilimitados.');
    return false;
  }
  return true;
}

async function incrementScans() {
  const newCount = (state.profile?.scans_this_month || 0) + 1;
  await sb.from('profiles')
    .update({ scans_this_month: newCount })
    .eq('id', state.user.id);
  if (state.profile) state.profile.scans_this_month = newCount;
  renderHome();
}

async function saveScan(result, mode) {
  await sb.from('scans').insert({
    user_id: state.user.id,
    child_id: state.activeChild?.id,
    result: result.explanation,
    status: result.status,
    ingredients: result.ingredients_found || '',
    risks: result.risks || [],
  });
}

// ── Show result ────────────────────────────────────────────────────────────
function showResult(result) {
  const card = document.getElementById('resultCard');
  card.className = 'result-status-card';

  let icon, color, cssClass;
  if (result.status === 'APTO') {
    icon = '🟢'; color = 'var(--green)'; cssClass = 'apto';
  } else if (result.status === 'PRECAUCION') {
    icon = '🟡'; color = 'var(--amber)'; cssClass = 'precaucion';
  } else {
    icon = '🔴'; color = 'var(--red)'; cssClass = 'no-apto';
  }

  card.classList.add(cssClass);
  document.getElementById('resultIcon').textContent = icon;
  document.getElementById('resultTitle').textContent = result.status;
  document.getElementById('resultTitle').style.color = color;
  document.getElementById('resultChild').textContent =
    state.activeChild ? `Perfil: ${state.activeChild.emoji} ${state.activeChild.name}` : '';
  document.getElementById('resultExplanation').textContent = result.explanation || '';

  // Risks
  const risksList = document.getElementById('risksList');
  risksList.innerHTML = '';
  if (result.risks?.length) {
    result.risks.forEach(r => {
      const chip = document.createElement('span');
      chip.className = 'risk-chip';
      chip.textContent = r;
      risksList.appendChild(chip);
    });
    document.getElementById('risksBlock').style.display = 'block';
  } else {
    document.getElementById('risksBlock').style.display = 'none';
  }

  // Hidden allergens
  const hiddenList = document.getElementById('hiddenList');
  hiddenList.innerHTML = '';
  if (result.hidden_allergens?.length) {
    result.hidden_allergens.forEach(h => {
      const chip = document.createElement('span');
      chip.className = 'hidden-chip';
      chip.textContent = h;
      hiddenList.appendChild(chip);
    });
    document.getElementById('hiddenBlock').style.display = 'block';
  } else {
    document.getElementById('hiddenBlock').style.display = 'none';
  }

  // Ingredients
  if (result.ingredients_found) {
    document.getElementById('ingredientsFound').textContent = result.ingredients_found;
    document.getElementById('ingredientsBlock').style.display = 'block';
  } else {
    document.getElementById('ingredientsBlock').style.display = 'none';
  }

  showScreen('screenResult');
}

function resetScan() {
  document.getElementById('manualText').value = '';
  document.getElementById('textInputArea').classList.add('hidden');
  document.getElementById('scanStatus').textContent = '';
  showScreen('screenHome');
}

// ── Voice ──────────────────────────────────────────────────────────────────
function startVoice() {
  if (!state.activeChild) { alert('Primero añade el perfil de un hijo'); return; }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome.');
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = 'es-ES';
  state.recognition.continuous = false;
  state.recognition.interimResults = true;

  document.getElementById('voiceUI').classList.remove('hidden');
  document.getElementById('textInputArea').classList.add('hidden');

  state.recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('voiceTranscript').textContent = transcript;
  };

  state.recognition.onend = async () => {
    const transcript = document.getElementById('voiceTranscript').textContent;
    document.getElementById('voiceUI').classList.add('hidden');
    if (transcript.trim()) {
      await analyze(transcript, 'text');
    }
  };

  state.recognition.start();
  document.getElementById('voiceStatus').textContent = 'Escuchando...';
}

function stopVoice() {
  if (state.recognition) state.recognition.stop();
  document.getElementById('voiceUI').classList.add('hidden');
}

// ── WhatsApp expert ────────────────────────────────────────────────────────
function contactExpert() {
  const child = state.activeChild;
  const allergens = child?.allergens?.map(a => `${a.label} (${a.severity})`).join(', ') || 'no especificados';
  const msg = encodeURIComponent(
    `Hola, soy usuario de SafeBite.\n\nPerfil: ${child?.name || 'mi hijo'}\nAlergias: ${allergens}\n\nTengo una consulta sobre un análisis de producto. ¿Podéis ayudarme?`
  );
  window.open(`https://wa.me/34946489032?text=${msg}`, '_blank');
}

// ── History ────────────────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="empty-state">Cargando...</p>';

  const { data: scans } = await sb
    .from('scans')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!scans || scans.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay escaneos todavía.<br/>¡Escanea tu primer producto!</p>';
    return;
  }

  list.innerHTML = '';
  scans.forEach(scan => {
    const icon = scan.status === 'APTO' ? '🟢' : scan.status === 'PRECAUCION' ? '🟡' : '🔴';
    const statusClass = scan.status === 'APTO' ? 'apto' : scan.status === 'PRECAUCION' ? 'precaucion' : 'no-apto';
    const date = new Date(scan.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-icon">${icon}</span>
      <div style="flex:1;min-width:0">
        <p class="history-status ${statusClass}">${scan.status}</p>
        <p class="history-explanation">${scan.result || '—'}</p>
      </div>
      <span class="history-date">${date}</span>`;
    list.appendChild(item);
  });
}

// ── Screen routing ─────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
  if (id === 'screenHistory') loadHistory();
  if (id === 'screenAddChild') { renderEmojiPicker(); renderAllergenGrid(); }
}

// ── Loading ────────────────────────────────────────────────────────────────
function showLoading(text = 'Analizando...', sub = '') {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <p class="loading-text">${text}</p>
    ${sub ? `<p class="loading-sub">${sub}</p>` : ''}`;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── Utils ──────────────────────────────────────────────────────────────────
function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
