const SUPABASE_URL = 'https://cjkpcvvoqbkruzmexmam.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqa3BjdnZvcWJrcnV6bWV4bWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTAxMzcsImV4cCI6MjA4OTQ2NjEzN30.Unk_5PWrvTvwdPMMpAhFBXce8EunIqdUB7sFYaLb0xg';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Condition ranking for matching
const CONDITION_RANK = { turnkey: 1, cosmetic: 2, medium_rehab: 3, full_gut: 4 };

// Helper: format money
function fmt(n) {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString();
}

// Helper: format date nicely
function fmtDate(d) {
    if (!d) return '—';
    return d;
}

// Helper: badge HTML
function badge(text, color) {
    const colors = {
        green: 'badge-green', yellow: 'badge-yellow', red: 'badge-red',
        blue: 'badge-blue', gray: 'badge-gray', orange: 'badge-orange'
    };
    return `<span class="badge ${colors[color] || 'badge-gray'}">${String(text ?? '').replace(/_/g, ' ')}</span>`;
}

// Helper: status badge color
function buyerStatusColor(s) {
    if (['verified_active', 'engaged'].includes(s)) return 'green';
    if (['contacted', 'criteria_collected'].includes(s)) return 'yellow';
    if (s === 'new_high_priority') return 'green';
    if (s === 'new_probably_not') return 'red';
    if (s === 'not_investor') return 'orange';
    if (s === 'inactive') return 'gray';
    return 'blue';
}

function propStatusColor(s) {
    if (['under_contract', 'closed'].includes(s)) return 'green';
    if (s === 'offer_submitted') return 'yellow';
    if (s === 'dead') return 'red';
    return 'blue';
}

// Helper: portfolio tier badge color (higher = more properties = hotter lead)
function tierColor(tier) {
    if (!tier) return 'gray';
    const first = parseInt(tier);
    if (first >= 20) return 'red';
    if (first >= 11) return 'orange';
    if (first >= 6) return 'yellow';
    return 'blue';
}

// Helper: get today as YYYY-MM-DD
function today() {
    return new Date().toISOString().slice(0, 10);
}

// Helper: show flash message
function flash(msg, type = 'success') {
    const div = document.createElement('div');
    div.className = `flash flash-${type}`;
    div.textContent = msg;
    const container = document.querySelector('.container');
    container.insertBefore(div, container.firstChild);
    setTimeout(() => div.remove(), 4000);
}

// Helper: CSV export
function exportCSV(data, filename) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(','), ...data.map(r => keys.map(k => {
        let v = r[k] == null ? '' : String(r[k]);
        if (v.includes(',') || v.includes('"') || v.includes('\n')) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// Matching logic
function getMatchingBuyers(property, buyers) {
    const propCondition = CONDITION_RANK[property.condition_estimate] || 99;
    const matches = [];

    for (const b of buyers) {
        if (['inactive', 'not_investor', 'new_probably_not'].includes(b.status)) continue;
        // Skip buyers with incomplete criteria (e.g. unvetted imports)
        if (!b.zip_codes || !b.property_types || !b.condition_tolerance) continue;

        const buyerZips = b.zip_codes.split(',').map(z => z.trim()).filter(Boolean);
        if (!buyerZips.includes(property.zip_code)) continue;

        const lp = property.list_price || 0;
        const mao = property.mao || lp;
        const checkPrice = Math.min(lp, mao || lp);
        const minP = b.min_price || 0;
        const maxP = b.max_price || 999999999;
        if (checkPrice < minP || checkPrice > maxP) {
            if (lp < minP || lp > maxP) continue;
        }

        const buyerTypes = (b.property_types || '').split(',').map(t => t.trim()).filter(Boolean);
        if (!buyerTypes.includes(property.property_type)) continue;

        const buyerTol = CONDITION_RANK[b.condition_tolerance] || 99;
        if (propCondition > buyerTol) continue;

        matches.push(b);
    }

    const statusOrder = { verified_active: 0, engaged: 1, criteria_collected: 2, contacted: 3, new_high_priority: 4, new: 5 };
    matches.sort((a, b) => (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5));
    return matches;
}

function getMatchingProperties(buyer, properties) {
    // Skip matching if buyer criteria are incomplete
    if (!buyer.zip_codes || !buyer.property_types || !buyer.condition_tolerance) return [];

    const buyerZips = buyer.zip_codes.split(',').map(z => z.trim()).filter(Boolean);
    const buyerTypes = buyer.property_types.split(',').map(t => t.trim()).filter(Boolean);
    const buyerTol = CONDITION_RANK[buyer.condition_tolerance] || 99;
    const matches = [];

    for (const p of properties) {
        if (['closed', 'dead'].includes(p.status)) continue;
        if (!buyerZips.includes(p.zip_code)) continue;

        const lp = p.list_price || 0;
        const mao = p.mao || lp;
        const checkPrice = Math.min(lp, mao || lp);
        const minP = buyer.min_price || 0;
        const maxP = buyer.max_price || 999999999;
        if (checkPrice < minP || checkPrice > maxP) {
            if (lp < minP || lp > maxP) continue;
        }

        if (!buyerTypes.includes(p.property_type)) continue;

        const propCond = CONDITION_RANK[p.condition_estimate] || 99;
        if (propCond > buyerTol) continue;

        matches.push(p);
    }

    matches.sort((a, b) => {
        const spreadA = (a.list_price || 0) - (a.mao || 999999999);
        const spreadB = (b.list_price || 0) - (b.mao || 999999999);
        if (spreadA !== spreadB) return spreadA - spreadB;
        return (b.dom || 0) - (a.dom || 0);
    });
    return matches;
}

// Simple auth gate — uses Supabase Auth
const APP_PASSWORD = null; // no longer used

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) return true;
    showLogin();
    return false;
}

function showLogin() {
    app.innerHTML = `
    <div style="max-width:360px;margin:80px auto;">
      <div class="card">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:20px;font-weight:700;">Deal<span style="color:var(--accent);">Engine</span></div>
          <div class="text-muted text-sm" style="margin-top:4px;">Sign in to continue</div>
        </div>
        <form id="loginForm">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required autofocus>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required>
          </div>
          <div id="loginError" style="color:var(--red);font-size:13px;margin-bottom:8px;display:none;"></div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Sign In</button>
        </form>
      </div>
    </div>`;
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value;
    const password = form.password.value;
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';

    const btn = form.querySelector('button');
    btn.textContent = 'Signing in…';
    btn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
        errEl.textContent = error.message;
        errEl.style.display = 'block';
        btn.textContent = 'Sign In';
        btn.disabled = false;
        return;
    }
    route(location.pathname + location.search);
}

// Sign out function
window.signOut = async () => {
    await db.auth.signOut();
    showLogin();
};

// ── Sortable Tables ─────────────────────────────────────────────────────────
// Tracks current sort state per table id
const _sortState = {};

function makeSortable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = table.querySelectorAll('th[data-sort]');
    headers.forEach(th => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.addEventListener('click', () => sortTable(tableId, th.dataset.sort, th.dataset.type || 'string'));
    });
    // Show initial indicator
    updateSortIndicators(tableId);
}

function sortTable(tableId, col, type) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr[data-row]'));
    if (!rows.length) return;

    // Toggle direction
    const state = _sortState[tableId] || {};
    if (state.col === col) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.col = col;
        state.dir = 'asc';
    }
    _sortState[tableId] = state;

    rows.sort((a, b) => {
        const key = ('sort' + col).toLowerCase();
        let va = a.dataset[key] ?? '';
        let vb = b.dataset[key] ?? '';

        if (type === 'number') {
            va = parseFloat(va) || 0;
            vb = parseFloat(vb) || 0;
        } else if (type === 'date') {
            va = va || '9999';
            vb = vb || '9999';
        } else {
            va = va.toLowerCase();
            vb = vb.toLowerCase();
        }

        let result = 0;
        if (va < vb) result = -1;
        else if (va > vb) result = 1;

        return state.dir === 'desc' ? -result : result;
    });

    rows.forEach(r => tbody.appendChild(r));
    updateSortIndicators(tableId);
}

function updateSortIndicators(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const state = _sortState[tableId] || {};
    table.querySelectorAll('th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
        if (th.dataset.sort === state.col) {
            const span = document.createElement('span');
            span.className = 'sort-arrow';
            span.textContent = state.dir === 'asc' ? ' ▲' : ' ▼';
            span.style.fontSize = '10px';
            span.style.opacity = '0.7';
            th.appendChild(span);
        }
    });
}