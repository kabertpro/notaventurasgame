// ==========================================
// IMPORTACIONES CDN NATIVAS DE FIREBASE v10
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// !!! REEMPLAZA ESTE CONFIG CON TUS PROPIAS CREDENCIALES DE LA CONSOLE !!!
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
    constructor() { this.ctx = null; this.pitches = { 'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392.00,'A4':440.00,'B4':493.88,'C5':523.25,'D5':587.33,'E5':659.25,'F5':698.46,'G5':783.99,'A5':880.00,'B5':987.77 }; }
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    play(k) { this.init(); const f = this.pitches[k]; if(!f)return; const now=this.ctx.currentTime; const osc=this.ctx.createOscillator(); const g=this.ctx.createGain(); osc.type='triangle'; osc.frequency.setValueAtTime(f,now); g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.3,now+0.04); g.gain.exponentialRampToValueAtTime(0.001,now+0.6); osc.connect(g); g.connect(this.ctx.destination); osc.start(now); osc.stop(now+0.6); }
    feedback(hit) { this.init(); const now=this.ctx.currentTime; const osc=this.ctx.createOscillator(); const g=this.ctx.createGain(); osc.connect(g); g.connect(this.ctx.destination); if(hit){ osc.frequency.setValueAtTime(523.25,now); g.gain.setValueAtTime(0.1,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.15); osc.start(now); osc.stop(now+0.15); }else{ osc.frequency.setValueAtTime(140,now); g.gain.setValueAtTime(0.2,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.25); osc.start(now); osc.stop(now+0.25); } }
}

// ARQUITECTURA DE JUEGO CORE
class GameApp {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioEngine();
        
        // Estado inicial de sesión y juego
        this.user = null; // Guardará el objeto de Firebase Auth si está logueado
        this.isGuest = false;
        
        this.state = { score: 0, combo: 0, level: 1, accuracy: 100, selectedHead: 'nota', subMode: 'normales' };
        
        // Pool del nivel: siempre 20 notas estructurales
        this.levelNotes = []; 
        this.currentIndex = 0; 
        
        this.spacing = 26;
        this.heads = ['nota','cerebro','dona','emoji1','emoji2','galleta','ovni','pelota','pizza','planeta','reloj','sol'];
        this.images = {};
        this.isAuthRegister = false;
    }

    async init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        await this.preloadHeads();
        this.buildCustomizerGrid();
        this.setupAuthUI();
        this.setupMenuEvents();
        
        // Monitor de estado de sesión en tiempo real (Firebase Auth)
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.user = user;
                this.isGuest = false;
                // Descargar datos previos guardados en base de datos
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    this.state.selectedHead = data.selectedHead || 'nota';
                    document.getElementById('user-welcome').innerText = `Sesión: ${data.username} (Récord: ${data.highScore} pts)`;
                }
                document.getElementById('auth-layer').add('hidden');
                document.getElementById('menu-layer').classList.remove('hidden');
            } else {
                if(!this.isGuest) {
                    document.getElementById('menu-layer').classList.add('hidden');
                    document.getElementById('auth-layer').classList.remove('hidden');
                }
            }
        });

        setTimeout(() => {
            document.getElementById('splash-layer').style.opacity = '0';
            setTimeout(() => document.getElementById('splash-layer').remove(), 500);
        }, 1500);

        this.loop();
    }

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    }

    async preloadHeads() {
        const p = this.heads.map(h => new Promise(r => {
            const img = new Image(); img.src = `assets/cabezas/${h}.png`;
            img.onload = () => { this.images[h] = img; r(); };
            img.onerror = () => { this.images[h] = null; r(); };
        }));
        await Promise.all(p);
    }

	setupAuthUI() {
		const toggleBtn = document.getElementById('auth-toggle-btn');
		const userInput = document.getElementById('auth-username');
		const passwordInput = document.getElementById('auth-password');
		const primaryBtn = document.getElementById('auth-primary-btn');

		// Cambiar visualmente entre modo Login y modo Registro
		toggleBtn.addEventListener('click', () => {
			this.isAuthRegister = !this.isAuthRegister;
			document.getElementById('auth-title').innerText = this.isAuthRegister ? "CREAR CUENTA" : "INICIAR SESIÓN";
			primaryBtn.innerText = this.isAuthRegister ? "Registrar" : "Entrar";
			toggleBtn.innerText = this.isAuthRegister ? "¿Ya tienes cuenta? Inicia Sesión" : "¿No tienes cuenta? Regístrate";
		});

		// Procesar el clic en el botón principal
		primaryBtn.addEventListener('click', async () => {
			const username = userInput.value.trim();
			const password = passwordInput.value;

			if (!username || !password) {
				alert("Por favor, completa todos los campos.");
				return;
			}

			if (password.length < 6) {
				alert("La contraseña debe tener al menos 6 caracteres.");
				return;
			}

			// MÁGIA DETRÁS DE ESCENAS: Convertimos el usuario en un correo sintético válido para Firebase
			// Reemplazamos espacios para evitar fallos de sintaxis en el engine de Firebase
			const cleanUsername = username.replace(/\s+/g, '').toLowerCase();
			const virtualEmail = `${cleanUsername}@notaventuras.internal`;

			try {
				if (this.isAuthRegister) {
					// Registrar nueva cuenta en la nube
					const cred = await createUserWithEmailAndPassword(auth, virtualEmail, password);
					
					// Guardar su perfil en la base de datos Firestore usando su nombre real/bonito
					await setDoc(doc(db, "users", cred.user.uid), {
						uid: cred.user.uid, 
						username: username, // Aquí se guarda tal como lo escribió (ej: "Juan Pérez")
						highScore: 0, 
						selectedHead: 'nota'
					});
				} else {
					// Iniciar sesión con la cuenta existente
					await signInWithEmailAndPassword(auth, virtualEmail, password);
				}
				
				// Limpiar campos de seguridad
				userInput.value = "";
				passwordInput.value = "";
				
				document.getElementById('auth-layer').classList.add('hidden');
				document.getElementById('menu-layer').classList.remove('hidden');
			} catch (err) {
				// Traductor pedagógico de errores de Firebase
				let friendlyMessage = "Ocurrió un problema inesperado.";
				if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
					friendlyMessage = "Usuario o contraseña incorrectos. Verifica los datos.";
				} else if (err.code === "auth/email-already-in-use") {
					friendlyMessage = "Ese nombre de usuario ya está registrado por otro estudiante.";
				} else {
					friendlyMessage = err.message;
				}
				alert(`Aviso: ${friendlyMessage}`);
			}
		});

		// Botón para ingresar como invitado sin datos
		document.getElementById('auth-guest-btn').addEventListener('click', () => {
			this.isGuest = true;
			this.user = null;
			document.getElementById('user-welcome').innerText = "Sesión: Modo Invitado (No guarda récord)";
			document.getElementById('auth-layer').classList.add('hidden');
			document.getElementById('menu-layer').classList.remove('hidden');
		});

		// Botón de cerrar sesión
		document.getElementById('logout-btn').addEventListener('click', async () => {
			await signOut(auth);
			this.isGuest = false;
			document.getElementById('menu-layer').classList.add('hidden');
			document.getElementById('auth-layer').classList.remove('hidden');
		});
	}

    setupMenuEvents() {
        document.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.state.subMode = e.target.dataset.mode;
                document.getElementById('menu-layer').classList.add('hidden');
                document.getElementById('menu-back-btn').classList.remove('hidden');
                
                // Forzar pantalla completa en teléfonos móviles y verificar orientación vertical
                if(window.innerWidth < 768) {
                    if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
                }
                
                this.startLevel(1);
            });
        });

        document.getElementById('open-ranking-btn').addEventListener('click', () => this.showRanking());
        document.getElementById('close-ranking-btn').addEventListener('click', () => document.getElementById('ranking-layer').classList.add('hidden'));
        document.querySelector('[data-action="open-custom"]').addEventListener('click', () => document.getElementById('custom-layer').classList.remove('hidden'));
        document.getElementById('close-custom-btn').addEventListener('click', () => document.getElementById('custom-layer').classList.add('hidden'));
        
        document.getElementById('menu-back-btn').addEventListener('click', () => {
            document.getElementById('menu-layer').classList.remove('hidden');
            document.getElementById('menu-back-btn').classList.add('hidden');
            document.getElementById('interaction-dock').innerHTML = '';
            this.levelNotes = [];
        });
    }

    async showRanking() {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = "Consultando base de datos Firestore...";
        document.getElementById('ranking-layer').classList.remove('hidden');

        try {
            const q = query(collection(db, "users"), orderBy("highScore", "desc"), limit(10));
            const querySnapshot = await getDocs(q);
            container.innerHTML = "";
            let pos = 1;
            querySnapshot.forEach((doc) => {
                const d = doc.data();
                container.innerHTML += `<div class="ranking-item"><span>#${pos} ${d.username}</span><span>${d.highScore} pts</span></div>`;
                pos++;
            });
        } catch (e) {
            container.innerHTML = "Regístrate e inicia sesión para activar el servidor cloud de rankings.";
        }
    }

    buildCustomizerGrid() {
        const grid = document.getElementById('heads-grid');
        this.heads.forEach(h => {
            const item = document.createElement('div');
            item.className = `head-item ${this.state.selectedHead === h ? 'selected' : ''}`;
            const th = document.createElement('canvas'); th.width=50; th.height=50;
            const tc = th.getContext('2d');
            setTimeout(() => {
                if(this.images[h]) tc.drawImage(this.images[h], 2, 2, 46, 46);
                else { tc.fillStyle='#41E1FA'; tc.beginPath(); tc.arc(25,25,18,0,Math.PI*2); tc.fill(); }
            }, 200);
            item.appendChild(th);
            item.addEventListener('click', async () => {
                document.querySelectorAll('.head-item').forEach(x => x.classList.remove('selected'));
                item.classList.add('selected');
                this.state.selectedHead = h;
                if(this.user && !this.isGuest) {
                    await updateDoc(doc(db, "users", this.user.uid), { selectedHead: h });
                }
            });
            grid.appendChild(item);
        });
    }

    startLevel(lvl) {
        this.state.level = lvl;
        this.currentIndex = 0;
        this.levelNotes = [];

        // Pool de notas filtrado por la selección pedagógica del usuario
        const pool = Object.keys(NOTE_MAP);
        let allowed = pool;
        if (this.state.subMode === 'normales') allowed = pool.filter(n => NOTE_MAP[n].group === 1);
        if (this.state.subMode === 'agudas') allowed = pool.filter(n => NOTE_MAP[n].group === 2);

        // Generación inmutable de exactamente 20 notas para el nivel actual
        for (let i = 0; i < 20; i++) {
            const randNote = allowed[Math.floor(Math.random() * allowed.length)];
            this.levelNotes.push({ key: randNote, status: 'pending' }); // 'pending', 'hit', 'miss'
        }

        this.buildInputDock();
        this.updateHUD();
    }

    buildInputDock() {
        const dock = document.getElementById('interaction-dock');
        dock.innerHTML = '';
        
        // El celular siempre entra en modo Botonera/Piano adaptivo vertical
        const pianoMode = (this.state.subMode === 'mixtas');
        if (pianoMode && window.innerWidth > 768) {
            const p = document.createElement('div'); p.className = 'piano-container';
            ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5'].forEach(k => {
                const key = document.createElement('div'); key.className='piano-key'; key.innerText=NOTE_MAP[k].name;
                key.addEventListener('click', () => this.evaluateInput(k)); p.appendChild(key);
            });
            dock.appendChild(p);
        } else {
            const c = document.createElement('div'); c.className = 'botones-container';
            ['DO','RE','MI','FA','SOL','LA','SI'].forEach(n => {
                const b = document.createElement('button'); b.className='action-btn'; b.innerText=n;
                b.addEventListener('click', () => this.evaluateInputByName(n)); c.appendChild(b);
            });
            dock.appendChild(c);
        }
    }

    evaluateInput(k) { this.processAnswer(k === this.levelNotes[this.currentIndex].key); }
    evaluateInputByName(n) { this.processAnswer(n === NOTE_MAP[this.levelNotes[this.currentIndex].key].name); }

    async processAnswer(isCorrect) {
        if (isCorrect) {
            this.audio.play(this.levelNotes[this.currentIndex].key);
            this.audio.feedback(true);
            this.levelNotes[this.currentIndex].status = 'hit';
            this.state.combo++;
            this.state.score += (100 * this.state.combo * this.state.level);
        } else {
            this.audio.feedback(false);
            this.levelNotes[this.currentIndex].status = 'miss';
            this.state.combo = 0;
        }

        this.currentIndex++;
        
        // Cálculo de precisión en base a las notas procesadas del lote de 20
        const checked = this.levelNotes.filter(n => n.status !== 'pending').length;
        const hits = this.levelNotes.filter(n => n.status === 'hit').length;
        this.state.accuracy = Math.round((hits / checked) * 100);

        this.updateHUD();

        // CONTROL DE FINALIZACIÓN DE NIVEL (Tras cumplirse las 20 notas obligatorias)
        if (this.currentIndex >= 20) {
            alert(`¡Nivel ${this.state.level} Terminado! Pasando al siguiente nivel.`);
            if (this.user && !this.isGuest) {
                // Guardar puntuación acumulativa de manera segura en Firebase Firestore
                const userRef = doc(db, "users", this.user.uid);
                const snap = await getDoc(userRef);
                if(snap.exists() && this.state.score > snap.data().highScore) {
                    await updateDoc(userRef, { highScore: this.state.score });
                }
            }
            this.startLevel(this.state.level + 1);
            return;
        }
    }

    updateHUD() {
        document.getElementById('hud-level').innerText = this.state.level;
        document.getElementById('hud-note-count').innerText = `${Math.min(this.currentIndex + 1, 20)}/20`;
        document.getElementById('hud-score').innerText = this.state.score;
        document.getElementById('hud-combo').innerText = this.state.combo;
        document.getElementById('hud-accuracy').innerText = this.state.accuracy;
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.levelNotes.length === 0) return;

        const isMobile = window.innerWidth < 768;
        const midY = this.canvas.height / 2;

        // 1. DIBUJAR PENTAGRAMA ESTRUCTURAL
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.lineWidth = 2.5;
        for (let i = -2; i <= 2; i++) {
            const y = midY + (i * this.spacing);
            this.ctx.beginPath(); this.ctx.moveTo(30, y); this.ctx.lineTo(this.canvas.width - 30, y); this.ctx.stroke();
        }

        // 2. RENDERIZADO CONDICIONAL BASADO EN VIEWPORT DISPOSITIVO
        if (isMobile) {
            // --- MODO CELULAR (PANTALLA VERTICAL COMPACTA: 1 POR 1) ---
            const activeNote = this.levelNotes[this.currentIndex];
            const data = NOTE_MAP[activeNote.key];
            const x = this.canvas.width / 2;
            const y = midY - (data.offset * (this.spacing / 2));

            this.drawLedgerLines(x, data.offset, midY);
            this.drawNoteheadAsset(x, y, this.state.selectedHead);

        } else {
            // --- MODO ESCRITORIO O COMPUTADORA (PANTALLA PANORÁMICA: MUESTRA 10 NOTAS CON FEEDBACK) ---
            // Se calcula un bloque móvil de 10 notas basadas en el índice de progresión actual
            let startBatch = Math.floor(this.currentIndex / 10) * 10;
            const trackWidth = this.canvas.width / 11;

            for (let i = 0; i < 10; i++) {
                const targetNoteIndex = startBatch + i;
                if (targetNoteIndex >= 20) break; // Límite inmutable del nivel

                const noteItem = this.levelNotes[targetNoteIndex];
                const data = NOTE_MAP[noteItem.key];
                const x = trackWidth * (i + 1);
                const y = midY - (data.offset * (this.spacing / 2));

                // Resaltar visualmente la nota que el usuario debe responder ahora mismo
                if (targetNoteIndex === this.currentIndex) {
                    this.ctx.fillStyle = 'rgba(65, 225, 250, 0.15)';
                    this.ctx.beginPath(); this.ctx.arc(x, midY, this.spacing * 2, 0, Math.PI * 2); this.ctx.fill();
                }

                this.drawLedgerLines(x, data.offset, midY);
                this.drawNoteheadAsset(x, y, this.state.selectedHead);

                // Dibujar Check Verde o X Roja según el historial de aciertos recopilado en el lienzo
                if (noteItem.status === 'hit') {
                    this.ctx.fillStyle = '#2ECC71'; this.ctx.font = 'bold 26px sans-serif'; this.ctx.fillText('✓', x - 10, midY - (this.spacing * 2.8));
                } else if (noteItem.status === 'miss') {
                    this.ctx.fillStyle = '#FF5555'; this.ctx.font = 'bold 26px sans-serif'; this.ctx.fillText('×', x - 10, midY - (this.spacing * 2.8));
                }
            }
        }
    }

    drawLedgerLines(x, offset, midY) {
        this.ctx.strokeStyle = '#FFFFFF'; this.ctx.lineWidth = 2.5;
        if (offset <= -6) {
            const ly = midY + (3 * this.spacing); this.ctx.beginPath(); this.ctx.moveTo(x - 22, ly); this.ctx.lineTo(x + 22, ly); this.ctx.stroke();
        }
        if (offset >= 6) {
            const ly = midY - (3 * this.spacing); this.ctx.beginPath(); this.ctx.moveTo(x - 22, ly); this.ctx.lineTo(x + 22, ly); this.ctx.stroke();
        }
    }

    drawNoteheadAsset(x, y, headStyle) {
        const img = this.images[headStyle];
        if (img) {
            const targetH = this.spacing * 1.35;
            const factor = targetH / 300;
            const targetW = 300 * factor;
            this.ctx.drawImage(img, x - (targetW / 2), y - (targetH / 2), targetW, targetH);
        } else {
            this.ctx.fillStyle = '#41E1FA'; this.ctx.beginPath();
            this.ctx.ellipse(x, y, this.spacing * 0.6, this.spacing * 0.45, -0.2, 0, Math.PI * 2); this.ctx.fill();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { (new GameApp()).init(); });