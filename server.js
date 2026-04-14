require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ── INIT ──
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── HELPERS ──
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ── ADMIN AUTH MIDDLEWARE ──
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send('Unauthorized');
  }
  next();
}

// ── POST /api/submit ──
app.post('/api/submit', async (req, res) => {
  try {
    const { email, coin, network, walletAddress, amount, image } = req.body;

    if (!email || !coin || !network || !walletAddress || !image) {
      return res.status(400).json({ error: 'Missing required fields: email, coin, network, walletAddress, image' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!['USDT', 'USDC'].includes(coin)) {
      return res.status(400).json({ error: 'Invalid coin. Must be USDT or USDC' });
    }
    if (!['Ethereum', 'Solana'].includes(network)) {
      return res.status(400).json({ error: 'Invalid network. Must be Ethereum or Solana' });
    }
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    // Save image file
    const id = generateId();
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const ext = image.match(/^data:image\/(\w+);/)?.[1] || 'jpg';
    const filename = `${id}.${ext}`;
    const imagePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(imagePath, Buffer.from(base64Data, 'base64'));

    // Save record
    const record = {
      id,
      email,
      coin,
      network,
      amount: amount || '',
      walletAddress,
      imagePath: `/uploads/${filename}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const data = readData();
    data.unshift(record); // newest first
    writeData(data);

    console.log(`[SUBMIT] New submission: ${id} | ${email} | ${coin} on ${network}`);

    // Telegram notification
    try {
      const tgMessage = `🔔 *New CashToCrypto Submission!*\n\n📧 *Email:* ${email}\n🪙 *Coin:* ${coin}\n🌐 *Network:* ${network}\n💰 *Amount:* $${amount || 'N/A'}\n👛 *Wallet:* \`${walletAddress}\`\n\n👉 [Review in Admin Panel](https://patient-passion-production-3624.up.railway.app/admin)`;
      await fetch(`https://api.telegram.org/bot8729703760:AAHP3n5vkUUATVwxdDMez70ujVVvvvUN59M/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: '8189413900',
          text: tgMessage,
          parse_mode: 'Markdown'
        })
      });
    } catch (tgErr) {
      console.error('[TELEGRAM NOTIFY ERROR]', tgErr);
    }

    // Notify admin via email
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@cashtocrypto.online',
        to: 'Kkdabby76@gmail.com',
        subject: '🔔 New Verification Submission — CashToCrypto',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#080b12;color:#e2eaff;font-family:'Courier New',monospace;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080b12;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d1120;border:1px solid rgba(99,179,255,0.15);border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#0e7490);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:1.5rem;color:#fff;letter-spacing:-0.02em;">CashToCrypto Admin</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:0.85rem;">New Verification Submission</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="color:#fbbf24;font-size:1.1rem;margin:0 0 20px;">🔔 New submission received!</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#6b7a99;font-size:0.8rem;width:40%;">Email</td><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#e2eaff;font-size:0.8rem;">${email}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#6b7a99;font-size:0.8rem;">Coin</td><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#e2eaff;font-size:0.8rem;">${coin}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#6b7a99;font-size:0.8rem;">Network</td><td style="padding:10px 0;border-bottom:1px solid rgba(99,179,255,0.1);color:#e2eaff;font-size:0.8rem;">${network}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7a99;font-size:0.8rem;">Wallet</td><td style="padding:10px 0;color:#e2eaff;font-size:0.8rem;word-break:break-all;">${walletAddress}</td></tr>
            </table>
            <div style="text-align:center;margin:32px 0 0;">
              <a href="https://patient-passion-production-3624.up.railway.app/admin" style="background:linear-gradient(135deg,#2563eb,#0891b2);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:1rem;display:inline-block;">Review in Admin Panel →</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(99,179,255,0.1);padding:20px 40px;text-align:center;">
            <p style="color:#6b7a99;font-size:0.72rem;margin:0;">© 2024 CashToCrypto</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      });
    } catch (emailErr) {
      console.error('[ADMIN NOTIFY ERROR]', emailErr);
    }

    return res.status(201).json({ success: true, id });

  } catch (err) {
    console.error('[SUBMIT ERROR]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /admin ──
app.get('/admin', (req, res) => {
  const password = req.query.password;

  if (!password) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin Login — CashToCrypto</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080b12;color:#e2eaff;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .box{background:#0d1120;border:1px solid rgba(99,179,255,0.15);border-radius:16px;padding:40px;width:100%;max-width:360px;text-align:center;}
  h2{font-size:1.3rem;margin-bottom:8px;background:linear-gradient(135deg,#60a5fa,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  p{color:#6b7a99;font-size:0.8rem;margin-bottom:28px;}
  input{width:100%;background:#131929;border:1px solid rgba(99,179,255,0.15);border-radius:8px;padding:12px 16px;color:#e2eaff;font-family:'Courier New',monospace;font-size:0.9rem;outline:none;margin-bottom:16px;}
  input:focus{border-color:rgba(59,130,246,0.5);}
  button{width:100%;background:linear-gradient(135deg,#2563eb,#0891b2);border:none;border-radius:8px;padding:12px;color:#fff;font-family:'Courier New',monospace;font-size:0.9rem;cursor:pointer;}
  button:hover{opacity:0.9;}
</style>
</head>
<body>
<div class="box">
  <h2>CashToCrypto Admin</h2>
  <p>Enter your admin password to continue</p>
  <input type="password" id="pw" placeholder="Admin password" onkeydown="if(event.key==='Enter')login()"/>
  <button onclick="login()">Login →</button>
</div>
<script>
  function login(){
    const pw=document.getElementById('pw').value;
    if(!pw){return;}
    window.location.href='/admin?password='+encodeURIComponent(pw);
  }
</script>
</body>
</html>`);
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send(`<!DOCTYPE html><html><head><title>Unauthorized</title></head><body style="background:#080b12;color:#f87171;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;font-size:1.2rem;">❌ Incorrect password. <a href="/admin" style="color:#60a5fa;margin-left:8px;">Try again</a></body></html>`);
  }

  const data = readData();
  const pending = data.filter(r => r.status === 'pending').length;
  const approved = data.filter(r => r.status === 'approved').length;
  const rejected = data.filter(r => r.status === 'rejected').length;

  const rows = data.map(r => {
    const date = new Date(r.createdAt).toLocaleString();
    const statusBadge = {
      pending: `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);padding:3px 10px;border-radius:20px;font-size:0.7rem;">⏳ Pending</span>`,
      approved: `<span style="background:rgba(52,211,153,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3);padding:3px 10px;border-radius:20px;font-size:0.7rem;">✓ Approved</span>`,
      rejected: `<span style="background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3);padding:3px 10px;border-radius:20px;font-size:0.7rem;">✗ Rejected</span>`
    }[r.status] || r.status;

    const actions = r.status === 'pending' ? `
      <button onclick="action('approve','${r.id}')" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;padding:6px 14px;border-radius:7px;cursor:pointer;font-size:0.78rem;margin-right:6px;" onmouseover="this.style.background='rgba(52,211,153,0.2)'" onmouseout="this.style.background='rgba(52,211,153,0.1)'">✓ Approve</button>
      <button onclick="action('reject','${r.id}')" style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;padding:6px 14px;border-radius:7px;cursor:pointer;font-size:0.78rem;" onmouseover="this.style.background='rgba(248,113,113,0.2)'" onmouseout="this.style.background='rgba(248,113,113,0.1)'">✗ Reject</button>
    ` : '—';

    return `
    <tr>
      <td style="padding:14px 12px;">
        <img src="${r.imagePath}" alt="selfie" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid rgba(99,179,255,0.15);display:block;"/>
      </td>
      <td style="padding:14px 12px;font-size:0.82rem;">${r.email}</td>
      <td style="padding:14px 12px;">
        <span style="background:${r.coin==='USDT'?'rgba(38,161,123,0.1)':'rgba(39,117,202,0.1)'};color:${r.coin==='USDT'?'#4ade80':'#60a5fa'};border:1px solid ${r.coin==='USDT'?'rgba(38,161,123,0.3)':'rgba(39,117,202,0.3)'};padding:3px 10px;border-radius:20px;font-size:0.75rem;">${r.coin}</span>
      </td>
      <td style="padding:14px 12px;font-size:0.82rem;color:#93c5fd;">${r.network}</td>
      <td style="padding:14px 12px;font-size:0.72rem;color:#e2eaff;max-width:160px;word-break:break-all;">${r.walletAddress || '—'}</td>
      <td style="padding:14px 12px;">${statusBadge}</td>
      <td style="padding:14px 12px;font-size:0.75rem;color:#6b7a99;">${date}</td>
      <td style="padding:14px 12px;">${actions}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin Dashboard — CashToCrypto</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080b12;color:#e2eaff;font-family:'Courier New',monospace;min-height:100vh;}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(59,130,246,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;}
  .top{background:rgba(13,17,32,0.95);border-bottom:1px solid rgba(99,179,255,0.12);padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;backdrop-filter:blur(10px);}
  .logo{font-size:1.1rem;font-weight:700;background:linear-gradient(135deg,#60a5fa,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .content{max-width:1200px;margin:0 auto;padding:32px 24px;}
  h1{font-size:1.4rem;font-weight:700;margin-bottom:4px;background:linear-gradient(135deg,#60a5fa,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .subtitle{color:#6b7a99;font-size:0.8rem;margin-bottom:28px;}
  .stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px;}
  .stat{background:#0d1120;border:1px solid rgba(99,179,255,0.12);border-radius:12px;padding:20px 28px;min-width:130px;}
  .stat-val{font-size:2rem;font-weight:700;}
  .stat-val.p{color:#fbbf24;} .stat-val.a{color:#34d399;} .stat-val.r{color:#f87171;} .stat-val.t{color:#60a5fa;}
  .stat-label{font-size:0.7rem;color:#6b7a99;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;}
  .table-wrap{background:#0d1120;border:1px solid rgba(99,179,255,0.12);border-radius:16px;overflow:auto;}
  table{width:100%;border-collapse:collapse;}
  th{padding:12px 12px;text-align:left;font-size:0.7rem;color:#6b7a99;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(99,179,255,0.08);}
  tr:not(:last-child) td{border-bottom:1px solid rgba(99,179,255,0.06);}
  tr:hover td{background:rgba(59,130,246,0.03);}
  .empty{text-align:center;padding:60px;color:#6b7a99;font-size:0.85rem;}
  #toast{position:fixed;bottom:24px;right:24px;background:#131929;border:1px solid rgba(99,179,255,0.2);border-radius:10px;padding:12px 20px;font-size:0.82rem;transform:translateY(80px);opacity:0;transition:all 0.3s;z-index:99;}
  #toast.show{transform:translateY(0);opacity:1;}
  #toast.ok{border-color:rgba(52,211,153,0.4);color:#34d399;}
  #toast.err{border-color:rgba(248,113,113,0.4);color:#f87171;}
</style>
</head>
<body>
<div class="top">
  <div class="logo">CashToCrypto Admin</div>
  <span style="font-size:0.75rem;color:#6b7a99;">${data.length} total submissions</span>
</div>
<div class="content">
  <h1>Verification Dashboard</h1>
  <div class="subtitle">Review selfie submissions and approve or reject access.</div>

  <div class="stats">
    <div class="stat"><div class="stat-val t">${data.length}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-val p">${pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat"><div class="stat-val a">${approved}</div><div class="stat-label">Approved</div></div>
    <div class="stat"><div class="stat-val r">${rejected}</div><div class="stat-label">Rejected</div></div>
  </div>

  <div class="table-wrap">
    ${data.length === 0 ? '<div class="empty">No submissions yet.</div>' : `
    <table>
      <thead>
        <tr>
          <th>Selfie</th>
          <th>Email</th>
          <th>Coin</th>
          <th>Network</th>
          <th>Wallet Address</th>
          <th>Status</th>
          <th>Submitted</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`}
  </div>
</div>

<div id="toast"></div>

<script>
  const PW = '${password.replace(/'/g, "\\'")}';

  function toast(msg, type){
    const el=document.getElementById('toast');
    el.textContent=msg; el.className='show '+(type||'ok');
    setTimeout(()=>el.className='',3000);
  }

  async function action(type, id){
    const confirm_msg = type==='approve' ? 'Approve this submission?' : 'Reject this submission?';
    if(!confirm(confirm_msg)) return;
    try{
      const res = await fetch('/api/admin/'+type+'/'+id, {
        method:'POST',
        headers:{'x-admin-password':PW}
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||'Failed');
      toast(type==='approve' ? '✓ Approved — payment email sent' : '✗ Rejected — notification sent');
      setTimeout(()=>location.reload(), 1200);
    }catch(err){
      toast('Error: '+err.message,'err');
    }
  }
</script>
</body>
</html>`);
});

// ── POST /api/admin/approve/:id ──
app.post('/api/admin/approve/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const data = readData();
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    if (data[idx].status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    data[idx].status = 'approved';
    data[idx].approvedAt = new Date().toISOString();
    writeData(data);

    const record = data[idx];
    const stripeLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/your_payment_link';

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
      to: record.email,
      subject: 'Your CashToCrypto Verification is Approved ✓',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#080b12;color:#e2eaff;font-family:'Courier New',monospace;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080b12;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d1120;border:1px solid rgba(99,179,255,0.15);border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#0e7490);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:1.5rem;color:#fff;letter-spacing:-0.02em;">CashToCrypto</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:0.85rem;">Verification Approved</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="color:#34d399;font-size:1.1rem;margin:0 0 20px;">✓ Verification Approved!</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 16px;">Hello,</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 24px;">Your identity verification has been approved. You can now proceed to complete your purchase of <strong style="color:#60a5fa;">${record.coin}</strong> on the <strong style="color:#60a5fa;">${record.network}</strong> network.</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 32px;">Click the button below to complete your payment securely via Stripe:</p>
            <div style="text-align:center;margin:0 0 32px;">
              <a href="${stripeLink}" style="background:linear-gradient(135deg,#2563eb,#0891b2);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:1rem;display:inline-block;">Complete Purchase →</a>
            </div>
            <p style="color:#6b7a99;font-size:0.78rem;line-height:1.7;margin:0;">If the button doesn't work, copy this link: <br/><span style="color:#60a5fa;">${stripeLink}</span></p>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(99,179,255,0.1);padding:20px 40px;text-align:center;">
            <p style="color:#6b7a99;font-size:0.72rem;margin:0;">© 2024 CashToCrypto. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    console.log(`[APPROVE] ${id} approved, email sent to ${record.email}`);
    return res.json({ success: true });

  } catch (err) {
    console.error('[APPROVE ERROR]', err);
    return res.status(500).json({ error: 'Failed to approve: ' + err.message });
  }
});

// ── POST /api/admin/reject/:id ──
app.post('/api/admin/reject/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const data = readData();
    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    if (data[idx].status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    data[idx].status = 'rejected';
    data[idx].rejectedAt = new Date().toISOString();
    writeData(data);

    const record = data[idx];

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
      to: record.email,
      subject: 'CashToCrypto Verification Update',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#080b12;color:#e2eaff;font-family:'Courier New',monospace;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080b12;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d1120;border:1px solid rgba(99,179,255,0.15);border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#0e7490);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:1.5rem;color:#fff;letter-spacing:-0.02em;">CashToCrypto</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:0.85rem;">Verification Status</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="color:#f87171;font-size:1.1rem;margin:0 0 20px;">✗ Verification Not Approved</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 16px;">Hello,</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 24px;">We're sorry, but your identity verification was not approved at this time.</p>
            <p style="color:#e2eaff;line-height:1.8;margin:0 0 24px;">This may be due to image quality or verification requirements not being met. You are welcome to submit a new application with a clearer selfie.</p>
            <p style="color:#6b7a99;font-size:0.82rem;line-height:1.7;margin:0;">If you believe this was an error, please contact our support team.</p>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(99,179,255,0.1);padding:20px 40px;text-align:center;">
            <p style="color:#6b7a99;font-size:0.72rem;margin:0;">© 2024 CashToCrypto. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    console.log(`[REJECT] ${id} rejected, email sent to ${record.email}`);
    return res.json({ success: true });

  } catch (err) {
    console.error('[REJECT ERROR]', err);
    return res.status(500).json({ error: 'Failed to reject: ' + err.message });
  }
});

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── START ──
app.listen(PORT, () => {
  console.log(`\n🚀 CashToCrypto backend running on port ${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});
