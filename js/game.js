// ==========================================
// IMPORTACIONES CDN NATIVAS DE FIREBASE v10
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBA3an5J2xFkWZ5EzSui8SLtV5ee3VirRA",
  authDomain: "notaventuras-game.firebaseapp.com",
  projectId: "notaventuras-game",
  storageBucket: "notaventuras-game.firebasestorage.app",
  messagingSenderId: "80907541242",
  appId: "1:80907541242:web:3d25c8325bece1a9a44743"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// MAPA DIATÓNICO PEDAGÓGICO
const NOTE_MAP = {
    'C4': { offset: -6, name: 'DO', group: 1, ledger: true },
    'D4': { offset: -5, name: 'RE', group: 1, ledger: false },
    'E4': { offset: -4, name: 'MI', group: 1, ledger: false },
    'F4': { offset: -3, name: 'FA', group: 1, ledger: false },
    'G4': { offset: -2, name: 'SOL', group: 1, ledger: false },
    'A4': { offset: -1, name: 'LA', group: 1, ledger: false },
    'B4': { offset:  0, name: 'SI', group: 1, ledger: false },
    'C5': { offset:  1, name: 'DO', group: 2, ledger: false },
    'D5': { offset:  2, name: 'RE', group: 2, ledger: false },
    'E5': { offset:  3, name: 'MI', group: 2, ledger: false },
    'F5': { offset:  4, name: 'FA', group: 2, ledger: false },
    'G5': { offset:  5, name: 'SOL', group: 2, ledger: false },
    'A5': { offset:  6, name: 'LA', group: 2, ledger: true },
    'B5': { offset:  7, name: 'SI', group: 2, ledger: true }
};

// SYNTH WEBAUDIO API
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.pitches = {
            'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,
            'A4':440.00,'B4':493.88,'C5':523.25,'D5':587.33,'E5':659.25,
            'F5':698.46,'G5':783.99,'A5':880.00,'B5':987.77
        };
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Reanudar contexto si fue suspendido por el navegador
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    play(k) {
        this.init();
        const f = this.pitches[k];
        if (!f) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.3, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
    }

    feedback(hit) {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.connect(g);
        g.connect(this.ctx.destination);
        if (hit) {
            osc.frequency.setValueAtTime(523.25, now);
            g.gain.setValueAtTime(0.1, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else {
            osc.frequency.setValueAtTime(140, now);
            g.gain.setValueAtTime(0.2, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    }
}

// ==========================================
// MOTOR PRINCIPAL DEL JUEGO
// ==========================================
class GameApp {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioEngine();

        this.user = null;
        this.isGuest = false;
        this.gameActive = false;     // FIX: controla si hay juego en curso
        this.isProcessing = false;   // FIX: evita doble-click / race conditions

        // Estado de retroalimentación visual (para móvil: mostrar resultado antes de avanzar)
        this.feedbackState = null;   // { result: 'hit'|'miss', timer: N }
        this.FEEDBACK_FRAMES = 40;   // ~0.67s a 60fps

        this.state = {
            score: 0,
            combo: 0,
            level: 1,
            accuracy: 100,
            selectedHead: 'nota',
            subMode: 'normales'
        };

        this.levelNotes = [];
        this.currentIndex = 0;

        this.spacing = 26;
        this.heads = ['nota','cerebro','dona','emoji1','emoji2','galleta','ovni','pelota','pizza','planeta','reloj','sol'];
        this.images = {};
        this.isAuthRegister = false;

        // Notificación flotante (reemplaza alert())
        this._notifTimer = null;
    }

    async init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        await this.preloadHeads();
        this.buildCustomizerGrid();
        this.setupAuthUI();
        this.setupMenuEvents();

        // Monitor de estado de sesión Firebase Auth
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.user = user;
                this.isGuest = false;
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    this.state.selectedHead = data.selectedHead || 'nota';
                    document.getElementById('user-welcome').innerText =
                        `Sesión: ${data.username} (Récord: ${data.highScore} pts)`;
                }
                // FIX: era .add() en lugar de .classList.add()
                document.getElementById('auth-layer').classList.add('hidden');
                document.getElementById('menu-layer').classList.remove('hidden');
            } else {
                if (!this.isGuest) {
                    document.getElementById('menu-layer').classList.add('hidden');
                    document.getElementById('auth-layer').classList.remove('hidden');
                }
            }
        });

        setTimeout(() => {
            const splash = document.getElementById('splash-layer');
            if (splash) {
                splash.style.opacity = '0';
                splash.style.transition = 'opacity 0.5s ease';
                setTimeout(() => splash.remove(), 500);
            }
        }, 1800);

        // Arrancar el loop de render (siempre corre, dibuja según gameActive)
        this.loop();
    }

    resize() {
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.clientWidth;
        this.canvas.height = wrapper.clientHeight;
        // Recalcular spacing según altura disponible
        this.spacing = Math.max(18, Math.min(30, this.canvas.height / 14));
    }

    async preloadHeads() {
        const p = this.heads.map(h => new Promise(r => {
            const img = new Image();
            img.src = `assets/cabezas/${h}.png`;
            img.onload = () => { this.images[h] = img; r(); };
            img.onerror = () => { this.images[h] = null; r(); };
        }));
        await Promise.all(p);
    }

    // ==========================================
    // AUTENTICACIÓN
    // ==========================================
    setupAuthUI() {
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const userInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const primaryBtn = document.getElementById('auth-primary-btn');

        toggleBtn.addEventListener('click', () => {
            this.isAuthRegister = !this.isAuthRegister;
            document.getElementById('auth-title').innerText = this.isAuthRegister ? "CREAR CUENTA" : "INICIAR SESIÓN";
            primaryBtn.innerText = this.isAuthRegister ? "Registrar" : "Entrar";
            toggleBtn.innerText = this.isAuthRegister
                ? "¿Ya tienes cuenta? Inicia Sesión"
                : "¿No tienes cuenta? Regístrate";
        });

        primaryBtn.addEventListener('click', async () => {
            const username = userInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                this.showNotif("Por favor, completa todos los campos.", 'warn');
                return;
            }
            if (password.length < 6) {
                this.showNotif("La contraseña debe tener al menos 6 caracteres.", 'warn');
                return;
            }

            // Convertir usuario a correo sintético para Firebase Auth
            const cleanUsername = username.replace(/\s+/g, '').toLowerCase();
            const virtualEmail = `${cleanUsername}@notaventuras.internal`;

            primaryBtn.disabled = true;
            primaryBtn.innerText = "Procesando...";

            try {
                if (this.isAuthRegister) {
                    const cred = await createUserWithEmailAndPassword(auth, virtualEmail, password);
                    await setDoc(doc(db, "users", cred.user.uid), {
                        uid: cred.user.uid,
                        username: username,
                        highScore: 0,
                        selectedHead: 'nota'
                    });
                } else {
                    await signInWithEmailAndPassword(auth, virtualEmail, password);
                }
                userInput.value = "";
                passwordInput.value = "";
                // El onAuthStateChanged se encarga del resto
            } catch (err) {
                let msg = "Ocurrió un problema inesperado.";
                if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
                    msg = "Usuario o contraseña incorrectos.";
                } else if (err.code === "auth/email-already-in-use") {
                    msg = "Ese nombre de usuario ya está registrado.";
                } else if (err.code === "auth/network-request-failed") {
                    msg = "Sin conexión a internet.";
                } else {
                    msg = err.message;
                }
                this.showNotif(`Error: ${msg}`, 'error');
            } finally {
                primaryBtn.disabled = false;
                primaryBtn.innerText = this.isAuthRegister ? "Registrar" : "Entrar";
            }
        });

        document.getElementById('auth-guest-btn').addEventListener('click', () => {
            this.isGuest = true;
            this.user = null;
            document.getElementById('user-welcome').innerText = "Sesión: Modo Invitado (no guarda récord)";
            document.getElementById('auth-layer').classList.add('hidden');
            document.getElementById('menu-layer').classList.remove('hidden');
        });

        document.getElementById('logout-btn').addEventListener('click', async () => {
            this.gameActive = false;
            this.levelNotes = [];
            await signOut(auth);
            this.isGuest = false;
            document.getElementById('menu-layer').classList.add('hidden');
            document.getElementById('interaction-dock').innerHTML = '';
            document.getElementById('menu-back-btn').classList.add('hidden');
            document.getElementById('auth-layer').classList.remove('hidden');
        });
    }

    // ==========================================
    // MENÚ Y NAVEGACIÓN
    // ==========================================
    setupMenuEvents() {
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.state.subMode = e.target.dataset.mode;
                this.state.score = 0;
                this.state.combo = 0;
                this.state.accuracy = 100;
                document.getElementById('menu-layer').classList.add('hidden');
                document.getElementById('menu-back-btn').classList.remove('hidden');

                if (window.innerWidth < 768 && document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                }

                this.startLevel(1);
            });
        });

        document.getElementById('open-ranking-btn').addEventListener('click', () => this.showRanking());
        document.getElementById('close-ranking-btn').addEventListener('click', () =>
            document.getElementById('ranking-layer').classList.add('hidden'));
        document.querySelector('[data-action="open-custom"]').addEventListener('click', () =>
            document.getElementById('custom-layer').classList.remove('hidden'));
        document.getElementById('close-custom-btn').addEventListener('click', () =>
            document.getElementById('custom-layer').classList.add('hidden'));

        document.getElementById('menu-back-btn').addEventListener('click', () => {
            this.gameActive = false;
            this.levelNotes = [];
            this.feedbackState = null;
            this.isProcessing = false;
            document.getElementById('menu-layer').classList.remove('hidden');
            document.getElementById('menu-back-btn').classList.add('hidden');
            document.getElementById('interaction-dock').innerHTML = '';
        });
    }

    // ==========================================
    // RANKING
    // ==========================================
    async showRanking() {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#41E1FA;">Consultando Firestore...</div>';
        document.getElementById('ranking-layer').classList.remove('hidden');

        try {
            const q = query(collection(db, "users"), orderBy("highScore", "desc"), limit(10));
            const querySnapshot = await getDocs(q);
            container.innerHTML = "";
            const medals = ['🥇','🥈','🥉'];
            let pos = 1;
            querySnapshot.forEach((d) => {
                const data = d.data();
                const medal = medals[pos - 1] || `#${pos}`;
                const isMe = this.user && d.id === this.user.uid;
                container.innerHTML += `
                    <div class="ranking-item ${isMe ? 'ranking-me' : ''}">
                        <span>${medal} ${data.username}${isMe ? ' (tú)' : ''}</span>
                        <span style="color:#FFD700;font-weight:bold;">${data.highScore.toLocaleString()} pts</span>
                    </div>`;
                pos++;
            });
            if (pos === 1) {
                container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">Aún no hay puntuaciones registradas.</div>';
            }
        } catch (e) {
            container.innerHTML = '<div style="text-align:center;color:#FF5555;padding:20px;">Inicia sesión para ver el ranking en la nube.</div>';
        }
    }

    // ==========================================
    // PERSONALIZADOR DE AVATARES
    // ==========================================
    buildCustomizerGrid() {
        const grid = document.getElementById('heads-grid');
        this.heads.forEach(h => {
            const item = document.createElement('div');
            item.className = `head-item ${this.state.selectedHead === h ? 'selected' : ''}`;
            item.dataset.head = h;

            const th = document.createElement('canvas');
            th.width = 50; th.height = 50;
            const tc = th.getContext('2d');

            // Renderizar miniatura una vez que imágenes estén listas
            const renderThumb = () => {
                tc.clearRect(0, 0, 50, 50);
                if (this.images[h]) {
                    tc.drawImage(this.images[h], 2, 2, 46, 46);
                } else {
                    tc.fillStyle = '#41E1FA';
                    tc.beginPath(); tc.arc(25, 25, 18, 0, Math.PI * 2); tc.fill();
                }
            };

            // Intentar inmediatamente, y también tras un delay por si las imágenes tardan
            renderThumb();
            setTimeout(renderThumb, 300);

            item.appendChild(th);
            item.addEventListener('click', async () => {
                document.querySelectorAll('.head-item').forEach(x => x.classList.remove('selected'));
                item.classList.add('selected');
                this.state.selectedHead = h;
                if (this.user && !this.isGuest) {
                    try {
                        await updateDoc(doc(db, "users", this.user.uid), { selectedHead: h });
                    } catch (e) { /* silencioso */ }
                }
            });
            grid.appendChild(item);
        });
    }

    // ==========================================
    // LÓGICA DE NIVEL
    // ==========================================
    startLevel(lvl) {
        this.state.level = lvl;
        this.currentIndex = 0;
        this.levelNotes = [];
        this.feedbackState = null;
        this.isProcessing = false;
        this.gameActive = true;

        const pool = Object.keys(NOTE_MAP);
        let allowed = pool;
        if (this.state.subMode === 'normales') allowed = pool.filter(n => NOTE_MAP[n].group === 1);
        if (this.state.subMode === 'agudas') allowed = pool.filter(n => NOTE_MAP[n].group === 2);

        for (let i = 0; i < 20; i++) {
            const randNote = allowed[Math.floor(Math.random() * allowed.length)];
            this.levelNotes.push({ key: randNote, status: 'pending' });
        }

        this.buildInputDock();
        this.updateHUD();
    }

    // ==========================================
    // CONTROLES DE INTERACCIÓN
    // ==========================================
    buildInputDock() {
        const dock = document.getElementById('interaction-dock');
        dock.innerHTML = '';

        const isMobile = window.innerWidth < 768;
        const pianoMode = (this.state.subMode === 'mixtas') && !isMobile;

        if (pianoMode) {
            // Piano en escritorio para modo mixto
            const p = document.createElement('div');
            p.className = 'piano-container';
            const keys = this.state.subMode === 'agudas'
                ? ['C5','D5','E5','F5','G5','A5','B5']
                : ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5'];
            keys.forEach(k => {
                const key = document.createElement('div');
                key.className = 'piano-key';
                key.innerText = NOTE_MAP[k].name;
                key.addEventListener('click', () => this.evaluateInput(k));
                p.appendChild(key);
            });
            dock.appendChild(p);
        } else {
            // Botones para cualquier otro modo
            const c = document.createElement('div');
            c.className = 'botones-container';
            ['DO','RE','MI','FA','SOL','LA','SI'].forEach(n => {
                const b = document.createElement('button');
                b.className = 'action-btn';
                b.innerText = n;
                b.addEventListener('click', () => this.evaluateInputByName(n));
                c.appendChild(b);
            });
            dock.appendChild(c);
        }
    }

    evaluateInput(k) {
        if (!this.gameActive || this.isProcessing || this.feedbackState) return;
        this.processAnswer(k === this.levelNotes[this.currentIndex].key);
    }

    evaluateInputByName(n) {
        if (!this.gameActive || this.isProcessing || this.feedbackState) return;
        this.processAnswer(n === NOTE_MAP[this.levelNotes[this.currentIndex].key].name);
    }

    async processAnswer(isCorrect) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const currentNote = this.levelNotes[this.currentIndex];

        if (isCorrect) {
            this.audio.play(currentNote.key);
            this.audio.feedback(true);
            currentNote.status = 'hit';
            this.state.combo++;
            this.state.score += (10 * this.state.combo * this.state.level);
        } else {
            this.audio.feedback(false);
            currentNote.status = 'miss';
            this.state.combo = 0;
        }

        // Precisión basada en notas procesadas
        const checked = this.levelNotes.filter(n => n.status !== 'pending').length;
        const hits = this.levelNotes.filter(n => n.status === 'hit').length;
        this.state.accuracy = checked > 0 ? Math.round((hits / checked) * 100) : 100;
        this.updateHUD();

        // En móvil: mostrar feedback visual antes de avanzar
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            this.feedbackState = { result: isCorrect ? 'hit' : 'miss', timer: this.FEEDBACK_FRAMES };
            // El avance lo gestiona el loop al terminar el timer
        } else {
            this.currentIndex++;
            this.isProcessing = false;
            await this.checkLevelEnd();
        }
    }

    async checkLevelEnd() {
        if (this.currentIndex >= 20) {
            this.gameActive = false;
            await this.saveBestScore();
            this.showLevelEndModal();
        }
    }

    async saveBestScore() {
        if (this.user && !this.isGuest) {
            try {
                const userRef = doc(db, "users", this.user.uid);
                const snap = await getDoc(userRef);
                if (snap.exists() && this.state.score > snap.data().highScore) {
                    await updateDoc(userRef, { highScore: this.state.score });
                    document.getElementById('user-welcome').innerText =
                        `Sesión: ${snap.data().username} (Récord: ${this.state.score} pts)`;
                }
            } catch (e) { /* conexión fallida, continuar */ }
        }
    }

    // Notificación flotante que reemplaza alert()
    showLevelEndModal() {
        const hits = this.levelNotes.filter(n => n.status === 'hit').length;
        const msg = `🎵 ¡Nivel ${this.state.level} completado!\n✅ Aciertos: ${hits}/20 · 🎯 ${this.state.accuracy}% precisión\n⭐ Puntaje: ${this.state.score.toLocaleString()} pts`;
        this.showNotif(msg, 'success', 3000, () => {
            if (this.gameActive === false) {
                this.startLevel(this.state.level + 1);
            }
        });
    }

    updateHUD() {
        document.getElementById('hud-level').innerText = this.state.level;
        document.getElementById('hud-note-count').innerText = `${Math.min(this.currentIndex + 1, 20)}/20`;
        document.getElementById('hud-score').innerText = this.state.score.toLocaleString();
        document.getElementById('hud-combo').innerText = this.state.combo;
        document.getElementById('hud-accuracy').innerText = this.state.accuracy;
    }

    // ==========================================
    // SISTEMA DE NOTIFICACIONES (reemplaza alert)
    // ==========================================
    showNotif(msg, type = 'info', duration = 2500, onClose = null) {
        let notif = document.getElementById('game-notif');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'game-notif';
            document.getElementById('app-viewport').appendChild(notif);
        }

        const colors = {
            success: { bg: '#1a3d2b', border: '#2ECC71', text: '#2ECC71' },
            error:   { bg: '#3d1a1a', border: '#FF5555', text: '#FF5555' },
            warn:    { bg: '#3d2e0a', border: '#FFD700', text: '#FFD700' },
            info:    { bg: '#0a2233', border: '#41E1FA', text: '#41E1FA' },
        };
        const c = colors[type] || colors.info;

        notif.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: ${c.bg}; border: 2px solid ${c.border}; color: ${c.text};
            border-radius: 16px; padding: 20px 30px; z-index: 900;
            font-family: 'Fredoka One', sans-serif; font-size: 1.1rem;
            text-align: center; white-space: pre-line;
            box-shadow: 0 0 30px rgba(0,0,0,0.5);
            max-width: 320px; line-height: 1.5;
            animation: notifIn 0.2s ease;
        `;
        notif.innerText = msg;
        notif.style.display = 'block';

        // Añadir keyframe si no existe
        if (!document.getElementById('notif-style')) {
            const s = document.createElement('style');
            s.id = 'notif-style';
            s.innerText = `@keyframes notifIn { from { opacity:0; transform: translate(-50%,-55%); } to { opacity:1; transform: translate(-50%,-50%); } }`;
            document.head.appendChild(s);
        }

        clearTimeout(this._notifTimer);
        this._notifTimer = setTimeout(() => {
            notif.style.display = 'none';
            if (onClose) onClose();
        }, duration);
    }

    // ==========================================
    // RENDER LOOP
    // ==========================================
    loop() {
        requestAnimationFrame(() => this.loop());
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Fondo degradado sutil del canvas
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(11,19,43,0.6)');
        bg.addColorStop(1, 'rgba(28,37,65,0.3)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        if (!this.gameActive || this.levelNotes.length === 0) {
            // Pantalla vacía con pentagrama decorativo
            this.drawStaff(W, H);
            return;
        }

        const isMobile = window.innerWidth < 768;
        const midY = H / 2;

        // ---- GESTIÓN DEL TIMER DE FEEDBACK EN MÓVIL ----
        if (isMobile && this.feedbackState) {
            this.feedbackState.timer--;
            if (this.feedbackState.timer <= 0) {
                this.feedbackState = null;
                this.currentIndex++;
                this.isProcessing = false;
                this.checkLevelEnd();
                this.updateHUD();
            }
        }

        // 1. DIBUJAR PENTAGRAMA
        this.drawStaff(W, H);

        // 2. DIBUJAR CLAVE DE SOL
        this.drawTrebleClef(midY);

        // 3. RENDERIZADO CONDICIONAL
        if (isMobile) {
            this.renderMobile(midY, W);
        } else {
            this.renderDesktop(midY, W);
        }
    }

    drawStaff(W, H) {
        const midY = H / 2;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        this.ctx.lineWidth = 1.8;
        for (let i = -2; i <= 2; i++) {
            const y = midY + (i * this.spacing);
            this.ctx.beginPath();
            this.ctx.moveTo(30, y);
            this.ctx.lineTo(W - 30, y);
            this.ctx.stroke();
        }
    }

    drawTrebleClef(midY) {
        // Clave de Sol simplificada como texto Unicode (escala con spacing)
        const size = this.spacing * 4.5;
        this.ctx.font = `${size}px serif`;
        this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
        this.ctx.fillText('𝄞', 35, midY + this.spacing * 2.8);
    }

    // --- MODO MÓVIL: 1 NOTA A LA VEZ CON FEEDBACK VISUAL ---
    renderMobile(midY, W) {
        if (this.currentIndex >= this.levelNotes.length) return;

        const activeNote = this.levelNotes[this.currentIndex];
        const data = NOTE_MAP[activeNote.key];
        const x = W / 2;
        const y = midY - (data.offset * (this.spacing / 2));

        // Halo de la nota activa
        this.ctx.fillStyle = 'rgba(65, 225, 250, 0.1)';
        this.ctx.beginPath();
        this.ctx.arc(x, midY, this.spacing * 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.drawLedgerLines(x, data.offset, midY);
        this.drawNoteheadAsset(x, y, this.state.selectedHead);

        // Feedback visual superpuesto
        if (this.feedbackState) {
            const alpha = Math.min(1, this.feedbackState.timer / 15);
            if (this.feedbackState.result === 'hit') {
                this.ctx.fillStyle = `rgba(46, 204, 113, ${alpha * 0.25})`;
                this.ctx.beginPath();
                this.ctx.arc(x, midY, this.spacing * 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = `rgba(46, 204, 113, ${alpha})`;
                this.ctx.font = `bold ${this.spacing * 2.5}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText('✓', x, midY - this.spacing * 4);
                this.ctx.textAlign = 'left';
            } else {
                this.ctx.fillStyle = `rgba(255, 85, 85, ${alpha * 0.25})`;
                this.ctx.beginPath();
                this.ctx.arc(x, midY, this.spacing * 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = `rgba(255, 85, 85, ${alpha})`;
                this.ctx.font = `bold ${this.spacing * 2.5}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText('✗', x, midY - this.spacing * 4);
                // Mostrar la nota correcta
                this.ctx.font = `${this.spacing * 0.9}px 'Fredoka One', sans-serif`;
                this.ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
                this.ctx.fillText(`Era: ${NOTE_MAP[activeNote.key].name}`, x, midY + this.spacing * 5);
                this.ctx.textAlign = 'left';
            }
        }
    }

    // --- MODO ESCRITORIO: 10 NOTAS CON INDICADORES ---
    renderDesktop(midY, W) {
        let startBatch = Math.floor(this.currentIndex / 10) * 10;
        const clefOffset = 90; // Espacio para la clave de sol
        const usableW = W - clefOffset - 30;
        const trackWidth = usableW / 11;

        for (let i = 0; i < 10; i++) {
            const targetNoteIndex = startBatch + i;
            if (targetNoteIndex >= 20) break;

            const noteItem = this.levelNotes[targetNoteIndex];
            const data = NOTE_MAP[noteItem.key];
            const x = clefOffset + trackWidth * (i + 1);
            const y = midY - (data.offset * (this.spacing / 2));

            // Halo de nota activa
            if (targetNoteIndex === this.currentIndex) {
                const pulse = 0.1 + 0.05 * Math.sin(Date.now() / 200);
                this.ctx.fillStyle = `rgba(65, 225, 250, ${pulse})`;
                this.ctx.beginPath();
                this.ctx.arc(x, midY, this.spacing * 2.5, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Nota con opacidad reducida si ya fue respondida
            this.ctx.globalAlpha = noteItem.status !== 'pending' ? 0.45 : 1.0;
            this.drawLedgerLines(x, data.offset, midY);
            this.drawNoteheadAsset(x, y, this.state.selectedHead);
            this.ctx.globalAlpha = 1.0;

            // Indicadores de resultado
            const iconY = midY - (this.spacing * 3.2);
            if (noteItem.status === 'hit') {
                this.ctx.fillStyle = '#2ECC71';
                this.ctx.font = `bold ${this.spacing}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText('✓', x, iconY);
            } else if (noteItem.status === 'miss') {
                this.ctx.fillStyle = '#FF5555';
                this.ctx.font = `bold ${this.spacing}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText('✗', x, iconY);
            }

            // Número de posición debajo
            this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
            this.ctx.font = `${this.spacing * 0.55}px 'Nunito', sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(targetNoteIndex + 1, x, midY + (this.spacing * 3.5));
            this.ctx.textAlign = 'left';
        }
    }

    // ==========================================
    // HELPERS DE DIBUJO
    // ==========================================
    drawLedgerLines(x, offset, midY) {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        this.ctx.lineWidth = 2;
        // Línea adicional inferior (DO central - C4)
        if (offset <= -6) {
            const ly = midY + (3 * this.spacing);
            this.ctx.beginPath();
            this.ctx.moveTo(x - 22, ly);
            this.ctx.lineTo(x + 22, ly);
            this.ctx.stroke();
        }
        // Línea adicional superior (LA5, SI5)
        if (offset >= 6) {
            const ly = midY - (3 * this.spacing);
            this.ctx.beginPath();
            this.ctx.moveTo(x - 22, ly);
            this.ctx.lineTo(x + 22, ly);
            this.ctx.stroke();
        }
        // Segunda línea adicional (SI5 - offset 7)
        if (offset >= 7) {
            const ly = midY - (3.5 * this.spacing);
            this.ctx.beginPath();
            this.ctx.moveTo(x - 22, ly);
            this.ctx.lineTo(x + 22, ly);
            this.ctx.stroke();
        }
    }

    drawNoteheadAsset(x, y, headStyle) {
        const img = this.images[headStyle];
        if (img) {
            const targetH = this.spacing * 1.35;
            const factor = targetH / (img.naturalHeight || 300);
            const targetW = (img.naturalWidth || 300) * factor;
            this.ctx.drawImage(img, x - (targetW / 2), y - (targetH / 2), targetW, targetH);
        } else {
            // Fallback: elipse estilo nota musical
            this.ctx.fillStyle = '#41E1FA';
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, this.spacing * 0.6, this.spacing * 0.45, -0.2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
    }
}

// ==========================================
// PUNTO DE ENTRADA
// ==========================================
document.addEventListener('DOMContentLoaded', () => { (new GameApp()).init(); });
