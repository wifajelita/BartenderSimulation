// ========== AUDIO MANAGER (Web Audio API) ==========
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmNodes = [];
    this.muted = false;
    this.bgmOn = true;
    this.started = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1.0;
    this.sfxGain.connect(this.masterGain);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.32;
    this.bgmGain.connect(this.masterGain);
    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.05);
    }
  }

  setBgm(on) {
    this.bgmOn = on;
    if (this.bgmGain) {
      this.bgmGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.3);
    }
    if (on && this.bgmNodes.length === 0) this.startBgm();
  }

  // Soft ambient bar lounge pads + light noise (lebih jelas & nyaman)
  startBgm() {
    if (!this.ctx || this.bgmNodes.length > 0) return;
    const now = this.ctx.currentTime;

    // Soft pad chords - calm lounge progression
    const chords = [
      [130.81, 164.81, 196.00, 246.94], // Cmaj7
      [146.83, 174.61, 220.00, 261.63], // Dm7
      [164.81, 196.00, 246.94, 293.66], // Em7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 349.23], // G7
      [110.00, 130.81, 164.81, 196.00], // Am7
    ];

    chords.forEach((freqs, ci) => {
      freqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f * 0.5; // one octave lower = warmer
        g.gain.value = 0;
        osc.connect(g);
        g.connect(this.bgmGain);
        osc.start(now);

        const cycle = 10 + (ci % 3) * 2;
        const attack = now + (ci % 4) * 2.5;
        g.gain.setValueAtTime(0, attack);
        g.gain.linearRampToValueAtTime(0.07 + i * 0.012, attack + 2.5);
        g.gain.linearRampToValueAtTime(0.03, attack + cycle / 2);
        g.gain.linearRampToValueAtTime(0.065, attack + cycle);

        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.frequency.value = 0.06 + ci * 0.015;
        lfoG.gain.value = 0.022;
        lfo.connect(lfoG);
        lfoG.connect(g.gain);
        lfo.start(now);

        this.bgmNodes.push(osc, g, lfo, lfoG);
      });
    });

    // Soft filtered noise for room / bar ambience
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.25;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 500;
    const noiseG = this.ctx.createGain();
    noiseG.gain.value = 0.04;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseG);
    noiseG.connect(this.bgmGain);
    noise.start(now);
    this.bgmNodes.push(noise, noiseFilter, noiseG);

    // Soft high sparkle (like distant glass / light cymbal)
    const sparkle = this.ctx.createOscillator();
    const sparkleG = this.ctx.createGain();
    sparkle.type = 'sine';
    sparkle.frequency.value = 1200;
    sparkleG.gain.value = 0;
    sparkle.connect(sparkleG);
    sparkleG.connect(this.bgmGain);
    sparkle.start(now);
    // gentle occasional sparkle via LFO
    const sLfo = this.ctx.createOscillator();
    const sLfoG = this.ctx.createGain();
    sLfo.frequency.value = 0.15;
    sLfoG.gain.value = 0.008;
    sLfo.connect(sLfoG);
    sLfoG.connect(sparkleG.gain);
    sLfo.start(now);
    this.bgmNodes.push(sparkle, sparkleG, sLfo, sLfoG);
  }

  stopBgm() {
    this.bgmNodes.forEach(n => {
      try { n.stop?.(); } catch(e) {}
      try { n.disconnect?.(); } catch(e) {}
    });
    this.bgmNodes = [];
  }

  // SFX helpers
  playTone(freq, type, duration, vol = 0.3, detune = 0) {
    if (!this.ctx || this.muted) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
  }

  click() {
    this.playTone(800, 'sine', 0.06, 0.15);
  }

  pour() {
    // soft noise burst
    if (!this.ctx || this.muted) return;
    this.resume();
    const bufferSize = this.ctx.sampleRate * 0.35;
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  shake() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.playTone(200 + Math.random() * 150, 'triangle', 0.08, 0.2), i * 70);
    }
  }

  stir() {
    this.playTone(180, 'sine', 0.4, 0.18);
    setTimeout(() => this.playTone(220, 'sine', 0.3, 0.12), 150);
  }

  success() {
    this.playTone(523, 'sine', 0.15, 0.25);
    setTimeout(() => this.playTone(659, 'sine', 0.15, 0.25), 120);
    setTimeout(() => this.playTone(784, 'sine', 0.25, 0.3), 240);
  }

  fail() {
    this.playTone(300, 'sawtooth', 0.2, 0.2);
    setTimeout(() => this.playTone(220, 'sawtooth', 0.3, 0.18), 150);
  }

  customer() {
    this.playTone(440, 'sine', 0.1, 0.15);
    setTimeout(() => this.playTone(554, 'sine', 0.15, 0.18), 100);
  }

  dayEnd() {
    this.playTone(392, 'triangle', 0.2, 0.2);
    setTimeout(() => this.playTone(349, 'triangle', 0.2, 0.18), 200);
    setTimeout(() => this.playTone(330, 'triangle', 0.4, 0.22), 400);
  }
}


// Real BGM track (HTML5 Audio)
const bgmAudio = new Audio('bgm.mp3');
bgmAudio.loop = true;
bgmAudio.volume = 0.28; // soft, so SFX stay clearer

const audio = new AudioManager();

// ========== DATA ==========
const INGREDIENTS = [
  { id: 'rum', name: 'Rum', icon: '🍾', color: '#8B4513' },
  { id: 'vodka', name: 'Vodka', icon: '🧊', color: '#E8F4F8' },
  { id: 'whiskey', name: 'Whiskey', icon: '🥃', color: '#C4A35A' },
  { id: 'tequila', name: 'Tequila', icon: '🌵', color: '#F0E68C' },
  { id: 'gin', name: 'Gin', icon: '🌿', color: '#E0F0E8' },
  { id: 'lime', name: 'Jeruk Nipis', icon: '🍋', color: '#C5E17A' },
  { id: 'lemon', name: 'Lemon', icon: '🍋', color: '#FFE66D' },
  { id: 'mint', name: 'Mint', icon: '🌱', color: '#4CAF50' },
  { id: 'sugar', name: 'Gula', icon: '🧂', color: '#FFF8E7' },
  { id: 'soda', name: 'Soda', icon: '💧', color: '#B3E5FC' },
  { id: 'tonic', name: 'Tonic', icon: '✨', color: '#E0F7FA' },
  { id: 'cranberry', name: 'Cranberry', icon: '🍒', color: '#C62828' },
  { id: 'orange', name: 'Jeruk', icon: '🍊', color: '#FF9800' },
  { id: 'bitters', name: 'Bitters', icon: '🟤', color: '#5D4037' },
  { id: 'triplesec', name: 'Triple Sec', icon: '🧡', color: '#FFB74D' },
  { id: 'ice', name: 'Es Batu', icon: '❄️', color: '#E3F2FD' },
];

const RECIPES = [
  { id: 'mojito', name: 'Mojito', ingredients: ['rum', 'mint', 'lime', 'sugar', 'soda', 'ice'], method: 'shake', color: 'linear-gradient(180deg, #A8E6CF 0%, #56C596 100%)', garnish: '🌱', hint: 'Segar dengan mint & nipis' },
  { id: 'margarita', name: 'Margarita', ingredients: ['tequila', 'lime', 'triplesec', 'ice'], method: 'shake', color: 'linear-gradient(180deg, #C5E17A 0%, #8BC34A 100%)', garnish: '🍋', hint: 'Klasik tequila & jeruk nipis' },
  { id: 'oldfashioned', name: 'Old Fashioned', ingredients: ['whiskey', 'sugar', 'bitters', 'ice'], method: 'stir', color: 'linear-gradient(180deg, #D4A84B 0%, #8B6914 100%)', garnish: '🍊', hint: 'Whiskey klasik dengan bitters' },
  { id: 'cosmo', name: 'Cosmopolitan', ingredients: ['vodka', 'cranberry', 'lime', 'triplesec', 'ice'], method: 'shake', color: 'linear-gradient(180deg, #E57373 0%, #C62828 100%)', garnish: '🍋', hint: 'Vodka pink yang elegan' },
  { id: 'gintonic', name: 'Gin & Tonic', ingredients: ['gin', 'tonic', 'lime', 'ice'], method: 'stir', color: 'linear-gradient(180deg, #E0F7FA 0%, #80DEEA 100%)', garnish: '🍋', hint: 'Ringan dan menyegarkan' },
  { id: 'whiskeysour', name: 'Whiskey Sour', ingredients: ['whiskey', 'lemon', 'sugar', 'ice'], method: 'shake', color: 'linear-gradient(180deg, #FFE082 0%, #FFB300 100%)', garnish: '🍋', hint: 'Asam manis whiskey' },
  { id: 'screwdriver', name: 'Screwdriver', ingredients: ['vodka', 'orange', 'ice'], method: 'stir', color: 'linear-gradient(180deg, #FFB74D 0%, #F57C00 100%)', garnish: '🍊', hint: 'Vodka + jeruk sederhana' },
  { id: 'daiquiri', name: 'Daiquiri', ingredients: ['rum', 'lime', 'sugar', 'ice'], method: 'shake', color: 'linear-gradient(180deg, #FFF59D 0%, #FBC02D 100%)', garnish: '🍋', hint: 'Rum classic Cuba' },
];


const GLASS_TYPES = {
  highball: { name: 'Highball Glass', desc: 'Soft drinks, juices & cocktails with ice' },
  collins: { name: 'Collins Glass', desc: 'Long drinks & cocktails like Tom Collins' },
  rocks: { name: 'Rocks Glass', desc: 'Spirits on the rocks & short cocktails' },
  oldfashioned: { name: 'Old Fashioned Glass', desc: 'Strong drinks neat or on ice' },
  shot: { name: 'Shot Glass', desc: 'Shots & small spirits' },
  martini: { name: 'Martini Glass', desc: 'Martinis & shaken cocktails' },
  wine: { name: 'Wine Glass', desc: 'Wine & some cocktails' },
};

const CUSTOMERS = [
  { name: 'Leo', avatar: 'customers/leo.jpg', moods: ['Santai', 'Senyum', 'Tidak sabar'] },
  { name: 'Ellia', avatar: 'customers/ellia.jpg', moods: ['Senang', 'Manis', 'Lelah'] },
  { name: 'Ragnar', avatar: 'customers/ragnar.jpg', moods: ['Cool', 'Santai', 'Terburu-buru'] },
  { name: 'Chloe', avatar: 'customers/chloe.jpg', moods: ['Mysterious', 'Tenang', 'Impatient'] },
  { name: 'Vian', avatar: 'customers/vian.jpg', moods: ['Ceria', 'Excited', 'Lapar'] },
];

// ========== STATE ==========
const state = {
  money: 0,
  score: 0,
  score2: 0,
  day: 1,
  timeLeft: 60,
  patience: 100,
  currentCustomer: null,
  currentOrder: null,
  selectedIngredients: [],
  methodUsed: null,
  isPlaying: false,
  servedToday: 0,
  earnedToday: 0,
  timerInterval: null,
  patienceInterval: null,
  mode: 'solo', // 'solo' | 'versus'
  currentPlayer: 1, // 1 or 2
  selectedGlass: 'highball',
  isPaused: false,
  recipePaused: false,
};

// ========== DOM ==========
const $ = (sel) => document.querySelector(sel);
const els = {
  money: $('#money'), score: $('#score'), score2: $('#score2'), p2Stat: $('#p2Stat'),
  day: $('#day'), timer: $('#timer'),
  customerAvatar: $('#customerAvatar'), customerName: $('#customerName'),
  customerMood: $('#customerMood'), orderName: $('#orderName'), orderHint: $('#orderHint'),
  patienceBar: $('#patienceBar'), glass: $('#glass'), liquid: $('#liquid'),
  iceCubes: $('#iceCubes'), garnish: $('#garnish'), glassLabel: $('#glassLabel'),
  currentMix: $('#currentMix'), ingredientsGrid: $('#ingredientsGrid'),
  btnShake: $('#btnShake'), btnStir: $('#btnStir'), btnClear: $('#btnClear'), btnServe: $('#btnServe'),
  btnRecipes: $('#btnRecipes'), message: $('#message'),
  recipeModal: $('#recipeModal'), recipeList: $('#recipeList'), closeRecipe: $('#closeRecipe'),
  resultModal: $('#resultModal'), resultIcon: $('#resultIcon'), resultTitle: $('#resultTitle'),
  resultText: $('#resultText'), resultReward: $('#resultReward'), btnContinue: $('#btnContinue'),
  dayEndModal: $('#dayEndModal'), daySummary: $('#daySummary'), servedCount: $('#servedCount'),
  dayEarning: $('#dayEarning'), multiResult: $('#multiResult'), btnNextDay: $('#btnNextDay'),
  startModal: $('#startModal'), btnStart: $('#btnStart'),
  btnMute: $('#btnMute'), btnBgm: $('#btnBgm'), btnPause: $('#btnPause'), turnIndicator: $('#turnIndicator'),
  glassSelector: $('#glassSelector'),
};

// ========== INIT ==========
function init() {
  renderIngredients();
  renderRecipes();
  bindEvents();
}

function renderIngredients() {
  els.ingredientsGrid.innerHTML = INGREDIENTS.map(ing => `
    <button class="ingredient-btn" data-id="${ing.id}">
      <span class="icon">${ing.icon}</span>
      <span class="name">${ing.name}</span>
    </button>
  `).join('');
}

function renderRecipes() {
  els.recipeList.innerHTML = RECIPES.map(r => {
    const ingNames = r.ingredients.map((id, i) => {
      const name = INGREDIENTS.find(x => x.id === id)?.name || id;
      return `${i + 1}. ${name}`;
    }).join('<br>');
    return `<div class="recipe-card"><h3>${r.name}</h3><div class="ingredients">${ingNames}</div><div class="method">${r.method === 'shake' ? '🌪️ Kocok' : '🥄 Aduk'} · Urutan wajib berurutan!</div></div>`;
  }).join('');
}

function bindEvents() {
  els.btnStart.addEventListener('click', () => {
    audio.init();
    audio.resume();
    // Real jazz track
    bgmAudio.currentTime = 0;
    bgmAudio.volume = 0.28;
    bgmAudio.play().catch(() => {});
    audio.startBgm(); // keep soft ambient layer very quiet or skip
    startGame();
  });
  els.btnRecipes.addEventListener('click', () => {
    audio.click();
    els.recipeModal.classList.add('active');
    if (!state.isPaused) {
      state.recipePaused = true;
      pauseGame();
    }
  });
  els.closeRecipe.addEventListener('click', () => {
    els.recipeModal.classList.remove('active');
    if (state.recipePaused) {
      state.recipePaused = false;
      resumeGame();
      if (els.btnPause) { els.btnPause.textContent = '⏸️'; els.btnPause.classList.remove('off'); }
    }
  });
  els.recipeModal.addEventListener('click', e => {
    if (e.target === els.recipeModal) {
      els.recipeModal.classList.remove('active');
      if (state.recipePaused) {
        state.recipePaused = false;
        resumeGame();
        if (els.btnPause) { els.btnPause.textContent = '⏸️'; els.btnPause.classList.remove('off'); }
      }
    }
  });

  els.btnClear.addEventListener('click', () => { audio.click(); clearGlass(); });
  els.btnShake.addEventListener('click', () => doMethod('shake'));
  els.btnStir.addEventListener('click', () => doMethod('stir'));
  els.btnServe.addEventListener('click', serveDrink);
  els.btnContinue.addEventListener('click', continueAfterResult);
  els.btnNextDay.addEventListener('click', startNextDay);

  els.btnMute.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    els.btnMute.textContent = audio.muted ? '🔇' : '🔊';
    els.btnMute.classList.toggle('off', audio.muted);
    bgmAudio.muted = audio.muted;
  });
  els.btnBgm.addEventListener('click', () => {
    audio.bgmOn = !audio.bgmOn;
    if (audio.bgmOn) {
      bgmAudio.volume = 0.28;
      bgmAudio.play().catch(() => {});
      els.btnBgm.classList.remove('off');
    } else {
      bgmAudio.pause();
      els.btnBgm.classList.add('off');
    }
    audio.setBgm(false); // keep synth quiet; real track is main
  });

  
  // Glass type selector
  if (els.glassSelector) {
    els.glassSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.glass-type');
      if (!btn) return;
      const type = btn.dataset.type;
      setGlassType(type);
      audio.click();
    });
  }

  
  // Manual Pause / Resume
  if (els.btnPause) {
    els.btnPause.addEventListener('click', () => {
      if (!state.isPlaying) return;
      audio.click();
      if (state.isPaused) {
        resumeGame();
        els.btnPause.textContent = '⏸️';
        els.btnPause.classList.remove('off');
        if (audio.bgmOn && !audio.muted) bgmAudio.play().catch(() => {});
      } else {
        pauseGame();
        els.btnPause.textContent = '▶️';
        els.btnPause.classList.add('off');
        bgmAudio.pause();
      }
    });
  }

  els.ingredientsGrid.addEventListener('click', e => {
    const btn = e.target.closest('.ingredient-btn');
    if (!btn || !state.isPlaying || !state.currentOrder) return;
    addIngredient(btn.dataset.id);
  });
}

// ========== GAME FLOW ==========

function pauseGame() {
  if (state.isPaused || !state.isPlaying) return;
  state.isPaused = true;
  clearInterval(state.timerInterval);
  clearInterval(state.patienceInterval);
  setMessage('⏸️ Dijeda — lihat resep dengan tenang');
}

function resumeGame() {
  if (!state.isPaused || !state.isPlaying) return;
  state.isPaused = false;
  // restart timer
  state.timerInterval = setInterval(() => {
    if (state.isPaused) return;
    state.timeLeft--;
    els.timer.textContent = state.timeLeft;
    if (state.timeLeft <= 10) els.timer.style.color = 'var(--danger)';
    else els.timer.style.color = '';
    if (state.timeLeft <= 0) endDay();
  }, 1000);
  // restart patience if there is an active order
  if (state.currentOrder && state.patience > 0) {
    const customer = state.currentCustomer;
    const drainSpeed = 800 - Math.min(state.day * 40, 400);
    state.patienceInterval = setInterval(() => {
      if (state.isPaused) return;
      state.patience -= 1.2;
      els.patienceBar.style.width = Math.max(0, state.patience) + '%';
      if (state.patience < 40) {
        els.patienceBar.classList.add('warning');
        if (customer) els.customerMood.textContent = customer.moods[1] || 'Tidak sabar';
      }
      if (state.patience < 20) {
        els.patienceBar.classList.add('danger');
        if (customer) els.customerMood.textContent = customer.moods[2] || 'Marah';
      }
      if (state.patience <= 0) {
        clearInterval(state.patienceInterval);
        failOrder('Pelanggan pergi karena menunggu terlalu lama!');
      }
    }, drainSpeed);
  }
  setMessage('Lanjut bekerja!');
}

function startGame() {
  setGlassType(state.selectedGlass || 'highball');
  const modeInput = document.querySelector('input[name="mode"]:checked');
  state.mode = modeInput ? modeInput.value : 'solo';
  state.money = 0;
  state.score = 0;
  state.score2 = 0;
  state.day = 1;
  state.servedToday = 0;
  state.earnedToday = 0;
  state.currentPlayer = 1;

  els.p2Stat.style.display = state.mode === 'versus' ? 'block' : 'none';
  els.startModal.classList.remove('active');
  state.isPlaying = true;
  updateUI();
  startDay();
}

function startDay() {
  state.timeLeft = 50 + state.day * 10;
  state.servedToday = 0;
  state.earnedToday = 0;
  state.currentPlayer = 1;
  updateUI();
  updateTurnUI();
  setMessage(`Hari ${state.day} dimulai! ${state.mode === 'versus' ? 'Giliran Player 1' : 'Siapkan minuman terbaikmu.'}`);
  startTimer();
  spawnCustomer();
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    els.timer.textContent = state.timeLeft;
    if (state.timeLeft <= 10) els.timer.style.color = 'var(--danger)';
    else els.timer.style.color = '';
    if (state.timeLeft <= 0) endDay();
  }, 1000);
}

function endDay() {
  clearInterval(state.timerInterval);
  clearInterval(state.patienceInterval);
  state.isPlaying = false;
  state.currentOrder = null;
  audio.dayEnd();

  els.servedCount.textContent = state.servedToday;
  els.dayEarning.textContent = `$${state.earnedToday}`;
  els.daySummary.textContent = state.servedToday >= 3
    ? 'Kerja bagus! Kamu melayani banyak pelanggan hari ini.'
    : 'Coba lebih cepat besok. Latihan membuatmu lebih baik!';

  if (state.mode === 'versus') {
    els.multiResult.style.display = 'block';
    const winner = state.score === state.score2 ? 'Seri!' :
      state.score > state.score2 ? `🏆 Player 1 unggul (${state.score} vs ${state.score2})` :
      `🏆 Player 2 unggul (${state.score2} vs ${state.score})`;
    els.multiResult.innerHTML = `<strong>Hasil Versus:</strong><br>P1: ${state.score} · P2: ${state.score2}<br>${winner}`;
  } else {
    els.multiResult.style.display = 'none';
  }

  els.dayEndModal.classList.add('active');
}

function startNextDay() {
  els.dayEndModal.classList.remove('active');
  state.day++;
  state.isPlaying = true;
  updateUI();
  startDay();
}

function updateTurnUI() {
  if (state.mode === 'versus') {
    els.turnIndicator.textContent = `· P${state.currentPlayer}`;
  } else {
    els.turnIndicator.textContent = '';
  }
}

function spawnCustomer() {
  if (!state.isPlaying || state.timeLeft <= 0) return;

  clearInterval(state.patienceInterval);
  clearGlass();
  audio.customer();

  const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
  const recipe = RECIPES[Math.floor(Math.random() * Math.min(RECIPES.length, 3 + state.day))];

  state.currentCustomer = customer;
  state.currentOrder = recipe;
  state.patience = 100;
  state.methodUsed = null;
  state.selectedIngredients = [];

  els.customerAvatar.src = customer.avatar;
els.customerAvatar.alt = customer.name;
  const wrap = els.customerAvatar.parentElement;
  if (wrap) {
    wrap.classList.remove('bounce');
    void wrap.offsetWidth;
    wrap.classList.add('bounce');
  }

  els.customerName.textContent = customer.name;
  els.customerMood.textContent = customer.moods[0];
  els.orderName.textContent = recipe.name;
  els.orderHint.textContent = recipe.hint;
  els.patienceBar.style.width = '100%';
  els.patienceBar.className = 'patience-fill';

  updateTurnUI();
  setMessage(state.mode === 'versus'
    ? `Player ${state.currentPlayer}: ${customer.name} memesan ${recipe.name}`
    : `${customer.name} memesan ${recipe.name}. Ayo buat!`);

  const drainSpeed = 800 - Math.min(state.day * 40, 400);
  state.patienceInterval = setInterval(() => {
    state.patience -= 1.2;
    els.patienceBar.style.width = Math.max(0, state.patience) + '%';
    if (state.patience < 40) {
      els.patienceBar.classList.add('warning');
      els.customerMood.textContent = customer.moods[1] || 'Tidak sabar';
    }
    if (state.patience < 20) {
      els.patienceBar.classList.add('danger');
      els.customerMood.textContent = customer.moods[2] || 'Marah';
    }
    if (state.patience <= 0) {
      clearInterval(state.patienceInterval);
      failOrder('Pelanggan pergi karena menunggu terlalu lama!');
    }
  }, drainSpeed);

  updateActionButtons();
}

// ========== MIXING ==========
function addIngredient(id) {
  if (!state.currentOrder || !state.isPlaying || state.isPaused) return;
  if (state.selectedIngredients.includes(id)) return;
  if (state.selectedIngredients.length >= 8) {
    setMessage('Gelas sudah penuh!');
    return;
  }

  // Tantangan: harus sesuai URUTAN resep
  const required = state.currentOrder.ingredients;
  const nextIndex = state.selectedIngredients.length;
  const expectedId = required[nextIndex];

  // Kalau bahan yang dipilih bukan yang diharapkan di urutan ini → auto buang
  if (expectedId && id !== expectedId) {
    audio.fail();
    setMessage(`❌ Salah urutan! Seharusnya: ${ingredientName(expectedId)}. Gelas dibuang!`);
    // sedikit delay biar user sempat lihat
    state.selectedIngredients.push(id);
    updateMixDisplay();
    updateGlassVisual();
    setTimeout(() => {
      clearGlass();
      setMessage(`Coba lagi — ikut urutan resep ya! (lihat Buku Resep)`);
    }, 650);
    return;
  }

  // Kalau sudah lebih dari jumlah resep (extra bahan) juga gagal
  if (nextIndex >= required.length) {
    audio.fail();
    setMessage('❌ Kelebihan bahan! Gelas dibuang!');
    state.selectedIngredients.push(id);
    updateMixDisplay();
    updateGlassVisual();
    setTimeout(() => {
      clearGlass();
      setMessage('Ikuti jumlah & urutan bahan di resep.');
    }, 650);
    return;
  }

  state.selectedIngredients.push(id);
  audio.pour();
  updateMixDisplay();
  updateGlassVisual();
  updateActionButtons();

  const btn = document.querySelector(`[data-id="${id}"]`);
  if (btn) {
    btn.classList.add('selected');
    setTimeout(() => btn.classList.remove('selected'), 300);
  }

  // Feedback positif kecil
  if (state.selectedIngredients.length === required.length) {
    setMessage('✨ Bahan lengkap! Sekarang Kocok atau Aduk sesuai resep.');
  }
}

function ingredientName(id) {
  const ing = INGREDIENTS.find(i => i.id === id);
  return ing ? ing.name : id;
}

function updateMixDisplay() {
  if (state.selectedIngredients.length === 0) {
    els.currentMix.innerHTML = '<span class="mix-empty">Belum ada bahan</span>';
    return;
  }
  els.currentMix.innerHTML = state.selectedIngredients.map(id => {
    const ing = INGREDIENTS.find(i => i.id === id);
    return `<span class="mix-tag">${ing.icon} ${ing.name}</span>`;
  }).join('');
}


function setGlassType(type) {
  if (!GLASS_TYPES[type]) return;
  state.selectedGlass = type;
  // update buttons
  document.querySelectorAll('.glass-type').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  // update glass class
  const g = els.glass;
  g.className = 'glass glass-' + type;
  // keep shake/stir if needed later
  updateGlassLabel();
  updateGlassVisual();
}

function updateGlassLabel() {
  const info = GLASS_TYPES[state.selectedGlass] || { name: 'Gelas' };
  const count = state.selectedIngredients.length;
  els.glassLabel.textContent = count === 0
    ? `${info.name} · kosong`
    : `${info.name} · ${count} bahan`;
}

function updateGlassVisual() {
  const count = state.selectedIngredients.length;
  const height = Math.min(count * 14, 85);
  els.liquid.style.height = height + '%';

  if (count > 0 && state.currentOrder) {
    els.liquid.style.background = state.currentOrder.color;
  } else if (count === 0) {
    els.liquid.style.height = '0%';
  }

  if (state.selectedIngredients.includes('ice')) {
    els.iceCubes.innerHTML = '<span></span><span></span><span></span>';
    els.iceCubes.classList.add('show');
  } else {
    els.iceCubes.classList.remove('show');
  }

  updateGlassLabel();
}

function doMethod(method) {
  if (state.selectedIngredients.length === 0) return;
  state.methodUsed = method;
  els.glass.classList.remove('shake', 'stir');
  void els.glass.offsetWidth;
  els.glass.classList.add(method === 'shake' ? 'shake' : 'stir');

  if (method === 'shake') audio.shake();
  else audio.stir();

  setMessage(method === 'shake' ? '🌪️ Mengocok minuman...' : '🥄 Mengaduk minuman...');
  updateActionButtons();

  if (state.currentOrder && state.methodUsed === state.currentOrder.method) {
    els.garnish.textContent = state.currentOrder.garnish;
    els.garnish.classList.add('show');
  }
}

function clearGlass() {
  state.selectedIngredients = [];
  state.methodUsed = null;
  updateMixDisplay();
  els.liquid.style.height = '0%';
  els.iceCubes.classList.remove('show');
  els.garnish.classList.remove('show');
  els.glassLabel.textContent = 'Gelas kosong';
  els.glass.classList.remove('shake', 'stir');
  updateActionButtons();
}

function updateActionButtons() {
  const has = state.selectedIngredients.length > 0;
  els.btnShake.disabled = !has || !!state.methodUsed;
  els.btnStir.disabled = !has || !!state.methodUsed;
  els.btnServe.disabled = !has || !state.methodUsed;
}

// ========== SERVE ==========
function serveDrink() {
  if (!state.currentOrder || !state.methodUsed) return;
  clearInterval(state.patienceInterval);

  const order = state.currentOrder;
  const selected = [...state.selectedIngredients].sort();
  const required = [...order.ingredients].sort();

  const ingredientsMatch = selected.length === required.length && selected.every((id, i) => id === required[i]);
  const methodMatch = state.methodUsed === order.method;
  const overlap = selected.filter(x => required.includes(x)).length;

  let result;
  if (ingredientsMatch && methodMatch) {
    const tip = Math.round(15 + state.patience * 0.25 + state.day * 3);
    result = { type: 'perfect', icon: '🌟', title: 'Sempurna!', text: `${state.currentCustomer.name} sangat puas dengan ${order.name}-mu!`, reward: tip, score: 100 + Math.round(state.patience) };
    audio.success();
  } else if (ingredientsMatch || (methodMatch && overlap >= required.length - 1)) {
    const tip = Math.round(8 + state.patience * 0.1);
    result = { type: 'good', icon: '👍', title: 'Bagus!', text: 'Hampir sempurna. Pelanggan masih senang.', reward: tip, score: 50 + Math.round(state.patience * 0.5) };
    audio.success();
  } else {
    result = { type: 'fail', icon: '😣', title: 'Salah Resep...', text: `Ini bukan ${order.name}. Pelanggan kecewa.`, reward: 0, score: 0 };
    audio.fail();
  }

  showResult(result);
}

function failOrder(msg) {
  audio.fail();
  showResult({ type: 'fail', icon: '😤', title: 'Pelanggan Pergi!', text: msg, reward: 0, score: 0 });
}

function showResult(result) {
  state.money += result.reward;
  if (state.mode === 'versus') {
    if (state.currentPlayer === 1) state.score += result.score;
    else state.score2 += result.score;
  } else {
    state.score += result.score;
  }
  state.earnedToday += result.reward;
  if (result.type !== 'fail') state.servedToday++;

  els.resultIcon.textContent = result.icon;
  els.resultTitle.textContent = result.title;
  els.resultText.textContent = result.text + (state.mode === 'versus' ? ` (Player ${state.currentPlayer})` : '');
  els.resultReward.textContent = result.reward > 0 ? `+$${result.reward}` : 'Tidak ada tip';
  els.resultReward.style.color = result.reward > 0 ? 'var(--success)' : 'var(--danger)';

  els.resultModal.classList.add('active');
  updateUI();
  clearGlass();
  state.currentOrder = null;
}

function continueAfterResult() {
  els.resultModal.classList.remove('active');

  // Switch player in versus mode
  if (state.mode === 'versus') {
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }

  if (state.timeLeft > 5 && state.isPlaying) {
    setTimeout(spawnCustomer, 600);
  } else if (state.timeLeft <= 0) {
    endDay();
  } else {
    setMessage('Waktu hampir habis...');
    setTimeout(spawnCustomer, 800);
  }
}

function updateUI() {
  els.money.textContent = `$${state.money}`;
  els.score.textContent = state.score;
  els.score2.textContent = state.score2;
  els.day.textContent = state.day;
  els.timer.textContent = state.timeLeft;
}

function setMessage(text) {
  els.message.textContent = text;
}

init();
