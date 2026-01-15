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
  <title>STX Rain - Live Stacks Transactions</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    }
    canvas {
      display: block;
    }
    .stats {
      position: fixed;
      top: 20px;
      left: 20px;
      color: #fff;
      font-size: 14px;
      z-index: 100;
      background: rgba(0,0,0,0.7);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stats h1 {
      font-size: 24px;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #5546ff, #00d4ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stats .stat {
      margin: 5px 0;
      color: #888;
    }
    .stats .stat span {
      color: #fff;
      font-weight: bold;
    }
    .legend {
      position: fixed;
      bottom: 20px;
      left: 20px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
      background: rgba(0,0,0,0.7);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 10px;
    }
    .latest {
      position: fixed;
      top: 20px;
      right: 20px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
      background: rgba(0,0,0,0.7);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      max-width: 350px;
      max-height: 300px;
      overflow: hidden;
    }
    .latest h3 {
      margin-bottom: 10px;
      color: #888;
    }
    .tx-item {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      font-family: monospace;
    }
    .tx-item:last-child {
      border-bottom: none;
    }
    .tx-amount {
      font-weight: bold;
    }
    .tx-type {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="stats">
    <h1>⚡ STX RAIN</h1>
    <div class="stat">Transactions: <span id="txCount">0</span></div>
    <div class="stat">Total Volume: <span id="volume">0</span> STX</div>
    <div class="stat">Latest Block: <span id="block">...</span></div>
  </div>

  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background: #5546ff;"></div> STX Transfer</div>
    <div class="legend-item"><div class="legend-dot" style="background: #00d4ff;"></div> Contract Call</div>
    <div class="legend-item"><div class="legend-dot" style="background: #ff6b6b;"></div> Token Transfer</div>
    <div class="legend-item"><div class="legend-dot" style="background: #ffd93d;"></div> Contract Deploy</div>
  </div>

  <div class="latest">
    <h3>Latest Transactions</h3>
    <div id="txList"></div>
  </div>

  <canvas id="canvas"></canvas>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    // Raindrop class
    class Drop {
      constructor(tx) {
        this.tx = tx;
        this.x = Math.random() * width;
        this.y = -50;
        this.speed = 2 + Math.random() * 3;

        // Size based on STX amount (log scale)
        const amount = tx.amount || 1;
        this.size = Math.min(50, Math.max(4, Math.log10(amount + 1) * 8));

        // Color based on type
        this.color = this.getColor(tx.type);

        // Trail effect
        this.trail = [];
        this.maxTrail = 15;

        // Glow intensity
        this.glow = Math.min(30, this.size);
      }

      getColor(type) {
        switch(type) {
          case 'token_transfer': return '#5546ff';
          case 'contract_call': return '#00d4ff';
          case 'smart_contract': return '#ffd93d';
          case 'coinbase': return '#00ff88';
          default: return '#5546ff';
        }
      }

      update() {
        // Add current position to trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrail) {
          this.trail.shift();
        }

        this.y += this.speed;

        // Slight horizontal drift
        this.x += (Math.random() - 0.5) * 0.5;

        return this.y < height + 100;
      }

      draw() {
        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
          const t = this.trail[i];
          const alpha = (i / this.trail.length) * 0.3;
          const size = (i / this.trail.length) * this.size * 0.5;

          ctx.beginPath();
          ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
          ctx.fillStyle = this.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Draw glow
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.size * 2
        );
        gradient.addColorStop(0, this.color + '80');
        gradient.addColorStop(1, this.color + '00');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw main drop
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      }
    }

    // Particle system for splash effect
    class Splash {
      constructor(x, y, color) {
        this.particles = [];
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          this.particles.push({
            x, y,
            vx: Math.cos(angle) * (2 + Math.random() * 2),
            vy: Math.sin(angle) * (2 + Math.random() * 2) - 2,
            life: 1,
            color
          });
        }
      }

      update() {
        this.particles = this.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1; // gravity
          p.life -= 0.03;
          return p.life > 0;
        });
        return this.particles.length > 0;
      }

      draw() {
        this.particles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
          ctx.fillStyle = p.color + Math.floor(p.life * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });
      }
    }

    let drops = [];
    let splashes = [];
    let seenTxs = new Set();
    let totalTxs = 0;
    let totalVolume = 0;
    let latestTxs = [];

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
            drops.push(new Drop(tx));
            totalTxs++;
            totalVolume += (tx.amount || 0) / 1000000;

            // Add to latest list
            latestTxs.unshift(tx);
            if (latestTxs.length > 5) latestTxs.pop();
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
        const amount = ((tx.amount || 0) / 1000000).toFixed(2);
        const typeColor = tx.type === 'token_transfer' ? '#5546ff' :
                         tx.type === 'contract_call' ? '#00d4ff' :
                         tx.type === 'smart_contract' ? '#ffd93d' : '#888';
        return \`<div class="tx-item">
          <span class="tx-amount" style="color: \${typeColor}">\${amount} STX</span>
          <span class="tx-type" style="background: \${typeColor}22; color: \${typeColor}">\${tx.type}</span>
          <div style="color: #666; font-size: 10px; margin-top: 4px;">\${tx.tx_id.slice(0, 20)}...</div>
        </div>\`;
      }).join('');
    }

    // Animation loop
    function animate() {
      // Semi-transparent background for trail effect
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, width, height);

      // Update and draw drops
      drops = drops.filter(drop => {
        const alive = drop.update();
        if (!alive && drop.y >= height - 50) {
          splashes.push(new Splash(drop.x, height - 20, drop.color));
        }
        drop.draw();
        return alive;
      });

      // Update and draw splashes
      splashes = splashes.filter(splash => {
        const alive = splash.update();
        splash.draw();
        return alive;
      });

      requestAnimationFrame(animate);
    }

    // Start
    fetchTransactions();
    setInterval(fetchTransactions, 3000);
    animate();

    // Keep seen txs from growing too large
    setInterval(() => {
      if (seenTxs.size > 1000) {
        const arr = Array.from(seenTxs);
        seenTxs = new Set(arr.slice(-500));
      }
    }, 60000);
  </script>
</body>
</html>`;
  return c.html(html);
});

// API endpoint for transactions
app.get('/api/transactions', async (c) => {
  try {
    // Fetch recent transactions from Hiro API
    const res = await fetch('https://api.hiro.so/extended/v1/tx?limit=20&unanchored=true');

    if (!res.ok) {
      return c.json({ transactions: [], error: 'API error' });
    }

    const data = await res.json() as any;

    // Get latest block
    const blockRes = await fetch('https://api.hiro.so/extended/v1/block?limit=1');
    const blockData = blockRes.ok ? await blockRes.json() as any : { results: [] };
    const latestBlock = blockData.results?.[0]?.height || null;

    // Transform transactions
    const transactions = (data.results || []).map((tx: any) => {
      let amount = 0;
      let type = tx.tx_type;

      // Extract amount based on transaction type
      if (tx.tx_type === 'token_transfer') {
        amount = parseInt(tx.token_transfer?.amount || '0');
      } else if (tx.tx_type === 'contract_call') {
        // Try to get amount from STX transfers in events
        amount = parseInt(tx.stx_sent || '0');
      } else if (tx.tx_type === 'coinbase') {
        amount = parseInt(tx.coinbase_payload?.data || '0');
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

// Health check
app.get('/health', (c) => c.json({ status: 'raining', timestamp: new Date().toISOString() }));

export default app;
