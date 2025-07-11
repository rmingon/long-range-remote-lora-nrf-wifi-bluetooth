class SerialPlaneController {
    constructor() {
        this.port = null;
        this.reader = null;
        this.isConnected = false;
        this.sensorData = {
            S1: 0, H1: 0, V1: 0,
            S2: 0, H2: 0, V2: 0
        };
        
        // Reference values for center position (zero is center)
        this.referenceValues = {
            H1: 0, V1: 0,
            H2: 0, V2: 0
        };
        
        // Flight mode properties
        this.currentSensitivity = 1;
        this.isInverted = false;
        
        // Game state
        this.lives = 3;
        this.score = 0;
        this.level = 1;
        this.gameObjects = [];
        this.bullets = [];
        this.lastS1State = 0;
        this.isShieldActive = false;
        this.lastFireTime = 0;
        this.fireRate = 200; // ms between shots
        
        this.setupEventListeners();
        this.initializePlane();
        this.startGameLoop();
    }
    
    setupEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());
        
        // Handle page unload
        window.addEventListener('beforeunload', () => this.disconnect());
    }
    
    initializePlane() {
        const flightArea = document.getElementById('flightArea');
        const plane = document.getElementById('plane');
        const rect = flightArea.getBoundingClientRect();
        
        // Center the plane initially
        plane.style.left = (rect.width / 2 - 30) + 'px';
        plane.style.top = (rect.height / 2 - 30) + 'px';
    }
    
    async connect() {
        try {
            if (!('serial' in navigator)) {
                throw new Error('Web Serial API not supported in this browser');
            }
            
            this.port = await navigator.serial.requestPort();
            await this.port.open({ 
                baudRate: 9600,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });
            
            this.isConnected = true;
            this.updateStatus('Connected');
            this.updateButtons();
            this.startReading();
            
        } catch (error) {
            this.updateStatus(`Connection failed: ${error.message}`);
            console.error('Connection error:', error);
        }
    }
    
    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            this.reader = null;
        }
        
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        
        this.isConnected = false;
        this.updateStatus('Disconnected');
        this.updateButtons();
    }
    
    async startReading() {
        const decoder = new TextDecoderStream();
        this.port.readable.pipeTo(decoder.writable);
        this.reader = decoder.readable.getReader();
        
        let buffer = '';
        
        try {
            while (this.isConnected) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                buffer += value;
                
                // Process complete JSON objects
                let braceCount = 0;
                let startIndex = -1;
                
                for (let i = 0; i < buffer.length; i++) {
                    if (buffer[i] === '{') {
                        if (braceCount === 0) startIndex = i;
                        braceCount++;
                    } else if (buffer[i] === '}') {
                        braceCount--;
                        if (braceCount === 0 && startIndex !== -1) {
                            const jsonStr = buffer.substring(startIndex, i + 1);
                            try {
                                const data = JSON.parse(jsonStr);
                                this.processSensorData(data);
                            } catch (e) {
                                console.warn('Invalid JSON:', jsonStr);
                            }
                            buffer = buffer.substring(i + 1);
                            break;
                        }
                    }
                }
                
                // Prevent buffer from growing too large
                if (buffer.length > 1000) {
                    buffer = buffer.substring(buffer.length - 500);
                }
            }
        } catch (error) {
            if (this.isConnected) {
                console.error('Reading error:', error);
                this.updateStatus(`Reading error: ${error.message}`);
            }
        }
    }
    
    processSensorData(data) {
        // Update sensor data
        Object.assign(this.sensorData, data);
        
        // Update display
        this.updateDataDisplay();
        
        // Update plane position
        this.updatePlanePosition();
        
        this.updateStatus('Connected - Receiving data');
    }
    
    updateDataDisplay() {
        // Update sensor values
        ['h1', 'v1', 'h2', 'v2'].forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                element.textContent = this.sensorData[key.toUpperCase()];
            }
        });
        
        // Update switch indicators
        const s1Element = document.getElementById('s1');
        const s2Element = document.getElementById('s2');
        
        if (s1Element) {
            s1Element.textContent = this.sensorData.S1 ? 'FIRE!' : 'READY';
            s1Element.className = 'switch-indicator ' + (this.sensorData.S1 ? 'switch-on' : 'switch-off');
        }
        
        if (s2Element) {
            s2Element.textContent = this.sensorData.S2 ? 'ACTIVE' : 'DOWN';
            s2Element.className = 'switch-indicator ' + (this.sensorData.S2 ? 'switch-on' : 'switch-off');
        }
        
        // Update flight mode based on switches
        this.updateFlightMode();
    }
    
    updateFlightMode() {
        const modeElement = document.getElementById('flightMode');
        let mode = 'Normal';
        let sensitivity = 1;
        
        // S2 activates shield
        this.isShieldActive = this.sensorData.S2;
        
        // Determine flight mode based on shield state
        if (this.isShieldActive) {
            mode = 'Shield Active';
            sensitivity = 0.7; // Slower movement when shield is up
        } else {
            mode = 'Combat Ready';
            sensitivity = 1;
        }
        
        modeElement.textContent = mode;
        this.currentSensitivity = sensitivity;
        
        // Handle S1 for firing (detect button press, not hold)
        if (this.sensorData.S1 && !this.lastS1State) {
            this.fireBullet();
        }
        this.lastS1State = this.sensorData.S1;
    }
    
    startGameLoop() {
        this.spawnTimer = 0;
        this.updateTimer = 0;
        setInterval(() => this.gameLoop(), 16); // ~60 FPS
    }
    
    gameLoop() {
        this.updateTimer++;
        this.spawnTimer++;
        
        // Spawn enemies every 120 frames (2 seconds at 60fps)
        if (this.spawnTimer >= 120) {
            this.spawnEnemy();
            this.spawnTimer = 0;
        }
        
        // Randomly spawn obstacles and powerups
        if (Math.random() < 0.01) {
            this.spawnObstacle();
        }
        if (Math.random() < 0.005) {
            this.spawnPowerup();
        }
        
        this.updateGameObjects();
        this.updateBullets();
        this.checkCollisions();
        this.updateHUD();
    }
    
    spawnEnemy() {
        const flightArea = document.getElementById('flightArea');
        const rect = flightArea.getBoundingClientRect();
        
        const enemy = document.createElement('div');
        enemy.className = 'enemy';
        enemy.innerHTML = `
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <polygon points="20,5 35,30 20,25 5,30" fill="#8B0000" stroke="#FF0000" stroke-width="2"/>
                <circle cx="20" cy="18" r="3" fill="#FF4444"/>
            </svg>
        `;
        
        enemy.style.left = Math.random() * (rect.width - 40) + 'px';
        enemy.style.top = '-40px';
        
        flightArea.appendChild(enemy);
        
        this.gameObjects.push({
            element: enemy,
            type: 'enemy',
            x: parseInt(enemy.style.left),
            y: -40,
            vx: (Math.random() - 0.5) * 2,
            vy: 1 + Math.random() * 2,
            health: 1
        });
        
        this.updateEnemyCount();
    }
    
    spawnObstacle() {
        const flightArea = document.getElementById('flightArea');
        const rect = flightArea.getBoundingClientRect();
        
        const obstacle = document.createElement('div');
        obstacle.className = 'obstacle';
        obstacle.style.left = Math.random() * (rect.width - 50) + 'px';
        obstacle.style.top = '-50px';
        
        flightArea.appendChild(obstacle);
        
        this.gameObjects.push({
            element: obstacle,
            type: 'obstacle',
            x: parseInt(obstacle.style.left),
            y: -50,
            vx: 0,
            vy: 2,
            health: 3
        });
    }
    
    spawnPowerup() {
        const flightArea = document.getElementById('flightArea');
        const rect = flightArea.getBoundingClientRect();
        
        const powerup = document.createElement('div');
        powerup.className = 'powerup';
        powerup.style.left = Math.random() * (rect.width - 30) + 'px';
        powerup.style.top = '-30px';
        
        flightArea.appendChild(powerup);
        
        this.gameObjects.push({
            element: powerup,
            type: 'powerup',
            x: parseInt(powerup.style.left),
            y: -30,
            vx: 0,
            vy: 1,
            health: 1
        });
    }
    
    fireBullet() {
        const currentTime = Date.now();
        if (currentTime - this.lastFireTime < this.fireRate) return;
        
        const plane = document.getElementById('plane');
        const flightArea = document.getElementById('flightArea');
        const planeRect = plane.getBoundingClientRect();
        const areaRect = flightArea.getBoundingClientRect();
        
        const bullet = document.createElement('div');
        bullet.className = 'bullet';
        
        const bulletX = (planeRect.left - areaRect.left) + planeRect.width / 2 - 3;
        const bulletY = (planeRect.top - areaRect.top) - 15;
        
        bullet.style.left = bulletX + 'px';
        bullet.style.top = bulletY + 'px';
        
        flightArea.appendChild(bullet);
        
        this.bullets.push({
            element: bullet,
            x: bulletX,
            y: bulletY,
            vy: -8
        });
        
        this.lastFireTime = currentTime;
        
        // Create muzzle flash effect
        this.createExplosion(bulletX, bulletY + 10, 0.3, '#FFD700');
    }
    
    updateGameObjects() {
        const flightArea = document.getElementById('flightArea');
        const rect = flightArea.getBoundingClientRect();
        
        this.gameObjects = this.gameObjects.filter(obj => {
            obj.x += obj.vx;
            obj.y += obj.vy;
            
            obj.element.style.left = obj.x + 'px';
            obj.element.style.top = obj.y + 'px';
            
            // Remove objects that are off screen
            if (obj.y > rect.height + 100 || obj.x < -100 || obj.x > rect.width + 100) {
                obj.element.remove();
                return false;
            }
            
            return true;
        });
    }
    
    updateBullets() {
        this.bullets = this.bullets.filter(bullet => {
            bullet.y += bullet.vy;
            bullet.element.style.top = bullet.y + 'px';
            
            // Remove bullets that are off screen
            if (bullet.y < -20) {
                bullet.element.remove();
                return false;
            }
            
            return true;
        });
    }
    
    checkCollisions() {
        const plane = document.getElementById('plane');
        const planeRect = plane.getBoundingClientRect();
        const flightArea = document.getElementById('flightArea');
        const areaRect = flightArea.getBoundingClientRect();
        
        const planeX = planeRect.left - areaRect.left;
        const planeY = planeRect.top - areaRect.top;
        
        // Check bullet collisions with objects
        this.bullets = this.bullets.filter(bullet => {
            let bulletHit = false;
            
            this.gameObjects = this.gameObjects.filter(obj => {
                if (this.isColliding(bullet.x, bullet.y, 6, 15, obj.x, obj.y, 40, 40)) {
                    if (obj.type === 'enemy' || obj.type === 'obstacle') {
                        obj.health--;
                        bulletHit = true;
                        
                        if (obj.health <= 0) {
                            // Destroy object
                            this.createExplosion(obj.x + 20, obj.y + 20);
                            this.addScore(obj.type === 'enemy' ? 100 : 50);
                            obj.element.remove();
                            return false;
                        }
                    }
                }
                return true;
            });
            
            if (bulletHit) {
                bullet.element.remove();
                return false;
            }
            return true;
        });
        
        // Check plane collisions with objects
        this.gameObjects = this.gameObjects.filter(obj => {
            if (this.isColliding(planeX, planeY, 60, 60, obj.x, obj.y, 40, 40)) {
                if (obj.type === 'powerup') {
                    // Collect powerup
                    this.addScore(200);
                    this.createExplosion(obj.x + 15, obj.y + 15, 0.7, '#FFD700');
                    if (this.lives < 3) this.lives++;
                    this.updateLifeDisplay();
                    obj.element.remove();
                    return false;
                } else if (obj.type === 'enemy' || obj.type === 'obstacle') {
                    if (!this.isShieldActive) {
                        // Take damage
                        this.takeDamage();
                        this.createExplosion(planeX + 30, planeY + 30);
                    } else {
                        // Shield absorbed hit
                        this.createExplosion(obj.x + 20, obj.y + 20, 0.8, '#00BFFF');
                        this.addScore(25);
                    }
                    obj.element.remove();
                    return false;
                }
            }
            return true;
        });
    }
    
    isColliding(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    }
    
    createExplosion(x, y, scale = 1, color = '#FF4500') {
        const flightArea = document.getElementById('flightArea');
        const explosion = document.createElement('div');
        explosion.className = 'explosion';
        explosion.style.left = (x - 40) + 'px';
        explosion.style.top = (y - 40) + 'px';
        explosion.style.transform = `scale(${scale})`;
        
        if (color !== '#FF4500') {
            explosion.style.background = `radial-gradient(circle, ${color} 0%, ${color}AA 30%, ${color}66 60%, transparent 100%)`;
        }
        
        flightArea.appendChild(explosion);
        
        setTimeout(() => {
            if (explosion.parentNode) {
                explosion.remove();
            }
        }, 500);
    }
    
    takeDamage() {
        this.lives--;
        this.updateLifeDisplay();
        
        if (this.lives <= 0) {
            this.gameOver();
        }
    }
    
    addScore(points) {
        this.score += points;
        
        // Create score popup
        const plane = document.getElementById('plane');
        const planeRect = plane.getBoundingClientRect();
        const flightArea = document.getElementById('flightArea');
        const areaRect = flightArea.getBoundingClientRect();
        
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = `+${points}`;
        popup.style.left = (planeRect.left - areaRect.left + 30) + 'px';
        popup.style.top = (planeRect.top - areaRect.top - 20) + 'px';
        
        flightArea.appendChild(popup);
        
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 1000);
    }
    
    updateLifeDisplay() {
        const hearts = document.querySelectorAll('.life-heart');
        hearts.forEach((heart, index) => {
            if (index < this.lives) {
                heart.classList.remove('lost');
            } else {
                heart.classList.add('lost');
            }
        });
    }
    
    updateHUD() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
    }
    
    updateEnemyCount() {
        const enemyCount = this.gameObjects.filter(obj => obj.type === 'enemy').length;
        document.getElementById('enemyCount').textContent = enemyCount;
    }
    
    gameOver() {
        alert(`Game Over! Final Score: ${this.score}`);
        // Reset game
        this.lives = 3;
        this.score = 0;
        this.level = 1;
        this.gameObjects.forEach(obj => obj.element.remove());
        this.bullets.forEach(bullet => bullet.element.remove());
        this.gameObjects = [];
        this.bullets = [];
        this.updateLifeDisplay();
    }
    
    updatePlanePosition() {
        const flightArea = document.getElementById('flightArea');
        const plane = document.getElementById('plane');
        const rect = flightArea.getBoundingClientRect();
        
        // Use sensor values directly (zero is center)
        let h1Delta = this.sensorData.H1;
        let v1Delta = this.sensorData.V1;
        let h2Delta = this.sensorData.H2;
        let v2Delta = this.sensorData.V2;
        
        // Base sensitivity (increased for better responsiveness)
        const baseSensitivity = 2.5;
        const secondarySensitivity = 1.5;
        
        // Apply mode-based sensitivity
        const sensitivity = baseSensitivity * (this.currentSensitivity || 1);
        const secSensitivity = secondarySensitivity * (this.currentSensitivity || 1);
        
        // Calculate position
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Primary movement from H1/V1
        let x = centerX + (h1Delta * sensitivity);
        let y = centerY - (v1Delta * sensitivity); // Invert Y for natural movement
        
        // Secondary adjustments from H2/V2
        x += (h2Delta * secSensitivity);
        y -= (v2Delta * secSensitivity);
        
        // Constrain to flight area bounds
        const planeSize = 60;
        x = Math.max(0, Math.min(rect.width - planeSize, x - planeSize/2));
        y = Math.max(0, Math.min(rect.height - planeSize, y - planeSize/2));
        
        // Apply position
        plane.style.left = x + 'px';
        plane.style.top = y + 'px';
        
        // Add rotation based on horizontal movement
        let rotation = (h1Delta + h2Delta) * 0.1; // Subtle banking effect
        plane.style.transform = `rotate(${rotation}deg)`;
        
        // Apply visual effects based on game state
        let filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))';
        
        if (this.isShieldActive) {
            // Shield active - blue glow
            filter += ' drop-shadow(0 0 15px rgba(0,150,255,0.8))';
        } else {
            // Combat ready - slight red glow
            filter += ' drop-shadow(0 0 8px rgba(255,100,100,0.4))';
        }
        
        // Add damage effect if low on lives
        if (this.lives === 1) {
            filter += ' drop-shadow(0 0 10px rgba(255,0,0,0.6))';
        }
        
        plane.style.filter = filter;
    }
    
    updateStatus(message) {
        document.getElementById('status').textContent = `Status: ${message}`;
    }
    
    updateButtons() {
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        connectBtn.disabled = this.isConnected;
        disconnectBtn.disabled = !this.isConnected;
    }
}

// Initialize the controller when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new SerialPlaneController();
});

// Check for Web Serial API support
if (!('serial' in navigator)) {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('status').innerHTML = 
            'Status: <span style="color: #f44336;">Web Serial API not supported. Please use Chrome/Edge 89+ with HTTPS.</span>';
    });
}