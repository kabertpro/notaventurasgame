// ==========================================
// MAPPING PEDAGÓGICO DE NOTAS EN EL PENTAGRAMA
// ==========================================
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

// ==========================================
// MOTOR DE AUDIO (WEB AUDIO API - SIN LATENCIA)
// ==========================================
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.pitches = {
            'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
            'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77
        };
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    play(noteKey) {
        this.init();
        const freq = this.pitches[noteKey];
        if (!freq) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle'; // Tono cálido, similar a un piano/flauta pedagógica
        osc.frequency.setValueAtTime(freq, now);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
    }

    feedback(isCorrect) {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);

        if (isCorrect) {
            osc.frequency.setValueAtTime(523.25, now); // Nota C5 rápida de acierto
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else {
            osc.frequency.setValueAtTime(130.81, now); // Buzz grave de error
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    }
}

// ==========================================
// ARQUITECTURA GENERAL DEL VIDEOJUEGO
// ==========================================
class GameApp {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioEngine();

        // Estado inicial reactivo
        this.state = {
            score: 0, combo: 0, maxStreak: 0, accuracy: 100,
            total: 0, correct: 0, selectedHead: 'nota', mode: 'libre'
        };

        this.currentNote = 'E4';
        this.spacing = 30; // Control de separación de líneas del pentagrama
        this.heads = ['nota','cerebro','dona','emoji1','emoji2','galleta','ovni','pelota','pizza','planeta','reloj','sol'];
        this.images = {};
        
        // Temporizador para el modo contrarreloj
        this.gameTimer = null;
        this.timeLeft = 0;
    }

    async start() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        await this.preloadAssets();
        this.buildCustomizer();
        this.setupEvents();

        // Salida elegante de la pantalla Splash (2 segundos)
        setTimeout(() => {
            const splash = document.getElementById('splash-layer');
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.remove();
                document.getElementById('menu-layer').classList.remove('hidden');
            }, 500);
        }, 2000);

        this.loop();
    }

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    }

    preloadAssets() {
        const promises = this.heads.map(h => {
            return new Promise(resolve => {
                const img = new Image();
                img.src = `assets/cabezas/${h}.png`;
                img.onload = () => { this.images[h] = img; resolve(); };
                img.onerror = () => { this.images[h] = null; resolve(); }; // Fallback procedural listo
            });
        });
        return Promise.all(promises);
    }

    setupEvents() {
        // Captura de botones del menú principal
        document.querySelectorAll('.menu-btn[data-action^="play-"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetMode = e.target.dataset.action.replace('play-', '');
                document.getElementById('menu-layer').classList.add('hidden');
                document.getElementById('menu-back-btn').classList.remove('hidden');
                this.initMode(targetMode);
            });
        });

        // Modales de personalización
        document.querySelector('[data-action="open-custom"]').addEventListener('click', () => {
            document.getElementById('custom-layer').classList.remove('hidden');
        });
        document.getElementById('close-custom-btn').addEventListener('click', () => {
            document.getElementById('custom-layer').classList.add('hidden');
        });

        // Botón de regreso al menú principal
        document.getElementById('menu-back-btn').addEventListener('click', () => {
            clearInterval(this.gameTimer);
            document.getElementById('menu-layer').classList.remove('hidden');
            document.getElementById('menu-back-btn').classList.add('hidden');
            document.getElementById('interaction-dock').innerHTML = '<div style="color: rgba(255,255,255,0.4);">Selecciona un modo para empezar</div>';
            this.state.mode = 'libre';
            this.updateHUD();
        });
    }

    buildCustomizer() {
        const grid = document.getElementById('heads-grid');
        grid.innerHTML = '';
        this.heads.forEach(h => {
            const box = document.createElement('div');
            box.className = `head-item ${this.state.selectedHead === h ? 'selected' : ''}`;
            box.dataset.id = h;

            // Renderizado de miniatura procedural o imagen dentro del selector
            const thumb = document.createElement('canvas');
            thumb.width = 60; thumb.height = 60;
            const tCtx = thumb.getContext('2d');
            
            // Dibujado miniatura de previsualización
            setTimeout(() => {
                if (this.images[h]) {
                    tCtx.drawImage(this.images[h], 5, 5, 50, 50);
                } else {
                    tCtx.fillStyle = '#41E1FA'; tCtx.beginPath(); tCtx.arc(30, 30, 20, 0, Math.PI*2); tCtx.fill();
                    tCtx.fillStyle = '#0B132B'; tCtx.font = '10px sans-serif'; tCtx.fillText(h, 15, 33);
                }
            }, 100);

            box.appendChild(thumb);
            box.addEventListener('click', () => {
                document.querySelectorAll('.head-item').forEach(x => x.classList.remove('selected'));
                box.classList.add('selected');
                this.state.selectedHead = h;
            });
            grid.appendChild(box);
        });
    }

    initMode(mode) {
        clearInterval(this.gameTimer);
        this.state.score = 0;
        this.state.combo = 0;
        this.state.total = 0;
        this.state.correct = 0;
        this.state.accuracy = 100;
        this.state.mode = mode;

        this.nextChallenge();
        this.buildInterface(mode);
        this.updateHUD();

        if (mode === 'contrarreloj') {
            this.timeLeft = 60;
            this.gameTimer = setInterval(() => {
                this.timeLeft--;
                document.getElementById('hud-mode').innerText = `TIEMPO: ${this.timeLeft}s`;
                if (this.timeLeft <= 0) {
                    clearInterval(this.gameTimer);
                    alert(`¡Tiempo terminado! Lograste un puntaje de: ${this.state.score}`);
                    document.getElementById('menu-back-btn').click();
                }
            }, 1000);
        }
    }

    nextChallenge() {
        const pool = Object.keys(NOTE_MAP);
        let selection = pool;

        if (this.state.mode === 'botones') {
            selection = pool.filter(n => NOTE_MAP[n].group === 1); // Notas naturales
        } else if (this.state.mode === 'desafio') {
            selection = pool.filter(n => NOTE_MAP[n].group === 2); // Notas agudas complejas
        }

        this.currentNote = selection[Math.floor(Math.random() * selection.length)];
    }

    buildInterface(mode) {
        const dock = document.getElementById('interaction-dock');
        dock.innerHTML = '';

        if (mode === 'piano') {
            const piano = document.createElement('div');
            piano.className = 'piano-container';
            ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5'].forEach(noteKey => {
                const key = document.createElement('div');
                key.className = 'piano-key';
                key.innerText = NOTE_MAP[noteKey].name;
                key.addEventListener('click', () => this.evaluateInput(noteKey));
                piano.appendChild(key);
            });
            dock.appendChild(piano);
        } else {
            const container = document.createElement('div');
            container.className = 'botones-container';
            ['DO','RE','MI','FA','SOL','LA','SI'].forEach(name => {
                const btn = document.createElement('button');
                btn.className = 'action-btn';
                btn.innerText = name;
                btn.addEventListener('click', () => this.evaluateInputByName(name));
                container.appendChild(btn);
            });
            dock.appendChild(container);
        }
    }

    evaluateInput(noteKey) {
        this.processResult(noteKey === this.currentNote);
    }

    evaluateInputByName(name) {
        this.processResult(name === NOTE_MAP[this.currentNote].name);
    }

    processResult(isHit) {
        this.state.total++;
        if (isHit) {
            this.audio.play(this.currentNote);
            this.audio.feedback(true);
            this.state.correct++;
            this.state.combo++;
            this.state.score += (100 * this.state.combo);
            this.state.maxStreak = Math.max(this.state.combo, this.state.maxStreak);
            this.nextChallenge();
        } else {
            this.audio.feedback(false);
            this.state.combo = 0;
            if (this.state.mode === 'desafio') {
                alert('¡Un error en Modo Desafío rompe la racha! Fin de la partida.');
                document.getElementById('menu-back-btn').click();
                return;
            }
        }
        this.state.accuracy = Math.round((this.state.correct / this.state.total) * 100);
        this.updateHUD();
    }

    updateHUD() {
        if (this.state.mode !== 'contrarreloj') {
            document.getElementById('hud-mode').innerText = this.state.mode.toUpperCase();
        }
        document.getElementById('hud-score').innerText = this.state.score;
        document.getElementById('hud-combo').innerText = this.state.combo;
        document.getElementById('hud-streak').innerText = this.state.maxStreak;
        document.getElementById('hud-accuracy').innerText = this.state.accuracy;
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const midX = this.canvas.width / 2;
        const midY = this.canvas.height / 2;

        // 1. DIBUJAR PENTAGRAMA (5 Líneas Estructurales)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.lineWidth = 3;
        for (let i = -2; i <= 2; i++) {
            const y = midY + (i * this.spacing);
            this.ctx.beginPath(); this.ctx.moveTo(40, y); this.ctx.lineTo(this.canvas.width - 40, y); this.ctx.stroke();
        }

        // 2. DIBUJAR LÍNEAS ADICIONALES (Para notas muy agudas o graves como DO4)
        const currentData = NOTE_MAP[this.currentNote];
        if (currentData) {
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            if (currentData.offset <= -6) { // DO4 Inferior
                const ly = midY + (3 * this.spacing);
                this.ctx.beginPath(); this.ctx.moveTo(midX - 35, ly); this.ctx.lineTo(midX + 35, ly); this.ctx.stroke();
            }
            if (currentData.offset >= 6) { // LA5 y superiores
                const ly = midY - (3 * this.spacing);
                this.ctx.beginPath(); this.ctx.moveTo(midX - 35, ly); this.ctx.lineTo(midX + 35, ly); this.ctx.stroke();
            }

            // 3. RENDERIZADO MATEMÁTICO DE LA NOTAHEAD (300x300px base)
            const targetY = midY - (currentData.offset * (this.spacing / 2));
            const img = this.images[this.state.selectedHead];

            if (img) {
                // Cálculo de compensación y escala exacta para que quepa perfecto en el espacio
                const targetH = this.spacing * 1.35;
                const scale = targetH / 300;
                const targetW = 300 * scale;
                this.ctx.drawImage(img, midX - (targetW / 2), targetY - (targetH / 2), targetW, targetH);
            } else {
                // Sistema Vectorial de Respaldo por si no se han cargado las imágenes en GitHub Pages
                this.ctx.fillStyle = '#41E1FA';
                this.ctx.beginPath();
                this.ctx.ellipse(midX, targetY, this.spacing * 0.65, this.spacing * 0.48, -0.2, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Plica (Cuerpo de la nota musical)
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(midX + (this.spacing * 0.6), targetY);
                this.ctx.lineTo(midX + (this.spacing * 0.6), targetY - (this.spacing * 2.5));
                this.ctx.stroke();
            }
        }
    }
}

// Inicialización del ecosistema al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new GameApp();
    app.start();
});