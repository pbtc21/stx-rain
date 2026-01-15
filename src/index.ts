import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

// Main visualization page
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STX Storm - Live Stacks Transactions</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a12;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    }
    canvas { display: block; }
    .stats {
      position: fixed;
      top: 20px;
      left: 20px;
      color: #fff;
      font-size: 14px;
      z-index: 100;
      background: rgba(0,0,0,0.8);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
    }
    .stats h1 {
      font-size: 24px;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #ffd93d, #fff, #ffd93d);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: flicker 0.5s ease-in-out infinite alternate;
    }
    @keyframes flicker {
      0% { opacity: 1; }
      100% { opacity: 0.8; }
    }
    .stats .stat { margin: 5px 0; color: #888; }
    .stats .stat span { color: #fff; font-weight: bold; }
    .legend {
      position: fixed;
      bottom: 20px;
      left: 20px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
      background: rgba(0,0,0,0.8);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
    }
    .legend-item { display: flex; align-items: center; margin: 5px 0; }
    .legend-icon { width: 20px; margin-right: 10px; text-align: center; }
    .latest {
      position: fixed;
      top: 20px;
      right: 20px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
      background: rgba(0,0,0,0.8);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      max-width: 320px;
      max-height: 280px;
      overflow: hidden;
    }
    .latest h3 { margin-bottom: 10px; color: #888; }
    .tx-item {
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      font-family: monospace;
      font-size: 11px;
    }
    .tx-item:last-child { border-bottom: none; }
    .flash {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: white;
      opacity: 0;
      pointer-events: none;
      z-index: 50;
    }
  </style>
</head>
<body>
  <div class="flash" id="flash"></div>

  <div class="stats">
    <h1>⛈️ STX STORM</h1>
    <div class="stat">Transactions: <span id="txCount">0</span></div>
    <div class="stat">Volume: <span id="volume">0</span> STX</div>
    <div class="stat">Block: <span id="block">...</span></div>
  </div>

  <div class="legend">
    <div class="legend-item"><span class="legend-icon">🌧️</span> Transfer (size = amount)</div>
    <div class="legend-item"><span class="legend-icon">⚡</span> Contract Deploy</div>
    <div class="legend-item"><span class="legend-icon">🌩️</span> Contract Call</div>
  </div>

  <div class="latest">
    <h3>Latest Activity</h3>
    <div id="txList"></div>
  </div>

  <canvas id="canvas"></canvas>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const flash = document.getElementById('flash');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    // Audio context for thunder
    let audioCtx = null;
    function initAudio() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
    }

    function playThunder(intensity = 0.3) {
      if (!audioCtx) return;
      const duration = 0.3 + Math.random() * 0.4;
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(80 + Math.random() * 40, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + duration);

      gainNode.gain.setValueAtTime(intensity, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    }

    // Raindrop class for transfers
    class Raindrop {
      constructor(tx) {
        this.tx = tx;
        this.x = Math.random() * width;
        this.y = -20;

        // Size based on amount (log scale, min 2, max 8)
        const amount = tx.amount || 1;
        const logAmount = Math.log10(amount + 1);
        this.length = Math.min(40, Math.max(8, logAmount * 6));
        this.width = Math.min(3, Math.max(1, logAmount * 0.4));

        this.speed = 8 + Math.random() * 8 + (this.length / 10);
        this.opacity = 0.4 + Math.random() * 0.4;
      }

      update() {
        this.y += this.speed;
        this.x += 1; // Slight wind
        return this.y < height + 50;
      }

      draw() {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.length * 0.2, this.y - this.length);
        ctx.strokeStyle = \`rgba(150, 180, 255, \${this.opacity})\`;
        ctx.lineWidth = this.width;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Lightning class for contract deploys
    class Lightning {
      constructor(x) {
        this.x = x || Math.random() * width;
        this.segments = this.generateBolt();
        this.life = 1;
        this.branches = [];

        // Generate branches
        for (let i = 0; i < 3; i++) {
          if (Math.random() > 0.4) {
            const startIdx = Math.floor(Math.random() * (this.segments.length - 2)) + 1;
            this.branches.push({
              start: this.segments[startIdx],
              segments: this.generateBranch(this.segments[startIdx])
            });
          }
        }
      }

      generateBolt() {
        const segments = [];
        let x = this.x;
        let y = 0;

        while (y < height) {
          segments.push({ x, y });
          y += 20 + Math.random() * 40;
          x += (Math.random() - 0.5) * 80;
        }
        segments.push({ x, y: height });
        return segments;
      }

      generateBranch(start) {
        const segments = [{ x: start.x, y: start.y }];
        let x = start.x;
        let y = start.y;
        const angle = (Math.random() - 0.5) * Math.PI * 0.5;
        const length = 50 + Math.random() * 100;

        for (let i = 0; i < 4; i++) {
          x += Math.cos(angle) * (length / 4) + (Math.random() - 0.5) * 20;
          y += Math.sin(angle) * (length / 4) + 20;
          segments.push({ x, y });
        }
        return segments;
      }

      update() {
        this.life -= 0.08;
        return this.life > 0;
      }

      draw() {
        const alpha = this.life;

        // Main bolt glow
        ctx.shadowBlur = 30;
        ctx.shadowColor = \`rgba(200, 220, 255, \${alpha})\`;

        // Draw main bolt
        ctx.beginPath();
        ctx.moveTo(this.segments[0].x, this.segments[0].y);
        for (let i = 1; i < this.segments.length; i++) {
          ctx.lineTo(this.segments[i].x, this.segments[i].y);
        }
        ctx.strokeStyle = \`rgba(255, 255, 255, \${alpha})\`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner bright core
        ctx.beginPath();
        ctx.moveTo(this.segments[0].x, this.segments[0].y);
        for (let i = 1; i < this.segments.length; i++) {
          ctx.lineTo(this.segments[i].x, this.segments[i].y);
        }
        ctx.strokeStyle = \`rgba(255, 255, 255, \${alpha})\`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw branches
        this.branches.forEach(branch => {
          ctx.beginPath();
          ctx.moveTo(branch.segments[0].x, branch.segments[0].y);
          for (let i = 1; i < branch.segments.length; i++) {
            ctx.lineTo(branch.segments[i].x, branch.segments[i].y);
          }
          ctx.strokeStyle = \`rgba(200, 220, 255, \${alpha * 0.6})\`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        ctx.shadowBlur = 0;
      }
    }

    // Thunder rumble effect for contract calls
    class Thunder {
      constructor() {
        this.life = 1;
        this.intensity = 0.1 + Math.random() * 0.15;
      }

      update() {
        this.life -= 0.02;
        return this.life > 0;
      }

      draw() {
        // Screen shake/flash effect
        if (this.life > 0.8) {
          const shake = (this.life - 0.8) * 50;
          ctx.save();
          ctx.translate(
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake
          );
        }

        // Dim purple flash for thunder
        const flashAlpha = this.life * this.intensity;
        ctx.fillStyle = \`rgba(100, 80, 150, \${flashAlpha})\`;
        ctx.fillRect(0, 0, width, height);

        if (this.life > 0.8) {
          ctx.restore();
        }
      }
    }

    // Splash for when rain hits bottom
    class Splash {
      constructor(x) {
        this.particles = [];
        for (let i = 0; i < 5; i++) {
          const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
          this.particles.push({
            x, y: height - 5,
            vx: Math.cos(angle) * (1 + Math.random() * 2),
            vy: Math.sin(angle) * (2 + Math.random() * 2),
            life: 1
          });
        }
      }

      update() {
        this.particles = this.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2;
          p.life -= 0.05;
          return p.life > 0;
        });
        return this.particles.length > 0;
      }

      draw() {
        this.particles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5 * p.life, 0, Math.PI * 2);
          ctx.fillStyle = \`rgba(150, 180, 255, \${p.life * 0.5})\`;
          ctx.fill();
        });
      }
    }

    let raindrops = [];
    let lightnings = [];
    let thunders = [];
    let splashes = [];
    let seenTxs = new Set();
    let totalTxs = 0;
    let totalVolume = 0;
    let latestTxs = [];

    // Screen flash for lightning
    function screenFlash() {
      flash.style.transition = 'none';
      flash.style.opacity = '0.8';
      setTimeout(() => {
        flash.style.transition = 'opacity 0.3s';
        flash.style.opacity = '0';
      }, 50);
    }

    // Fetch transactions
    async function fetchTransactions() {
      try {
        const res = await fetch('/api/transactions');
        const data = await res.json();

        if (data.block) {
          document.getElementById('block').textContent = '#' + data.block;
        }

        data.transactions.forEach(tx => {
          if (!seenTxs.has(tx.tx_id)) {
            seenTxs.add(tx.tx_id);
            totalTxs++;
            totalVolume += (tx.amount || 0) / 1000000;

            // Different effects based on type
            if (tx.type === 'smart_contract') {
              // CONTRACT DEPLOY = LIGHTNING
              lightnings.push(new Lightning());
              screenFlash();
              initAudio();
              setTimeout(() => playThunder(0.5), 100 + Math.random() * 300);
            } else if (tx.type === 'contract_call') {
              // CONTRACT CALL = THUNDER
              thunders.push(new Thunder());
              initAudio();
              playThunder(0.2);
            } else {
              // TRANSFER = RAIN
              raindrops.push(new Raindrop(tx));
            }

            latestTxs.unshift(tx);
            if (latestTxs.length > 6) latestTxs.pop();
            updateLatestList();
          }
        });

        document.getElementById('txCount').textContent = totalTxs.toLocaleString();
        document.getElementById('volume').textContent = totalVolume.toFixed(2);

      } catch (e) {
        console.error('Fetch error:', e);
      }
    }

    function updateLatestList() {
      const list = document.getElementById('txList');
      list.innerHTML = latestTxs.map(tx => {
        const amount = ((tx.amount || 0) / 1000000).toFixed(4);
        let icon = '🌧️';
        let color = '#96b4ff';
        if (tx.type === 'smart_contract') {
          icon = '⚡';
          color = '#ffd93d';
        } else if (tx.type === 'contract_call') {
          icon = '🌩️';
          color = '#b8a0d0';
        }
        return \`<div class="tx-item">
          <span style="margin-right: 6px;">\${icon}</span>
          <span style="color: \${color}">\${amount} STX</span>
          <span style="color: #666; margin-left: 8px;">\${tx.tx_id.slice(0, 12)}...</span>
        </div>\`;
      }).join('');
    }

    // Animation loop
    function animate() {
      // Dark sky background with slight gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(8, 8, 15, 0.3)');
      gradient.addColorStop(1, 'rgba(10, 10, 18, 0.3)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw and update thunder effects (background)
      thunders = thunders.filter(t => {
        t.draw();
        return t.update();
      });

      // Draw and update raindrops
      raindrops = raindrops.filter(drop => {
        drop.draw();
        const alive = drop.update();
        if (!alive) {
          splashes.push(new Splash(drop.x));
        }
        return alive;
      });

      // Draw and update splashes
      splashes = splashes.filter(s => {
        s.draw();
        return s.update();
      });

      // Draw and update lightning (foreground)
      lightnings = lightnings.filter(l => {
        l.draw();
        return l.update();
      });

      requestAnimationFrame(animate);
    }

    // Ambient rain - always have some drops falling
    function ambientRain() {
      if (raindrops.length < 100) {
        for (let i = 0; i < 3; i++) {
          raindrops.push(new Raindrop({ amount: Math.random() * 100 }));
        }
      }
    }

    // Start
    fetchTransactions();
    setInterval(fetchTransactions, 3000);
    setInterval(ambientRain, 100);
    animate();

    // Cleanup
    setInterval(() => {
      if (seenTxs.size > 1000) {
        seenTxs = new Set(Array.from(seenTxs).slice(-500));
      }
    }, 60000);

    // Init audio on first interaction
    document.addEventListener('click', initAudio, { once: true });
  </script>
</body>
</html>`;
  return c.html(html);
});

// API endpoint for transactions
app.get('/api/transactions', async (c) => {
  try {
    const res = await fetch('https://api.hiro.so/extended/v1/tx?limit=20&unanchored=true');

    if (!res.ok) {
      return c.json({ transactions: [], error: 'API error' });
    }

    const data = await res.json() as any;

    const blockRes = await fetch('https://api.hiro.so/extended/v1/block?limit=1');
    const blockData = blockRes.ok ? await blockRes.json() as any : { results: [] };
    const latestBlock = blockData.results?.[0]?.height || null;

    const transactions = (data.results || []).map((tx: any) => {
      let amount = 0;

      if (tx.tx_type === 'token_transfer') {
        amount = parseInt(tx.token_transfer?.amount || '0');
      } else if (tx.tx_type === 'contract_call') {
        amount = parseInt(tx.stx_sent || '0');
      }

      return {
        tx_id: tx.tx_id,
        type: tx.tx_type,
        amount,
        sender: tx.sender_address,
        block: tx.block_height,
        status: tx.tx_status
      };
    });

    return c.json({
      transactions,
      block: latestBlock,
      count: transactions.length
    });

  } catch (error) {
    console.error('API error:', error);
    return c.json({ transactions: [], error: 'Failed to fetch' });
  }
});

app.get('/health', (c) => c.json({ status: 'storming', timestamp: new Date().toISOString() }));

export default app;
