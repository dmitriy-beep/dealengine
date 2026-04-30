// ── SPA Router ──────────────────────────────────────────────────────────────
const app = document.getElementById('app');

// ── Data Cache (avoid re-fetching on filter/status clicks) ──────────────────
const _cache = {};
function invalidateCache(key) { if (key) delete _cache[key]; else Object.keys(_cache).forEach(k => delete _cache[k]); }

function navigate(path, pushState = true) {
    if (pushState) history.pushState(null, '', path);
    route(path);
}

window.addEventListener('popstate', () => route(location.pathname + location.search));

document.addEventListener('click', e => {
    const a = e.target.closest('a[data-page], a[href^="/"]');
    if (a && a.href && a.href.startsWith(location.origin) && !a.hasAttribute('download')) {
        e.preventDefault();
        navigate(a.getAttribute('href'));
    }
});

// Highlight active nav
function setActiveNav(page) {
    document.querySelectorAll('.topbar nav a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '/' + page || (page === '' && a.getAttribute('href') === '/'));
    });
}

function route(path) {
    const url = new URL(path, location.origin);
    const p = url.pathname;
    const params = url.searchParams;

    if (p === '/' || p === '') { setActiveNav(''); renderDashboard(); }
    else if (p === '/buyers' && !params.has('id')) { setActiveNav('buyers'); renderBuyersList(params); }
    else if (p === '/buyers/new') { setActiveNav('buyers'); renderBuyerForm(); }
    else if (p === '/buyers/calllist') { setActiveNav('buyers'); renderCallList(params); }
    else if (p.match(/^\/buyers\/(\d+)\/edit$/)) { setActiveNav('buyers'); renderBuyerForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/buyers\/(\d+)$/)) { setActiveNav('buyers'); renderBuyerDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/properties') { setActiveNav('properties'); renderPropertiesList(params); }
    else if (p === '/properties/new') { setActiveNav('properties'); renderPropertyForm(); }
    else if (p.match(/^\/properties\/(\d+)\/edit$/)) { setActiveNav('properties'); renderPropertyForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/properties\/(\d+)$/)) { setActiveNav('properties'); renderPropertyDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/contacts') { setActiveNav('contacts'); renderContactsList(params); }
    else if (p === '/contacts/new') { setActiveNav('contacts'); renderContactForm(); }
    else if (p.match(/^\/contacts\/(\d+)\/edit$/)) { setActiveNav('contacts'); renderContactForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/contacts\/(\d+)$/)) { setActiveNav('contacts'); renderContactDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/activities') { setActiveNav('activities'); renderActivitiesList(params); }
    else if (p === '/activities/new') { setActiveNav('activities'); renderActivityForm(params); }
    else { app.innerHTML = '<div class="card">Page not found.</div>'; }
}

// ── Dashboard ───────────────────────────────────────────────────────────────
async function renderDashboard() {
    app.innerHTML = '<div class="loading">Loading dashboard…</div>';
    const todayStr = today();

    const [{ data: buyers }, { data: properties }, { data: contacts }, { data: activities }] = await Promise.all([
        db.from('buyers').select('*').limit(10000),
        db.from('properties').select('*').limit(10000),
        db.from('contacts').select('*').limit(10000),
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20)
    ]);

    // Follow-ups
    const followups = [];
    (buyers || []).filter(b => b.next_followup && b.next_followup <= todayStr).forEach(b => {
        followups.push({ type: 'buyer', id: b.id, name: b.name, date: b.next_followup, overdue: b.next_followup < todayStr, url: `/buyers/${b.id}` });
    });
    (contacts || []).filter(c => c.next_followup && c.next_followup <= todayStr).forEach(c => {
        followups.push({ type: 'contact', id: c.id, name: c.name, date: c.next_followup, overdue: c.next_followup < todayStr, url: `/contacts/${c.id}` });
    });
    followups.sort((a, b) => a.date.localeCompare(b.date));

    // Counts
    const buyerCounts = {};
    (buyers || []).forEach(b => { buyerCounts[b.status] = (buyerCounts[b.status] || 0) + 1; });
    const propCounts = {};
    (properties || []).forEach(p => { propCounts[p.status] = (propCounts[p.status] || 0) + 1; });

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const weeklyCount = (activities || []).filter(a => a.created_at >= weekAgo).length;

    // Resolve contact names for activities
    const buyerMap = Object.fromEntries((buyers || []).map(b => [b.id, b.name]));
    const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c.name]));

    app.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Follow-ups Due</div><div class="value" style="color:${followups.length > 0 ? 'var(--red)' : 'var(--green)'}">${followups.length}</div><div class="sub">today or overdue</div></div>
      <div class="stat"><div class="label">Active Buyers</div><div class="value">${(buyers || []).length}</div><div class="sub">${Object.entries(buyerCounts).map(([s,c]) => `${s.replace(/_/g,' ')}: ${c}`).join(', ')}</div></div>
      <div class="stat"><div class="label">Properties</div><div class="value">${(properties || []).length}</div><div class="sub">${Object.entries(propCounts).map(([s,c]) => `${s.replace(/_/g,' ')}: ${c}`).join(', ')}</div></div>
      <div class="stat"><div class="label">Activities This Week</div><div class="value">${weeklyCount}</div><div class="sub">logged</div></div>
    </div>

    ${followups.length ? `<div class="card"><h2>Follow-ups Due</h2><table>
      <tr><th>Type</th><th>Name</th><th>Due</th><th>Action</th></tr>
      ${followups.map(f => `<tr>
        <td>${badge(f.type, f.type === 'buyer' ? 'blue' : 'orange')}</td>
        <td><a href="${f.url}">${f.name}</a></td>
        <td>${f.date}${f.overdue ? ' ' + badge('overdue', 'red') : ''}</td>
        <td><a href="/activities/new?contact_type=${f.type}&contact_id=${f.id}" class="btn btn-sm">Log Activity</a></td>
      </tr>`).join('')}
    </table></div>` : ''}

    <div class="card"><h2>Recent Activity</h2><table>
      <tr><th>When</th><th>Type</th><th>Who</th><th>Description</th><th>Follow-up</th></tr>
      ${(activities || []).map(a => {
        let name = '';
        if (a.contact_type === 'buyer') name = buyerMap[a.contact_id] || '';
        else name = contactMap[a.contact_id] || '';
        return `<tr>
          <td class="text-muted text-sm">${(a.created_at || '').slice(0, 16)}</td>
          <td>${badge(a.contact_type, 'gray')} ${badge(a.activity_type, 'blue')}</td>
          <td>${name}</td>
          <td>${(a.description || '').slice(0, 80)}${(a.description || '').length > 80 ? '…' : ''}</td>
          <td>${a.followup_needed ? badge(a.followup_date || 'TBD', 'yellow') : ''}</td>
        </tr>`;
      }).join('')}
    </table></div>`;
}

// ── Buyers List ─────────────────────────────────────────────────────────────
async function renderBuyersList(params) {
    if (!_cache.buyers) {
        app.innerHTML = '<div class="loading">Loading buyers…</div>';
        const { data: buyers } = await db.from('buyers').select('*').order('name').limit(10000);
        _cache.buyers = buyers || [];
    }
    const buyers = _cache.buyers;
    let filtered = [...buyers];

    const search = params?.get('search');
    const status = params?.get('status');
    const strategy = params?.get('strategy');
    const zip = params?.get('zip');
    const batch = params?.get('batch');

    if (search) filtered = filtered.filter(b => (b.name + ' ' + b.email).toLowerCase().includes(search.toLowerCase()));
    if (status) filtered = filtered.filter(b => b.status === status);
    if (strategy) filtered = filtered.filter(b => b.strategy === strategy);
    if (zip) filtered = filtered.filter(b => (b.zip_codes || '').includes(zip));
    if (batch) filtered = filtered.filter(b => b.import_batch === batch);

    // Get unique batch names for filter dropdown
    const batches = [...new Set((buyers || []).map(b => b.import_batch).filter(Boolean))].sort();

    // Sort by status priority
    const so = { verified_active: 0, engaged: 1, criteria_collected: 2, contacted: 3, new_high_priority: 4, new: 5, new_probably_not: 6, not_investor: 7, inactive: 8 };
    filtered.sort((a, b) => (so[a.status] || 5) - (so[b.status] || 5));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Buyers</h1>
      <div class="flex gap-2">
        <a href="/buyers/calllist" class="btn btn-sm" style="background:rgba(52,211,153,.15);border-color:var(--green);color:var(--green);">📞 Call List</a>
        <button class="btn btn-sm" onclick="exportBuyers()">Export CSV</button>
        <button class="btn btn-sm" onclick="document.getElementById('propstream-buyer-file').click()" style="background:var(--orange);border-color:var(--orange);color:#fff;">Import PropStream</button>
        <input type="file" id="propstream-buyer-file" accept=".csv" style="display:none" onchange="handlePropStreamBuyerImport(this)">
        <a href="/buyers/new" class="btn btn-sm btn-primary">+ Add Buyer</a>
      </div>
    </div>
    <div class="status-filters">
      ${(() => {
        const allStatuses = ['new','new_high_priority','new_probably_not','contacted','criteria_collected','engaged','verified_active','not_investor','inactive'];
        const statusCounts = {};
        allStatuses.forEach(s => { statusCounts[s] = 0; });
        (buyers || []).forEach(b => { if (statusCounts[b.status] !== undefined) statusCounts[b.status]++; });
        const total = (buyers || []).length;
        return `<button class="status-btn ${!status ? 'status-btn-active' : ''}" style="--btn-color:var(--accent);" onclick="filterBuyerStatus('')">All <span class="status-count">${total}</span></button>` +
          allStatuses.map(s => {
            const color = buyerStatusColor(s);
            const colorVar = { green:'var(--green)', yellow:'var(--yellow)', blue:'var(--accent)', orange:'var(--orange)', gray:'var(--text2)', red:'var(--red)' }[color] || 'var(--text2)';
            return `<button class="status-btn ${status===s ? 'status-btn-active' : ''}" style="--btn-color:${colorVar};" onclick="filterBuyerStatus('${s}')">${s.replace(/_/g,' ')} <span class="status-count">${statusCounts[s]}</span></button>`;
          }).join('');
      })()}
    </div>
    <div class="filters">
      <input type="text" id="f-search" placeholder="Search name/email…" value="${search || ''}">
      <select id="f-strategy"><option value="">All Strategies</option>${['flip','brrrr','rental_hold','wholesale'].map(s => `<option value="${s}" ${strategy===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <input type="text" id="f-zip" placeholder="Zip" value="${zip || ''}" style="width:100px;">
      ${batches.length ? `<select id="f-batch"><option value="">All Imports</option>${batches.map(b => `<option value="${b}" ${batch===b?'selected':''}>${b}</option>`).join('')}</select>` : ''}
      <button class="btn btn-sm" onclick="filterBuyers()">Filter</button>
      <a href="/buyers" class="btn btn-sm">Clear</a>
      ${batch ? `<button class="btn btn-sm" onclick="renameBatch('buyers','${batch.replace(/'/g,"\\'")}')" style="margin-left:4px;">Rename "${batch}"</button>
      <button class="btn btn-sm btn-danger" onclick="deleteBatch('buyers','${batch.replace(/'/g,"\\'")}')" >Delete Batch</button>` : ''}
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table id="tbl-buyers">
      <tr><th data-sort="Name">Name</th><th data-sort="Portfolio" data-type="number">Portfolio</th><th data-sort="Status">Status</th><th data-sort="Strategy">Strategy</th><th data-sort="Price" data-type="number">Price Range</th><th>Zips</th><th data-sort="Condition">Condition</th><th data-sort="Funding">Funding</th><th data-sort="POF">POF</th><th data-sort="Deals" data-type="number">Deals</th><th data-sort="Followup" data-type="date">Next F/U</th>${batches.length ? '<th data-sort="Import">Import</th>' : ''}<th></th></tr>
      ${filtered.map(b => `<tr data-row data-sortName="${(b.name||'').replace(/"/g,'&quot;')}" data-sortPortfolio="${parseInt(b.portfolio_tier)||0}" data-sortStatus="${b.status||''}" data-sortStrategy="${b.strategy||''}" data-sortPrice="${b.max_price||0}" data-sortCondition="${b.condition_tolerance||''}" data-sortFunding="${b.funding_method||''}" data-sortPOF="${b.proof_of_funds_verified?'1':'0'}" data-sortDeals="${b.deals_last_12_months||0}" data-sortFollowup="${b.next_followup||''}" ${batches.length ? `data-sortImport="${b.import_batch||''}"` : ''}>
        <td><a href="/buyers/${b.id}"><strong>${b.name}</strong></a>${b.entity_name ? `<br><span class="text-muted text-sm">${b.entity_name}</span>` : ''}</td>
        <td>${b.portfolio_tier ? badge(b.portfolio_tier, tierColor(b.portfolio_tier)) : ''}</td>
        <td>${badge(b.status, buyerStatusColor(b.status))}${b.status === 'new' ? `<span style="margin-left:4px;white-space:nowrap;"><button class="btn btn-sm" onclick="quickSetStatus(${b.id},'new_high_priority')" style="padding:2px 6px;background:rgba(52,211,153,.15);border-color:var(--green);color:var(--green);font-size:11px;" title="High priority">✓</button><button class="btn btn-sm" onclick="quickSetStatus(${b.id},'new_probably_not')" style="padding:2px 6px;background:rgba(248,113,113,.15);border-color:var(--red);color:var(--red);font-size:11px;margin-left:2px;" title="Probably not investor">✗</button></span>` : ''}</td>
        <td>${(b.strategy || '').replace(/_/g,' ')}</td>
        <td class="money">${fmt(b.min_price)} – ${fmt(b.max_price)}</td>
        <td class="text-sm">${b.zip_codes || ''}</td>
        <td>${(b.condition_tolerance || '').replace(/_/g,' ')}</td>
        <td>${(b.funding_method || '').replace(/_/g,' ')}</td>
        <td>${b.proof_of_funds_verified ? badge('✓','green') : badge('–','gray')}</td>
        <td>${b.deals_last_12_months}</td>
        <td class="text-sm">${b.next_followup || ''}</td>
        ${batches.length ? `<td class="text-sm text-muted">${b.import_batch || ''}</td>` : ''}
        <td style="white-space:nowrap;"><a href="/buyers/${b.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteBuyer(${b.id})">Del</button></td>
      </tr>`).join('')}
      ${filtered.length === 0 ? `<tr><td colspan="${batches.length ? 13 : 12}" class="text-muted" style="text-align:center;padding:24px;">No buyers found.</td></tr>` : ''}
    </table></div>`;

    window._buyersData = buyers;
    setTimeout(() => makeSortable('tbl-buyers'), 0);
}

window.filterBuyers = () => {
    const params = new URLSearchParams();
    const s = document.getElementById('f-search').value; if (s) params.set('search', s);
    // Preserve current status filter if active
    const currentStatus = new URLSearchParams(location.search).get('status');
    if (currentStatus) params.set('status', currentStatus);
    const str = document.getElementById('f-strategy').value; if (str) params.set('strategy', str);
    const z = document.getElementById('f-zip').value; if (z) params.set('zip', z);
    const b = document.getElementById('f-batch')?.value; if (b) params.set('batch', b);
    navigate('/buyers' + (params.toString() ? '?' + params.toString() : ''));
};

window.filterBuyerStatus = (status) => {
    const params = new URLSearchParams(location.search);
    if (status) params.set('status', status);
    else params.delete('status');
    navigate('/buyers' + (params.toString() ? '?' + params.toString() : ''));
};

window.quickSetStatus = async (id, newStatus) => {
    const { error } = await db.from('buyers').update({ status: newStatus }).eq('id', id);
    if (error) { flash('Error updating status: ' + error.message, 'error'); return; }
    // Update cache in-place for instant re-render
    if (_cache.buyers) {
        const b = _cache.buyers.find(b => b.id === id);
        if (b) b.status = newStatus;
    }
    flash(`Status → ${newStatus.replace(/_/g, ' ')}`);
    navigate(location.pathname + location.search, false);
};

window.exportBuyers = async () => {
    const { data } = await db.from('buyers').select('*').order('name').limit(10000);
    if (data) exportCSV(data, 'buyers.csv');
};

// ── PropStream Buyer Import ─────────────────────────────────────────────────
window.handlePropStreamBuyerImport = (input) => {
    const file = input.files[0];
    if (!file) return;
    const batchName = file.name.replace(/\.csv$/i, '');
    const reader = new FileReader();
    reader.onload = (e) => {
        const rows = parsePropStreamCSV(e.target.result);
        if (!rows.length) { flash('No data found in CSV', 'error'); return; }
        showPropStreamBuyerPreview(rows, batchName);
    };
    reader.readAsText(file);
    input.value = '';
};

function showPropStreamBuyerPreview(owners, batchName) {
    const buyers = owners.map(o => {
        const noteParts = [];
        if (o.firstName || o.lastName) noteParts.push(`Contact: ${[o.firstName, o.lastName].filter(Boolean).join(' ')}`);
        if (o.portfolioTier) noteParts.push(`Portfolio: ${o.portfolioTier} properties`);
        if (o.addresses.length) noteParts.push(`Property addresses:\n${o.addresses.join('\n')}`);
        if (o.mailAddr) noteParts.push(`Mail: ${o.mailAddr}`);
        if (o.emails.length > 1) noteParts.push(`Other emails: ${o.emails.slice(1).join(', ')}`);
        if (o.dncPhones.length) noteParts.push(`DNC phones: ${o.dncPhones.join(', ')}`);
        if (o.phones.length > 1) noteParts.push(`Other phones: ${o.phones.slice(1).join(', ')}`);
        noteParts.push(`Source: PropStream (${o.type || '—'})`);

        return {
            name: o.name,
            entity_name: o.name.toLowerCase().includes('llc') || o.name.toLowerCase().includes('inc') || o.name.toLowerCase().includes('trust') ? o.name : null,
            phone: o.phones[0] || null,
            phone_alt: o.phones.slice(1).join(',') || null,
            dnc_phones: o.dncPhones.join(',') || null,
            email: o.emails[0] || null,
            property_address: o.addresses[0] || null,
            notes: noteParts.join('\n'),
            portfolioTier: o.portfolioTier,
        };
    });

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Import PropStream → Buyers</h1>
      <div class="flex gap-2">
        <button class="btn btn-primary" onclick="confirmPropStreamBuyerImport()">Import ${buyers.length} Buyers</button>
        <a href="/buyers" class="btn">Cancel</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div class="text-sm text-muted">
        Found <strong style="color:var(--text)">${buyers.length}</strong> unique contacts from CSV.
        Duplicate rows (same name) have been merged.
        Phones marked DNC are excluded from the primary phone and noted separately.
        All imported buyers will be set to <strong style="color:var(--text)">new</strong> status — edit them after import to fill in criteria.
        <br>Import batch: <strong style="color:var(--accent)">${batchName}</strong> — you can rename this later from the Buyers list filter.
      </div>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th style="width:30px;"><input type="checkbox" id="psb-check-all" checked onchange="toggleAllPropStreamBuyer(this.checked)"></th><th>Name</th><th>Entity</th><th>Portfolio</th><th>Phone</th><th>Email</th><th>Notes Preview</th></tr>
      ${buyers.map((b, i) => `<tr>
        <td><input type="checkbox" class="psb-row-check" data-idx="${i}" checked></td>
        <td><strong>${b.name}</strong></td>
        <td class="text-sm text-muted">${b.entity_name || '—'}</td>
        <td>${b.portfolioTier ? badge(b.portfolioTier, tierColor(b.portfolioTier)) : '—'}</td>
        <td>${b.phone || '—'}</td>
        <td>${b.email || '—'}</td>
        <td class="text-sm text-muted" style="max-width:300px;white-space:pre-wrap;">${(b.notes || '').slice(0, 120)}${b.notes.length > 120 ? '…' : ''}</td>
      </tr>`).join('')}
    </table></div>`;

    window._propStreamBuyers = buyers;
    window._propStreamBuyerBatch = batchName;
}

window.toggleAllPropStreamBuyer = (checked) => {
    document.querySelectorAll('.psb-row-check').forEach(cb => cb.checked = checked);
};

window.confirmPropStreamBuyerImport = async () => {
    const buyers = window._propStreamBuyers;
    const batchName = window._propStreamBuyerBatch || 'import';
    if (!buyers) return;

    const selected = [];
    document.querySelectorAll('.psb-row-check:checked').forEach(cb => {
        selected.push(parseInt(cb.dataset.idx));
    });

    if (selected.length === 0) { flash('No buyers selected', 'error'); return; }

    const toInsert = selected.map(i => ({
        name: buyers[i].name,
        entity_name: buyers[i].entity_name,
        phone: buyers[i].phone,
        phone_alt: buyers[i].phone_alt,
        dnc_phones: buyers[i].dnc_phones,
        email: buyers[i].email,
        property_address: buyers[i].property_address,
        source: 'public_records',
        status: 'new',
        preferred_contact: 'call',
        proof_of_funds_verified: false,
        deals_last_12_months: 0,
        notes: buyers[i].notes,
        import_batch: batchName,
        portfolio_tier: buyers[i].portfolioTier || null,
    }));

    let inserted = 0;
    let errors = 0;
    const chunkSize = 50;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await db.from('buyers').insert(chunk);
        if (error) { errors++; console.error('Import chunk error:', error); }
        else inserted += chunk.length;
    }

    if (errors) flash(`Imported ${inserted} buyers (${errors} chunk(s) had errors)`, 'error');
    else flash(`Imported ${inserted} buyers from PropStream → "${batchName}"`);
    invalidateCache('buyers');
    navigate('/buyers?batch=' + encodeURIComponent(batchName));
};

// ── Call List ───────────────────────────────────────────────────────────────
async function renderCallList(params) {
    if (!_cache.buyers || !_cache.buyerActivities) {
        app.innerHTML = '<div class="loading">Loading call list…</div>';
        const [{ data: buyers }, { data: activities }] = await Promise.all([
            db.from('buyers').select('*').order('name').limit(10000),
            db.from('activity_log').select('*').eq('contact_type', 'buyer').order('created_at', { ascending: false }).limit(10000)
        ]);
        _cache.buyers = buyers || [];
        _cache.buyerActivities = activities || [];
    }
    const buyers = _cache.buyers;
    const activities = _cache.buyerActivities;

    // Callable buyers base set (before status filter)
    const callable = (buyers || []).filter(b => {
        if (['inactive', 'not_investor', 'new_probably_not'].includes(b.status)) return false;
        if (!b.phone) return false;
        return true;
    });

    let filtered = [...callable];

    const batch = params?.get('batch');
    const status = params?.get('status');
    const tier = params?.get('tier');
    if (batch) filtered = filtered.filter(b => b.import_batch === batch);
    if (status) filtered = filtered.filter(b => b.status === status);
    if (tier) filtered = filtered.filter(b => b.portfolio_tier === tier);

    const batches = [...new Set((buyers || []).map(b => b.import_batch).filter(Boolean))].sort();
    const tiers = [...new Set((buyers || []).map(b => b.portfolio_tier).filter(Boolean))].sort((a, b) => (parseInt(a)||0) - (parseInt(b)||0));

    // Build activity count per buyer for sequence tracking
    const activityMap = {};
    (activities || []).forEach(a => {
        if (!activityMap[a.contact_id]) activityMap[a.contact_id] = { calls: 0, texts: 0, last: null };
        const m = activityMap[a.contact_id];
        if (a.activity_type === 'call') m.calls++;
        if (a.activity_type === 'text') m.texts++;
        if (!m.last || a.created_at > m.last) m.last = a.created_at;
    });

    // Sort: prioritize by sequence step (fewer touches first), then by portfolio tier descending
    filtered.sort((a, b) => {
        const aAct = activityMap[a.id] || { calls: 0, texts: 0 };
        const bAct = activityMap[b.id] || { calls: 0, texts: 0 };
        const aTouches = aAct.calls + aAct.texts;
        const bTouches = bAct.calls + bAct.texts;
        if (aTouches !== bTouches) return aTouches - bTouches;
        const aTier = parseInt(a.portfolio_tier) || 0;
        const bTier = parseInt(b.portfolio_tier) || 0;
        return bTier - aTier;
    });

    // Determine next step label for each buyer
    function seqLabel(buyerId) {
        const a = activityMap[buyerId] || { calls: 0, texts: 0 };
        if (a.calls === 0) return { label: 'Day 1: Call', color: 'blue' };
        if (a.texts === 0) return { label: 'Day 3: Text', color: 'blue' };
        if (a.calls === 1) return { label: 'Day 7: Call #2', color: 'yellow' };
        if (a.texts === 1) return { label: 'Day 14: Final Text', color: 'orange' };
        return { label: 'Sequence done', color: 'gray' };
    }

    // Status counts from callable buyers (not filtered by status)
    const callableStatuses = ['new','new_high_priority','contacted','criteria_collected','engaged','verified_active'];
    const statusCounts = {};
    callableStatuses.forEach(s => { statusCounts[s] = 0; });
    callable.forEach(b => { if (statusCounts[b.status] !== undefined) statusCounts[b.status]++; });

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">📞 Call List</h1>
      <div class="flex gap-2">
        <a href="/buyers" class="btn btn-sm">← Back to Buyers</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div class="text-sm text-muted">
        Showing <strong style="color:var(--text)">${filtered.length}</strong> callable buyers (have a non-DNC phone, not inactive/not investor).
        Sorted by outreach progress then portfolio size. Click a row's phone to copy, address to copy for PropStream lookup.
      </div>
    </div>
    <div class="status-filters">
      <button class="status-btn ${!status ? 'status-btn-active' : ''}" style="--btn-color:var(--accent);" onclick="filterCallListStatus('')">All <span class="status-count">${callable.length}</span></button>
      ${callableStatuses.map(s => {
        const color = buyerStatusColor(s);
        const colorVar = { green:'var(--green)', yellow:'var(--yellow)', blue:'var(--accent)', orange:'var(--orange)', gray:'var(--text2)', red:'var(--red)' }[color] || 'var(--text2)';
        return `<button class="status-btn ${status===s ? 'status-btn-active' : ''}" style="--btn-color:${colorVar};" onclick="filterCallListStatus('${s}')">${s.replace(/_/g,' ')} <span class="status-count">${statusCounts[s]}</span></button>`;
      }).join('')}
    </div>
    <div class="filters">
      ${batches.length ? `<select id="cl-batch"><option value="">All Imports</option>${batches.map(b=>`<option value="${b}" ${batch===b?'selected':''}>${b}</option>`).join('')}</select>` : ''}
      ${tiers.length ? `<select id="cl-tier"><option value="">All Tiers</option>${tiers.map(t=>`<option value="${t}" ${tier===t?'selected':''}>${t} properties</option>`).join('')}</select>` : ''}
      <button class="btn btn-sm" onclick="filterCallList()">Filter</button>
      <a href="/buyers/calllist" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table id="tbl-calllist">
      <tr>
        <th data-sort="Name">Name</th>
        <th data-sort="Tier" data-type="number">Portfolio</th>
        <th data-sort="Step">Next Step</th>
        <th>Callable Phones</th>
        <th>DNC Phones</th>
        <th>Address (for PropStream)</th>
        <th data-sort="Status">Status</th>
        <th></th>
      </tr>
      ${filtered.map(b => {
        const seq = seqLabel(b.id);
        const allPhones = [b.phone, ...(b.phone_alt || '').split(',')].filter(Boolean);
        const dncList = (b.dnc_phones || '').split(',').filter(Boolean);
        const addr = b.property_address || '';
        return `<tr data-row data-sortName="${(b.name||'').replace(/"/g,'&quot;')}" data-sortTier="${parseInt(b.portfolio_tier)||0}" data-sortStep="${seq.label}" data-sortStatus="${b.status||''}">
          <td>
            <a href="/buyers/${b.id}"><strong>${b.name}</strong></a>
            ${b.entity_name ? `<br><span class="text-muted text-sm">${b.entity_name}</span>` : ''}
          </td>
          <td>${b.portfolio_tier ? badge(b.portfolio_tier, tierColor(b.portfolio_tier)) : ''}</td>
          <td>${badge(seq.label, seq.color)}</td>
          <td>
            ${allPhones.map(p => `<span class="btn btn-sm" style="margin:1px;cursor:pointer;font-variant-numeric:tabular-nums;" onclick="copyText('${p}');flash('Copied ${p}')">📋 ${p}</span>`).join('<br>')}
          </td>
          <td class="text-sm" style="color:var(--red);">
            ${dncList.length ? dncList.join(', ') : '<span class="text-muted">none</span>'}
          </td>
          <td>
            ${addr ? `<span class="btn btn-sm" style="cursor:pointer;" onclick="copyText('${addr.replace(/'/g,"\\'")}');flash('Address copied')">📋 ${addr}</span>` : '<span class="text-muted text-sm">—</span>'}
          </td>
          <td>${badge(b.status, buyerStatusColor(b.status))}</td>
          <td>
            <a href="/activities/new?contact_type=buyer&contact_id=${b.id}" class="btn btn-sm btn-primary">Log Call</a>
          </td>
        </tr>`;
      }).join('')}
      ${filtered.length === 0 ? '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px;">No callable buyers found.</td></tr>' : ''}
    </table></div>`;

    setTimeout(() => makeSortable('tbl-calllist'), 0);
}

window.copyText = (text) => {
    navigator.clipboard.writeText(text);
};

window.filterCallList = () => {
    const params = new URLSearchParams();
    // Preserve current status filter if active
    const currentStatus = new URLSearchParams(location.search).get('status');
    if (currentStatus) params.set('status', currentStatus);
    const b = document.getElementById('cl-batch')?.value; if (b) params.set('batch', b);
    const t = document.getElementById('cl-tier')?.value; if (t) params.set('tier', t);
    navigate('/buyers/calllist' + (params.toString() ? '?' + params : ''));
};

window.filterCallListStatus = (status) => {
    const params = new URLSearchParams(location.search);
    if (status) params.set('status', status);
    else params.delete('status');
    navigate('/buyers/calllist' + (params.toString() ? '?' + params.toString() : ''));
};

// ── Buyer Form ──────────────────────────────────────────────────────────────
async function renderBuyerForm(id) {
    let buyer = null;
    if (id) {
        const { data } = await db.from('buyers').select('*').eq('id', id).single();
        buyer = data;
    }
    const v = (field) => buyer ? (buyer[field] ?? '') : '';
    const sel = (field, val) => buyer && buyer[field] === val ? 'selected' : '';
    const chk = (field) => buyer && buyer[field] ? 'checked' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id ? 'Edit' : 'Add New'} Buyer</h1>
    <form class="card" id="buyerForm">
      <div class="form-grid">
        <div class="form-group"><label>Name *</label><input type="text" name="name" value="${v('name')}" required></div>
        <div class="form-group"><label>Entity Name</label><input type="text" name="entity_name" value="${v('entity_name')}"></div>
        <div class="form-group"><label>Phone</label><input type="text" name="phone" value="${v('phone')}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${v('email')}"></div>
        <div class="form-group"><label>Source</label><select name="source">${['public_records','meetup','referral','online','other'].map(s=>`<option value="${s}" ${sel('source',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Preferred Contact</label><select name="preferred_contact">${['call','text','email'].map(s=>`<option value="${s}" ${sel('preferred_contact',s)}>${s}</option>`).join('')}</select></div>
        <div class="form-group full"><label>Target Zip Codes (comma-separated)</label><input type="text" name="zip_codes" value="${v('zip_codes')}" placeholder="95747,95678,95677"></div>
        <div class="form-group"><label>Min Price ($)</label><input type="number" name="min_price" value="${v('min_price')}"></div>
        <div class="form-group"><label>Max Price ($)</label><input type="number" name="max_price" value="${v('max_price')}"></div>
        <div class="form-group"><label>Property Types (comma-separated)</label><input type="text" name="property_types" value="${v('property_types')}" placeholder="sfr,multi,land,condo"></div>
        <div class="form-group"><label>Condition Tolerance</label><select name="condition_tolerance">${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${sel('condition_tolerance',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Strategy</label><select name="strategy">${['flip','brrrr','rental_hold','wholesale'].map(s=>`<option value="${s}" ${sel('strategy',s)}>${s === 'brrrr' ? 'BRRRR' : s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Funding Method</label><select name="funding_method">${['cash','hard_money','conventional','private_money'].map(s=>`<option value="${s}" ${sel('funding_method',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Deals (12mo)</label><input type="number" name="deals_last_12_months" value="${v('deals_last_12_months') || 0}"></div>
        <div class="form-group"><label>Portfolio Tier</label><select name="portfolio_tier"><option value="">— Unknown —</option>${['1-3','4-5','6-10','11-19','20-49','50+'].map(s=>`<option value="${s}" ${v('portfolio_tier')===s?'selected':''}>${s} properties</option>`).join('')}</select></div>
        <div class="form-group"><label>Status</label><select name="status">${['new','new_high_priority','new_probably_not','contacted','criteria_collected','engaged','verified_active','not_investor','inactive'].map(s=>`<option value="${s}" ${sel('status',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Next Follow-up</label><input type="date" name="next_followup" value="${v('next_followup')}"></div>
        <div class="form-group"><label>Last Contacted</label><input type="date" name="last_contacted" value="${v('last_contacted')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="proof_of_funds_verified" ${chk('proof_of_funds_verified')}> Proof of Funds Verified</label></div>
        <div class="form-group full"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" data-action="save">Save</button>
        <button type="button" class="btn" onclick="saveBuyer('save_add')">Save & Add Another</button>
        <a href="/buyers" class="btn">Cancel</a>
        ${id ? `<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteBuyer(${id})">Delete</button>` : ''}
      </div>
    </form>`;

    document.getElementById('buyerForm').addEventListener('submit', e => { e.preventDefault(); saveBuyer('save'); });
    window._editBuyerId = id || null;
}

window.saveBuyer = async (action) => {
    const form = document.getElementById('buyerForm');
    const fd = new FormData(form);
    const data = {
        name: fd.get('name'), entity_name: fd.get('entity_name') || null,
        phone: fd.get('phone') || null, email: fd.get('email') || null,
        source: fd.get('source'), zip_codes: fd.get('zip_codes') || null,
        min_price: fd.get('min_price') ? parseInt(fd.get('min_price')) : null,
        max_price: fd.get('max_price') ? parseInt(fd.get('max_price')) : null,
        property_types: fd.get('property_types') || null,
        condition_tolerance: fd.get('condition_tolerance'),
        strategy: fd.get('strategy'), funding_method: fd.get('funding_method'),
        proof_of_funds_verified: form.querySelector('[name=proof_of_funds_verified]').checked,
        deals_last_12_months: parseInt(fd.get('deals_last_12_months')) || 0,
        portfolio_tier: fd.get('portfolio_tier') || null,
        preferred_contact: fd.get('preferred_contact'),
        status: fd.get('status'), notes: fd.get('notes') || null,
        last_contacted: fd.get('last_contacted') || null,
        next_followup: fd.get('next_followup') || null,
    };

    const id = window._editBuyerId;
    let result;
    if (id) {
        result = await db.from('buyers').update(data).eq('id', id);
    } else {
        result = await db.from('buyers').insert(data);
    }

    if (result.error) { flash(result.error.message, 'error'); return; }
    invalidateCache('buyers');
    flash(id ? 'Buyer updated' : 'Buyer added');
    if (action === 'save_add') navigate('/buyers/new');
    else navigate(id ? `/buyers/${id}` : '/buyers');
};

window.deleteBuyer = async (id) => {
    if (!confirm('Delete this buyer?')) return;
    await db.from('activity_log').delete().eq('contact_type', 'buyer').eq('contact_id', id);
    await db.from('buyers').delete().eq('id', id);
    invalidateCache('buyers');
    flash('Buyer deleted');
    navigate('/buyers');
};

// ── Buyer Detail ────────────────────────────────────────────────────────────
async function renderBuyerDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: buyer }, { data: allProps }, { data: activities }] = await Promise.all([
        db.from('buyers').select('*').eq('id', id).single(),
        db.from('properties').select('*').limit(10000),
        db.from('activity_log').select('*').eq('contact_type', 'buyer').eq('contact_id', id).order('created_at', { ascending: false }).limit(10000)
    ]);

    if (!buyer) { flash('Buyer not found', 'error'); navigate('/buyers'); return; }
    const matches = getMatchingProperties(buyer, allProps || []);

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${buyer.name}</h1>${buyer.entity_name ? `<div class="text-muted">${buyer.entity_name}</div>` : ''}</div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=buyer&contact_id=${buyer.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/buyers/${buyer.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Phone</div><div class="value">${buyer.phone || '—'}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${buyer.email || '—'}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${badge(buyer.status, buyerStatusColor(buyer.status))}</div></div>
      <div class="field"><div class="label">Source</div><div class="value">${(buyer.source||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Strategy</div><div class="value">${buyer.strategy === 'brrrr' ? 'BRRRR' : (buyer.strategy||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Funding</div><div class="value">${(buyer.funding_method||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Price Range</div><div class="value money">${fmt(buyer.min_price)} – ${fmt(buyer.max_price)}</div></div>
      <div class="field"><div class="label">Target Zips</div><div class="value">${buyer.zip_codes || '—'}</div></div>
      <div class="field"><div class="label">Property Types</div><div class="value">${buyer.property_types || '—'}</div></div>
      <div class="field"><div class="label">Condition Tolerance</div><div class="value">${(buyer.condition_tolerance||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">POF Verified</div><div class="value">${buyer.proof_of_funds_verified ? '✓ Yes' : '✗ No'}</div></div>
      <div class="field"><div class="label">Deals (12mo)</div><div class="value">${buyer.deals_last_12_months}</div></div>
      <div class="field"><div class="label">Portfolio Tier</div><div class="value">${buyer.portfolio_tier ? badge(buyer.portfolio_tier + ' properties', tierColor(buyer.portfolio_tier)) : '—'}</div></div>
      <div class="field"><div class="label">Property Address</div><div class="value">${buyer.property_address || '—'}</div></div>
      ${(buyer.phone_alt) ? `<div class="field"><div class="label">Other Phones</div><div class="value">${buyer.phone_alt.split(',').join(', ')}</div></div>` : ''}
      ${(buyer.dnc_phones) ? `<div class="field"><div class="label">DNC Phones</div><div class="value" style="color:var(--red)">${buyer.dnc_phones.split(',').join(', ')}</div></div>` : ''}
    </div>
    ${buyer.notes ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${buyer.notes}</div></div>` : ''}
    </div>

    <div class="section-title">Matching Properties (${matches.length})</div>
    ${matches.length ? `<div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Address</th><th>Price</th><th>MAO</th><th>Spread</th><th>DOM</th><th>Type</th><th>Condition</th><th>Status</th></tr>
      ${matches.map(p => {
        const spread = (p.mao || 0) - (p.list_price || 0);
        return `<tr>
          <td><a href="/properties/${p.id}"><strong>${p.address}</strong></a><br><span class="text-muted text-sm">${p.city} ${p.zip_code}</span></td>
          <td class="money">${fmt(p.list_price)}</td><td class="money">${fmt(p.mao)}</td>
          <td class="money ${spread >= 0 ? 'money-green' : 'money-red'}">${fmt(spread)}</td>
          <td>${p.dom || '—'}${p.dom > 60 ? ' 🔥' : ''}</td>
          <td>${(p.property_type||'').toUpperCase()}</td>
          <td>${(p.condition_estimate||'').replace(/_/g,' ')}</td>
          <td>${badge(p.status, propStatusColor(p.status))}</td>
        </tr>`;
      }).join('')}
    </table></div>` : '<div class="card text-muted">No matching properties found.</div>'}

    <div class="section-title">Activity Log</div>
    ${(activities||[]).length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${activities.map(a => `<tr>
        <td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td>
        <td>${badge(a.activity_type, 'blue')}</td>
        <td>${a.description||''}</td>
        <td>${a.followup_needed ? badge(a.followup_date||'TBD','yellow') : ''}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Properties List ─────────────────────────────────────────────────────────
async function renderPropertiesList(params) {
    if (!_cache.properties || !_cache.buyers) {
        app.innerHTML = '<div class="loading">Loading properties…</div>';
        const [{ data: properties }, { data: allBuyers }] = await Promise.all([
            db.from('properties').select('*').order('created_at', { ascending: false }).limit(10000),
            db.from('buyers').select('*').limit(10000)
        ]);
        _cache.properties = properties || [];
        _cache.buyers = allBuyers || [];
    }
    const properties = _cache.properties;
    const allBuyers = _cache.buyers;

    let filtered = [...properties];
    const search = params?.get('search');
    const status = params?.get('status');
    const condition = params?.get('condition');
    const zip = params?.get('zip');
    const maxPrice = params?.get('max_price');
    const minDom = params?.get('min_dom');

    if (search) filtered = filtered.filter(p => (p.address||'').toLowerCase().includes(search.toLowerCase()));
    if (status) filtered = filtered.filter(p => p.status === status);
    if (condition) filtered = filtered.filter(p => p.condition_estimate === condition);
    if (zip) filtered = filtered.filter(p => p.zip_code === zip);
    if (maxPrice) filtered = filtered.filter(p => (p.list_price||0) <= parseInt(maxPrice));
    if (minDom) filtered = filtered.filter(p => (p.dom||0) >= parseInt(minDom));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Properties</h1>
      <div class="flex gap-2">
        <button class="btn btn-sm" onclick="exportProperties()">Export CSV</button>
        <a href="/properties/new" class="btn btn-sm btn-primary">+ Add Property</a>
      </div>
    </div>
    <div class="filters">
      <input type="text" id="fp-search" placeholder="Search address…" value="${search||''}">
      <select id="fp-status"><option value="">All Status</option>${['identified','analyzed','agent_contacted','offer_submitted','under_contract','closed','dead'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <select id="fp-condition"><option value="">All Condition</option>${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${condition===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <input type="text" id="fp-zip" placeholder="Zip" value="${zip||''}" style="width:80px;">
      <input type="number" id="fp-maxprice" placeholder="Max price" value="${maxPrice||''}" style="width:120px;">
      <input type="number" id="fp-mindom" placeholder="Min DOM" value="${minDom||''}" style="width:80px;">
      <button class="btn btn-sm" onclick="filterProps()">Filter</button>
      <a href="/properties" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table id="tbl-properties">
      <tr><th data-sort="Address">Address</th><th data-sort="Price" data-type="number">Price</th><th data-sort="MAO" data-type="number">MAO</th><th data-sort="Spread" data-type="number">Spread</th><th data-sort="DOM" data-type="number">DOM</th><th data-sort="Beds" data-type="number">Beds/Ba</th><th data-sort="Sqft" data-type="number">Sqft</th><th data-sort="Type">Type</th><th data-sort="Cond">Cond</th><th>ADU</th><th data-sort="Status">Status</th><th data-sort="Matches" data-type="number">Matches</th><th></th></tr>
      ${filtered.map(p => {
        const spread = (p.mao||0) - (p.list_price||0);
        const matchCount = getMatchingBuyers(p, allBuyers||[]).length;
        return `<tr data-row data-sortAddress="${(p.address||'').replace(/"/g,'&quot;')}" data-sortPrice="${p.list_price||0}" data-sortMAO="${p.mao||0}" data-sortSpread="${spread}" data-sortDOM="${p.dom||0}" data-sortBeds="${p.beds||0}" data-sortSqft="${p.sqft||0}" data-sortType="${p.property_type||''}" data-sortCond="${p.condition_estimate||''}" data-sortStatus="${p.status||''}" data-sortMatches="${matchCount}">
          <td><a href="/properties/${p.id}"><strong>${p.address}</strong></a><br><span class="text-muted text-sm">${p.city||''} ${p.zip_code||''}</span></td>
          <td class="money">${fmt(p.list_price)}</td><td class="money">${fmt(p.mao)}</td>
          <td class="money ${spread>=0?'money-green':'money-red'}">${fmt(spread)}</td>
          <td>${p.dom||'—'}${p.dom>60?' 🔥':''}</td>
          <td>${p.beds}/${p.baths}</td><td>${(p.sqft||0).toLocaleString()}</td>
          <td>${(p.property_type||'').toUpperCase()}</td>
          <td>${(p.condition_estimate||'').replace(/_/g,' ')}</td>
          <td>${p.adu_potential ? badge('ADU','green') : ''}</td>
          <td>${badge(p.status, propStatusColor(p.status))}</td>
          <td>${badge(matchCount, 'blue')}</td>
          <td style="white-space:nowrap;"><a href="/properties/${p.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteProperty(${p.id})">Del</button></td>
        </tr>`;
      }).join('')}
      ${filtered.length===0?'<tr><td colspan="13" class="text-muted" style="text-align:center;padding:24px;">No properties found.</td></tr>':''}
    </table></div>`;

    setTimeout(() => makeSortable('tbl-properties'), 0);
}

window.filterProps = () => {
    const params = new URLSearchParams();
    const v = (id) => document.getElementById(id).value;
    if (v('fp-search')) params.set('search', v('fp-search'));
    if (v('fp-status')) params.set('status', v('fp-status'));
    if (v('fp-condition')) params.set('condition', v('fp-condition'));
    if (v('fp-zip')) params.set('zip', v('fp-zip'));
    if (v('fp-maxprice')) params.set('max_price', v('fp-maxprice'));
    if (v('fp-mindom')) params.set('min_dom', v('fp-mindom'));
    navigate('/properties' + (params.toString() ? '?' + params : ''));
};

window.exportProperties = async () => {
    const { data } = await db.from('properties').select('*').limit(10000);
    if (data) exportCSV(data, 'properties.csv');
};

// ── Property Form ───────────────────────────────────────────────────────────
async function renderPropertyForm(id) {
    let prop = null;
    if (id) {
        const { data } = await db.from('properties').select('*').eq('id', id).single();
        prop = data;
    }
    const v = (f) => prop ? (prop[f] ?? '') : '';
    const sel = (f, val) => prop && prop[f] === val ? 'selected' : '';
    const chk = (f) => prop && prop[f] ? 'checked' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id ? 'Edit' : 'Add New'} Property</h1>
    <form class="card" id="propForm">
      <div class="form-grid">
        <div class="form-group"><label>Address *</label><input type="text" name="address" value="${v('address')}" required></div>
        <div class="form-group"><label>City</label><input type="text" name="city" value="${v('city')}"></div>
        <div class="form-group"><label>Zip Code</label><input type="text" name="zip_code" value="${v('zip_code')}"></div>
        <div class="form-group"><label>Source</label><select name="source">${['mls','redfin','off_market','driving','referral'].map(s=>`<option value="${s}" ${sel('source',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>List Price ($)</label><input type="number" name="list_price" value="${v('list_price')}"></div>
        <div class="form-group"><label>Original List Price ($)</label><input type="number" name="original_list_price" value="${v('original_list_price')}"></div>
        <div class="form-group"><label>Days on Market</label><input type="number" name="dom" value="${v('dom')}"></div>
        <div class="form-group"><label>Price Reductions</label><input type="number" name="price_reductions" value="${v('price_reductions')||0}"></div>
        <div class="form-group"><label>Beds</label><input type="number" name="beds" value="${v('beds')}"></div>
        <div class="form-group"><label>Baths</label><input type="number" name="baths" value="${v('baths')}" step="0.5"></div>
        <div class="form-group"><label>Sqft</label><input type="number" name="sqft" value="${v('sqft')}"></div>
        <div class="form-group"><label>Lot Sqft</label><input type="number" name="lot_sqft" value="${v('lot_sqft')}" id="lot_sqft"></div>
        <div class="form-group"><label>Year Built</label><input type="number" name="year_built" value="${v('year_built')}"></div>
        <div class="form-group"><label>Property Type</label><select name="property_type" id="property_type">${['sfr','multi','land','condo'].map(s=>`<option value="${s}" ${sel('property_type',s)}>${s.toUpperCase()}</option>`).join('')}</select></div>
        <div class="form-group"><label>Condition</label><select name="condition_estimate">${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${sel('condition_estimate',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Status</label><select name="status">${['identified','analyzed','agent_contacted','offer_submitted','under_contract','closed','dead'].map(s=>`<option value="${s}" ${sel('status',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
      </div>
      <div class="section-title" style="margin-top:16px;">Deal Analysis</div>
      <div class="form-grid">
        <div class="form-group"><label>ARV ($)</label><input type="number" name="arv" id="arv" value="${v('arv')}" oninput="calcMAO()"></div>
        <div class="form-group"><label>Rehab Low ($)</label><input type="number" name="rehab_estimate_low" value="${v('rehab_estimate_low')}"></div>
        <div class="form-group"><label>Rehab High ($)</label><input type="number" name="rehab_estimate_high" id="rehab_high" value="${v('rehab_estimate_high')}" oninput="calcMAO()"></div>
        <div class="form-group"><label>MAO (auto: ARV×0.70 − Rehab High)</label><input type="number" name="mao" id="mao" value="${v('mao')}" readonly style="background:var(--bg);font-weight:700;color:var(--green);"></div>
        <div class="form-group"><label>Est. Monthly Rent ($)</label><input type="number" name="estimated_monthly_rent" value="${v('estimated_monthly_rent')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="adu_potential" id="adu_chk" ${chk('adu_potential')}> ADU Potential</label></div>
        <div class="form-group full"><label>Comp Addresses</label><textarea name="comp_addresses">${v('comp_addresses')}</textarea></div>
      </div>
      <div class="section-title">Listing Agent</div>
      <div class="form-grid">
        <div class="form-group"><label>Agent Name</label><input type="text" name="listing_agent_name" value="${v('listing_agent_name')}"></div>
        <div class="form-group"><label>Agent Phone</label><input type="text" name="listing_agent_phone" value="${v('listing_agent_phone')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="listing_agent_contacted" ${chk('listing_agent_contacted')}> Agent Contacted</label></div>
      </div>
      <div class="form-group" style="margin-top:12px;"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveProperty('save_add')">Save & Add Another</button>
        <a href="/properties" class="btn">Cancel</a>
        ${id ? `<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteProperty(${id})">Delete</button>` : ''}
      </div>
    </form>`;

    document.getElementById('propForm').addEventListener('submit', e => { e.preventDefault(); saveProperty('save'); });
    window._editPropId = id || null;

    // Wire up ADU auto-check
    document.getElementById('lot_sqft').addEventListener('input', autoADU);
    document.getElementById('property_type').addEventListener('change', autoADU);
    calcMAO();
}

window.calcMAO = () => {
    const arv = parseInt(document.getElementById('arv')?.value) || 0;
    const rehab = parseInt(document.getElementById('rehab_high')?.value) || 0;
    if (arv > 0) document.getElementById('mao').value = Math.round(arv * 0.70 - rehab);
};

function autoADU() {
    const lot = parseInt(document.getElementById('lot_sqft')?.value) || 0;
    const ptype = document.getElementById('property_type')?.value;
    document.getElementById('adu_chk').checked = (lot > 5000 && ptype === 'sfr');
}

window.saveProperty = async (action) => {
    const form = document.getElementById('propForm');
    const fd = new FormData(form);
    const int = (k) => fd.get(k) ? parseInt(fd.get(k)) : null;
    const float = (k) => fd.get(k) ? parseFloat(fd.get(k)) : null;
    const arv = int('arv');
    const rehab_high = int('rehab_estimate_high');
    const lot_sqft = int('lot_sqft');
    const ptype = fd.get('property_type');

    const data = {
        address: fd.get('address'), city: fd.get('city') || null, zip_code: fd.get('zip_code') || null,
        list_price: int('list_price'), original_list_price: int('original_list_price'),
        dom: int('dom'), price_reductions: int('price_reductions') || 0,
        beds: int('beds'), baths: float('baths'), sqft: int('sqft'), lot_sqft,
        year_built: int('year_built'), property_type: ptype,
        condition_estimate: fd.get('condition_estimate'),
        arv, rehab_estimate_low: int('rehab_estimate_low'), rehab_estimate_high: rehab_high,
        mao: (arv && rehab_high != null) ? Math.round(arv * 0.70 - rehab_high) : null,
        estimated_monthly_rent: int('estimated_monthly_rent'),
        adu_potential: form.querySelector('[name=adu_potential]').checked || (lot_sqft > 5000 && ptype === 'sfr'),
        comp_addresses: fd.get('comp_addresses') || null,
        listing_agent_name: fd.get('listing_agent_name') || null,
        listing_agent_phone: fd.get('listing_agent_phone') || null,
        listing_agent_contacted: form.querySelector('[name=listing_agent_contacted]').checked,
        source: fd.get('source'), status: fd.get('status'), notes: fd.get('notes') || null,
    };

    const id = window._editPropId;
    const result = id
        ? await db.from('properties').update(data).eq('id', id)
        : await db.from('properties').insert(data);

    if (result.error) { flash(result.error.message, 'error'); return; }
    invalidateCache('properties');
    flash(id ? 'Property updated' : 'Property added');
    if (action === 'save_add') navigate('/properties/new');
    else navigate(id ? `/properties/${id}` : '/properties');
};

window.deleteProperty = async (id) => {
    if (!confirm('Delete this property?')) return;
    await db.from('properties').delete().eq('id', id);
    invalidateCache('properties');
    flash('Property deleted');
    navigate('/properties');
};

// ── Property Detail ─────────────────────────────────────────────────────────
async function renderPropertyDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: prop }, { data: allBuyers }, { data: activities }] = await Promise.all([
        db.from('properties').select('*').eq('id', id).single(),
        db.from('buyers').select('*').limit(10000),
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10000)
    ]);

    if (!prop) { flash('Property not found', 'error'); navigate('/properties'); return; }
    const matches = getMatchingBuyers(prop, allBuyers || []);
    const propActivities = (activities||[]).filter(a =>
        (a.description||'').includes(prop.address) ||
        (a.contact_type === 'listing_agent' && prop.listing_agent_name)
    );
    const spread = (prop.mao||0) - (prop.list_price||0);

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${prop.address}</h1><div class="text-muted">${prop.city||''} ${prop.zip_code||''}</div></div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=listing_agent&property_id=${prop.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/properties/${prop.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">List Price</div><div class="value money">${fmt(prop.list_price)}</div>${prop.original_list_price && prop.original_list_price !== prop.list_price ? `<div class="sub">was ${fmt(prop.original_list_price)} (${prop.price_reductions} reduction${prop.price_reductions!==1?'s':''})</div>` : ''}</div>
      <div class="stat"><div class="label">MAO</div><div class="value money" style="color:var(--green)">${fmt(prop.mao)}</div><div class="sub">ARV ${fmt(prop.arv)} × 70% − ${fmt(prop.rehab_estimate_high)}</div></div>
      <div class="stat"><div class="label">Spread</div><div class="value money ${spread>=0?'money-green':'money-red'}">${fmt(spread)}</div><div class="sub">${spread>=0?'below MAO ✓':'above MAO'}</div></div>
      <div class="stat"><div class="label">DOM</div><div class="value">${prop.dom||'—'}</div><div class="sub">${prop.dom>90?'very motivated 🔥🔥':prop.dom>60?'likely motivated 🔥':prop.dom>30?'moderate':'fresh'}</div></div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Type</div><div class="value">${(prop.property_type||'').toUpperCase()}</div></div>
      <div class="field"><div class="label">Condition</div><div class="value">${(prop.condition_estimate||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Beds/Baths</div><div class="value">${prop.beds} bd / ${prop.baths} ba</div></div>
      <div class="field"><div class="label">Sqft</div><div class="value">${(prop.sqft||0).toLocaleString()}</div></div>
      <div class="field"><div class="label">Lot</div><div class="value">${(prop.lot_sqft||0).toLocaleString()} sqft${prop.adu_potential ? ' '+badge('ADU Potential','green') : ''}</div></div>
      <div class="field"><div class="label">Year Built</div><div class="value">${prop.year_built||'—'}</div></div>
      <div class="field"><div class="label">Rehab Range</div><div class="value money">${fmt(prop.rehab_estimate_low)} – ${fmt(prop.rehab_estimate_high)}</div></div>
      <div class="field"><div class="label">Est. Rent</div><div class="value money">${prop.estimated_monthly_rent ? fmt(prop.estimated_monthly_rent)+'/mo' : '—'}</div></div>
      <div class="field"><div class="label">Source</div><div class="value">${(prop.source||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${badge(prop.status, propStatusColor(prop.status))}</div></div>
    </div>
    ${prop.notes ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${prop.notes}</div></div>` : ''}
    </div>
    ${prop.listing_agent_name ? `<div class="card"><h2>Listing Agent</h2><div class="detail-grid">
      <div class="field"><div class="label">Name</div><div class="value">${prop.listing_agent_name}</div></div>
      <div class="field"><div class="label">Phone</div><div class="value">${prop.listing_agent_phone||'—'}</div></div>
      <div class="field"><div class="label">Contacted</div><div class="value">${prop.listing_agent_contacted?'✓ Yes':'✗ Not yet'}</div></div>
    </div></div>` : ''}

    <div class="section-title">Matching Buyers (${matches.length})</div>
    ${matches.length ? `<div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Name</th><th>Strategy</th><th>Funding</th><th>Price Range</th><th>Condition</th><th>POF</th><th>Deals</th><th>Status</th><th>Contact</th></tr>
      ${matches.map(b => `<tr>
        <td><a href="/buyers/${b.id}"><strong>${b.name}</strong></a>${b.entity_name?'<br><span class="text-muted text-sm">'+b.entity_name+'</span>':''}</td>
        <td>${b.strategy==='brrrr'?'BRRRR':(b.strategy||'').replace(/_/g,' ')}</td>
        <td>${(b.funding_method||'').replace(/_/g,' ')}</td>
        <td class="money">${fmt(b.min_price)}–${fmt(b.max_price)}</td>
        <td>${(b.condition_tolerance||'').replace(/_/g,' ')}</td>
        <td>${b.proof_of_funds_verified?badge('✓','green'):'–'}</td>
        <td>${b.deals_last_12_months}</td>
        <td>${badge(b.status, buyerStatusColor(b.status))}</td>
        <td>${(b.preferred_contact||'')+': '+(b.phone||b.email||'—')}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No matching buyers found.</div>'}

    <div class="section-title">Activity Log</div>
    ${propActivities.length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${propActivities.map(a => `<tr>
        <td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td>
        <td>${badge(a.activity_type,'blue')}</td>
        <td>${a.description||''}</td>
        <td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Contacts List ───────────────────────────────────────────────────────────
async function renderContactsList(params) {
    if (!_cache.contacts) {
        app.innerHTML = '<div class="loading">Loading contacts…</div>';
        const { data: contacts } = await db.from('contacts').select('*').order('name').limit(10000);
        _cache.contacts = contacts || [];
    }
    const contacts = _cache.contacts;
    let filtered = [...contacts];
    const search = params?.get('search');
    const role = params?.get('role');
    const batch = params?.get('batch');
    if (search) filtered = filtered.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (role) filtered = filtered.filter(c => c.role === role);
    if (batch) filtered = filtered.filter(c => c.import_batch === batch);

    const batches = [...new Set((contacts || []).map(c => c.import_batch).filter(Boolean))].sort();

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Contacts</h1>
      <div class="flex gap-2">
        <button class="btn btn-sm" onclick="exportContacts()">Export CSV</button>
        <button class="btn btn-sm" onclick="document.getElementById('propstream-file').click()" style="background:var(--orange);border-color:var(--orange);color:#fff;">Import PropStream</button>
        <input type="file" id="propstream-file" accept=".csv" style="display:none" onchange="handlePropStreamImport(this)">
        <a href="/contacts/new" class="btn btn-sm btn-primary">+ Add Contact</a>
      </div>
    </div>
    <div class="filters">
      <input type="text" id="fc-search" placeholder="Search name…" value="${search||''}">
      <select id="fc-role"><option value="">All Roles</option>${['listing_agent','contractor','attorney','property_manager','title_company','other'].map(s=>`<option value="${s}" ${role===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      ${batches.length ? `<select id="fc-batch"><option value="">All Imports</option>${batches.map(b => `<option value="${b}" ${batch===b?'selected':''}>${b}</option>`).join('')}</select>` : ''}
      <button class="btn btn-sm" onclick="filterContacts()">Filter</button>
      <a href="/contacts" class="btn btn-sm">Clear</a>
      ${batch ? `<button class="btn btn-sm" onclick="renameBatch('contacts','${batch.replace(/'/g,"\\'")}')" style="margin-left:4px;">Rename "${batch}"</button>
      <button class="btn btn-sm btn-danger" onclick="deleteBatch('contacts','${batch.replace(/'/g,"\\'")}')" >Delete Batch</button>` : ''}
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table id="tbl-contacts">
      <tr><th data-sort="Name">Name</th><th data-sort="Role">Role</th><th data-sort="Company">Company</th><th>Phone</th><th>Email</th><th data-sort="Followup" data-type="date">Next F/U</th>${batches.length ? '<th data-sort="Import">Import</th>' : ''}<th></th></tr>
      ${filtered.map(c => `<tr data-row data-sortName="${(c.name||'').replace(/"/g,'&quot;')}" data-sortRole="${c.role||''}" data-sortCompany="${(c.company||'').replace(/"/g,'&quot;')}" data-sortFollowup="${c.next_followup||''}" ${batches.length ? `data-sortImport="${c.import_batch||''}"` : ''}>
        <td><a href="/contacts/${c.id}"><strong>${c.name}</strong></a></td>
        <td>${badge(c.role,'orange')}</td><td>${c.company||'—'}</td>
        <td>${c.phone||'—'}</td><td>${c.email||'—'}</td>
        <td>${c.next_followup||'—'}</td>
        ${batches.length ? `<td class="text-sm text-muted">${c.import_batch || ''}</td>` : ''}
        <td style="white-space:nowrap;"><a href="/contacts/${c.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteContact(${c.id})">Del</button></td>
      </tr>`).join('')}
      ${filtered.length===0?`<tr><td colspan="${batches.length ? 8 : 7}" class="text-muted" style="text-align:center;padding:24px;">No contacts.</td></tr>`:''}
    </table></div>`;

    setTimeout(() => makeSortable('tbl-contacts'), 0);
}

window.filterContacts = () => {
    const params = new URLSearchParams();
    if (document.getElementById('fc-search').value) params.set('search', document.getElementById('fc-search').value);
    if (document.getElementById('fc-role').value) params.set('role', document.getElementById('fc-role').value);
    const b = document.getElementById('fc-batch')?.value; if (b) params.set('batch', b);
    navigate('/contacts' + (params.toString() ? '?' + params : ''));
};
window.exportContacts = async () => {
    const { data } = await db.from('contacts').select('*').limit(10000);
    if (data) exportCSV(data, 'contacts.csv');
};

// ── PropStream CSV Import ───────────────────────────────────────────────────
window.handlePropStreamImport = (input) => {
    const file = input.files[0];
    if (!file) return;
    const batchName = file.name.replace(/\.csv$/i, '');
    const reader = new FileReader();
    reader.onload = (e) => {
        const rows = parsePropStreamCSV(e.target.result);
        if (!rows.length) { flash('No data found in CSV', 'error'); return; }
        showPropStreamPreview(rows, batchName);
    };
    reader.readAsText(file);
    input.value = '';
};

function parsePropStreamCSV(text) {
    // Parse CSV respecting quoted fields
    const lines = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuote && text[i + 1] === '"') { current += '"'; i++; }
            else inQuote = !inQuote;
        } else if ((ch === '\n' || ch === '\r') && !inQuote) {
            if (current.length > 0) lines.push(current);
            current = '';
            if (ch === '\r' && text[i + 1] === '\n') i++;
        } else {
            current += ch;
        }
    }
    if (current.length > 0) lines.push(current);

    if (lines.length < 2) return [];

    // Split each line into fields
    function splitRow(line) {
        const fields = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { field += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                fields.push(field);
                field = '';
            } else {
                field += ch;
            }
        }
        fields.push(field);
        return fields;
    }

    const headers = splitRow(lines[0]).map(h => h.trim());
    const col = (name) => headers.indexOf(name);

    // Group by owner (Company Name) to deduplicate and aggregate properties
    const ownerMap = new Map();

    for (let i = 1; i < lines.length; i++) {
        const f = splitRow(lines[i]);
        const get = (name) => (f[col(name)] || '').trim();

        const companyName = get('Company Name');
        const firstName = get('First Name');
        const lastName = get('Last Name');
        const name = companyName || [firstName, lastName].filter(Boolean).join(' ');
        if (!name) continue;

        const address = get('Street Address');
        const city = get('City');
        const state = get('State');
        const zip = get('Zip');
        const propAddr = [address, city, state, zip].filter(Boolean).join(', ');

        const mailAddr = [get('Mail Street Address'), get('Mail City'), get('Mail State'), get('Mail Zip')].filter(Boolean).join(', ');

        // Collect all phones (non-empty, skip DNC)
        const phones = [];
        for (let p = 1; p <= 5; p++) {
            const num = get(`Phone ${p}`);
            const dnc = get(`Phone ${p} DNC`);
            if (num && !dnc.includes('DNC')) phones.push(num);
        }
        // Also collect DNC phones separately for notes
        const dncPhones = [];
        for (let p = 1; p <= 5; p++) {
            const num = get(`Phone ${p}`);
            const dnc = get(`Phone ${p} DNC`);
            if (num && dnc.includes('DNC')) dncPhones.push(num);
        }

        // Collect emails
        const emails = [];
        for (let e = 1; e <= 4; e++) {
            const em = get(`Email ${e}`);
            if (em) emails.push(em);
        }

        const key = name.toLowerCase();
        if (!ownerMap.has(key)) {
            ownerMap.set(key, {
                name,
                firstName, lastName,
                phones: [], dncPhones: [],
                emails: [],
                addresses: [],
                mailAddr: mailAddr || null,
                type: get('Type'),
                status: get('Status'),
                portfolioTier: get('Portfolio Tier') || null,
            });
        }
        const owner = ownerMap.get(key);
        if (propAddr && !owner.addresses.includes(propAddr)) owner.addresses.push(propAddr);
        // Update tier if this row has one and existing doesn't
        if (!owner.portfolioTier && get('Portfolio Tier')) owner.portfolioTier = get('Portfolio Tier');
        phones.forEach(p => { if (!owner.phones.includes(p)) owner.phones.push(p); });
        dncPhones.forEach(p => { if (!owner.dncPhones.includes(p)) owner.dncPhones.push(p); });
        emails.forEach(e => { if (!owner.emails.includes(e)) owner.emails.push(e); });
    }

    return Array.from(ownerMap.values());
}

function showPropStreamPreview(owners, batchName) {
    // Build notes for each contact
    const contacts = owners.map(o => {
        const noteParts = [];
        if (o.firstName || o.lastName) noteParts.push(`Contact: ${[o.firstName, o.lastName].filter(Boolean).join(' ')}`);
        if (o.portfolioTier) noteParts.push(`Portfolio: ${o.portfolioTier} properties`);
        if (o.addresses.length) noteParts.push(`Property addresses:\n${o.addresses.join('\n')}`);
        if (o.mailAddr) noteParts.push(`Mail: ${o.mailAddr}`);
        if (o.emails.length > 1) noteParts.push(`Other emails: ${o.emails.slice(1).join(', ')}`);
        if (o.dncPhones.length) noteParts.push(`DNC phones: ${o.dncPhones.join(', ')}`);
        if (o.phones.length > 1) noteParts.push(`Other phones: ${o.phones.slice(1).join(', ')}`);
        noteParts.push(`Source: PropStream (${o.type || '—'})`);

        return {
            name: o.name,
            phone: o.phones[0] || null,
            email: o.emails[0] || null,
            role: 'other',
            company: null,
            notes: noteParts.join('\n'),
            portfolioTier: o.portfolioTier,
        };
    });

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Import PropStream Contacts</h1>
      <div class="flex gap-2">
        <button class="btn btn-primary" onclick="confirmPropStreamImport()">Import ${contacts.length} Contacts</button>
        <a href="/contacts" class="btn">Cancel</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div class="text-sm text-muted">
        Found <strong style="color:var(--text)">${contacts.length}</strong> unique contacts from CSV.
        Duplicate rows (same name) have been merged.
        Phones marked DNC are excluded from the primary phone and noted separately.
        <br>Import batch: <strong style="color:var(--accent)">${batchName}</strong> — you can rename this later from the Contacts list filter.
      </div>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th style="width:30px;"><input type="checkbox" id="ps-check-all" checked onchange="toggleAllPropStream(this.checked)"></th><th>Name</th><th>Portfolio</th><th>Phone</th><th>Email</th><th>Notes Preview</th></tr>
      ${contacts.map((c, i) => `<tr>
        <td><input type="checkbox" class="ps-row-check" data-idx="${i}" checked></td>
        <td><strong>${c.name}</strong></td>
        <td>${c.portfolioTier ? badge(c.portfolioTier, tierColor(c.portfolioTier)) : '—'}</td>
        <td>${c.phone || '—'}</td>
        <td>${c.email || '—'}</td>
        <td class="text-sm text-muted" style="max-width:300px;white-space:pre-wrap;">${(c.notes || '').slice(0, 120)}${c.notes.length > 120 ? '…' : ''}</td>
      </tr>`).join('')}
    </table></div>`;

    window._propStreamContacts = contacts;
    window._propStreamContactBatch = batchName;
}

window.toggleAllPropStream = (checked) => {
    document.querySelectorAll('.ps-row-check').forEach(cb => cb.checked = checked);
};

window.confirmPropStreamImport = async () => {
    const contacts = window._propStreamContacts;
    const batchName = window._propStreamContactBatch || 'import';
    if (!contacts) return;

    // Get selected indices
    const selected = [];
    document.querySelectorAll('.ps-row-check:checked').forEach(cb => {
        selected.push(parseInt(cb.dataset.idx));
    });

    if (selected.length === 0) { flash('No contacts selected', 'error'); return; }

    const toInsert = selected.map(i => ({
        name: contacts[i].name,
        phone: contacts[i].phone,
        email: contacts[i].email,
        role: contacts[i].role,
        company: contacts[i].company,
        notes: contacts[i].notes,
        import_batch: batchName,
    }));

    // Batch insert in chunks of 50
    let inserted = 0;
    let errors = 0;
    const chunkSize = 50;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await db.from('contacts').insert(chunk);
        if (error) { errors++; console.error('Import chunk error:', error); }
        else inserted += chunk.length;
    }

    if (errors) flash(`Imported ${inserted} contacts (${errors} chunk(s) had errors)`, 'error');
    else flash(`Imported ${inserted} contacts from PropStream → "${batchName}"`);
    invalidateCache('contacts');
    navigate('/contacts?batch=' + encodeURIComponent(batchName));
};

// ── Batch Management (shared by buyers + contacts) ──────────────────────────
window.renameBatch = async (table, oldName) => {
    const newName = prompt(`Rename import batch "${oldName}" to:`, oldName);
    if (!newName || newName === oldName) return;
    const { error } = await db.from(table).update({ import_batch: newName }).eq('import_batch', oldName);
    if (error) { flash(error.message, 'error'); return; }
    invalidateCache(table);
    flash(`Renamed "${oldName}" → "${newName}"`);
    navigate(`/${table}?batch=${encodeURIComponent(newName)}`);
};

window.deleteBatch = async (table, batchName) => {
    const { data } = await db.from(table).select('id').eq('import_batch', batchName);
    const count = (data || []).length;
    if (!confirm(`Delete all ${count} records in batch "${batchName}"? This cannot be undone.`)) return;
    if (table === 'buyers') {
        // Also delete related activity logs
        for (const row of (data || [])) {
            await db.from('activity_log').delete().eq('contact_type', 'buyer').eq('contact_id', row.id);
        }
    }
    const { error } = await db.from(table).delete().eq('import_batch', batchName);
    if (error) { flash(error.message, 'error'); return; }
    invalidateCache(table);
    flash(`Deleted ${count} records from batch "${batchName}"`);
    navigate(`/${table}`);
};

// ── Contact Form ────────────────────────────────────────────────────────────
async function renderContactForm(id) {
    let contact = null;
    if (id) { const { data } = await db.from('contacts').select('*').eq('id', id).single(); contact = data; }
    const v = (f) => contact ? (contact[f] ?? '') : '';
    const sel = (f, val) => contact && contact[f] === val ? 'selected' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id?'Edit':'Add New'} Contact</h1>
    <form class="card" id="contactForm">
      <div class="form-grid">
        <div class="form-group"><label>Name *</label><input type="text" name="name" value="${v('name')}" required></div>
        <div class="form-group"><label>Role</label><select name="role">${['listing_agent','contractor','attorney','property_manager','title_company','other'].map(s=>`<option value="${s}" ${sel('role',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Phone</label><input type="text" name="phone" value="${v('phone')}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${v('email')}"></div>
        <div class="form-group"><label>Company</label><input type="text" name="company" value="${v('company')}"></div>
        <div class="form-group"><label>Next Follow-up</label><input type="date" name="next_followup" value="${v('next_followup')}"></div>
        <div class="form-group"><label>Last Contacted</label><input type="date" name="last_contacted" value="${v('last_contacted')}"></div>
        <div class="form-group full"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveContact('save_add')">Save & Add Another</button>
        <a href="/contacts" class="btn">Cancel</a>
        ${id?`<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteContact(${id})">Delete</button>`:''}
      </div>
    </form>`;
    document.getElementById('contactForm').addEventListener('submit', e => { e.preventDefault(); saveContact('save'); });
    window._editContactId = id || null;
}

window.saveContact = async (action) => {
    const fd = new FormData(document.getElementById('contactForm'));
    const data = { name: fd.get('name'), phone: fd.get('phone')||null, email: fd.get('email')||null, role: fd.get('role'), company: fd.get('company')||null, notes: fd.get('notes')||null, last_contacted: fd.get('last_contacted')||null, next_followup: fd.get('next_followup')||null };
    const id = window._editContactId;
    const result = id ? await db.from('contacts').update(data).eq('id', id) : await db.from('contacts').insert(data);
    if (result.error) { flash(result.error.message, 'error'); return; }
    invalidateCache('contacts');
    flash(id ? 'Contact updated' : 'Contact added');
    if (action === 'save_add') navigate('/contacts/new');
    else navigate(id ? `/contacts/${id}` : '/contacts');
};

window.deleteContact = async (id) => {
    if (!confirm('Delete?')) return;
    await db.from('contacts').delete().eq('id', id);
    invalidateCache('contacts');
    flash('Contact deleted'); navigate('/contacts');
};

// ── Contact Detail ──────────────────────────────────────────────────────────
async function renderContactDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: contact }, { data: activities }] = await Promise.all([
        db.from('contacts').select('*').eq('id', id).single(),
        db.from('activity_log').select('*').in('contact_type', ['listing_agent','other']).eq('contact_id', id).order('created_at', { ascending: false }).limit(10000)
    ]);
    if (!contact) { flash('Contact not found','error'); navigate('/contacts'); return; }

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${contact.name}</h1><div class="text-muted">${badge(contact.role,'orange')} ${contact.company?'— '+contact.company:''}</div></div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=listing_agent&contact_id=${contact.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/contacts/${contact.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Phone</div><div class="value">${contact.phone||'—'}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${contact.email||'—'}</div></div>
      <div class="field"><div class="label">Next Follow-up</div><div class="value">${contact.next_followup||'—'}</div></div>
      <div class="field"><div class="label">Last Contacted</div><div class="value">${contact.last_contacted||'—'}</div></div>
    </div>
    ${contact.notes?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${contact.notes}</div></div>`:''}
    </div>
    <div class="section-title">Activity Log</div>
    ${(activities||[]).length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${activities.map(a=>`<tr><td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td><td>${badge(a.activity_type,'blue')}</td><td>${a.description||''}</td><td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td></tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Activities List ─────────────────────────────────────────────────────────
async function renderActivitiesList(params) {
    app.innerHTML = '<div class="loading">Loading activities…</div>';
    const [{ data: activities }, { data: buyers }, { data: contacts }] = await Promise.all([
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
        db.from('buyers').select('id,name').limit(10000),
        db.from('contacts').select('id,name').limit(10000)
    ]);

    let filtered = activities || [];
    const ct = params?.get('contact_type');
    const at = params?.get('activity_type');
    if (ct) filtered = filtered.filter(a => a.contact_type === ct);
    if (at) filtered = filtered.filter(a => a.activity_type === at);

    const bMap = Object.fromEntries((buyers||[]).map(b=>[b.id,b.name]));
    const cMap = Object.fromEntries((contacts||[]).map(c=>[c.id,c.name]));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Activity Log</h1>
      <a href="/activities/new" class="btn btn-sm btn-primary">+ Log Activity</a>
    </div>
    <div class="filters">
      <select id="fa-ct"><option value="">All Types</option>${['buyer','listing_agent','seller','other'].map(s=>`<option value="${s}" ${ct===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <select id="fa-at"><option value="">All Activities</option>${['call','text','email','meeting','offer_submitted','offer_accepted','offer_rejected','note'].map(s=>`<option value="${s}" ${at===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <button class="btn btn-sm" onclick="filterActs()">Filter</button>
      <a href="/activities" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table id="tbl-activities">
      <tr><th data-sort="When" data-type="date">When</th><th data-sort="Type">Type</th><th data-sort="Who">Who</th><th data-sort="Activity">Activity</th><th>Description</th><th data-sort="Followup" data-type="date">Follow-up</th></tr>
      ${filtered.map(a => {
        let name = '', url = '#';
        if (a.contact_type==='buyer') { name = bMap[a.contact_id]||''; url = `/buyers/${a.contact_id}`; }
        else { name = cMap[a.contact_id]||''; url = `/contacts/${a.contact_id}`; }
        return `<tr data-row data-sortWhen="${(a.created_at||'').slice(0,16)}" data-sortType="${a.contact_type||''}" data-sortWho="${(name||'').replace(/"/g,'&quot;')}" data-sortActivity="${a.activity_type||''}" data-sortFollowup="${a.followup_date||''}">
          <td class="text-sm text-muted" style="white-space:nowrap;">${(a.created_at||'').slice(0,16)}</td>
          <td>${badge(a.contact_type,'gray')}</td>
          <td>${name?`<a href="${url}">${name}</a>`:'—'}</td>
          <td>${badge(a.activity_type,'blue')}</td>
          <td>${a.description||''}</td>
          <td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td>
        </tr>`;
      }).join('')}
      ${filtered.length===0?'<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px;">No activities.</td></tr>':''}
    </table></div>`;

    setTimeout(() => makeSortable('tbl-activities'), 0);
}

window.filterActs = () => {
    const params = new URLSearchParams();
    if (document.getElementById('fa-ct').value) params.set('contact_type', document.getElementById('fa-ct').value);
    if (document.getElementById('fa-at').value) params.set('activity_type', document.getElementById('fa-at').value);
    navigate('/activities' + (params.toString() ? '?' + params : ''));
};

// ── Activity Form ───────────────────────────────────────────────────────────
async function renderActivityForm(params) {
    const [{ data: buyers }, { data: contacts }, { data: allActivities }] = await Promise.all([
        db.from('buyers').select('*').order('name').limit(10000),
        db.from('contacts').select('id,name,role').order('name').limit(10000),
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10000)
    ]);

    const preType = params?.get('contact_type') || '';
    const preId = params?.get('contact_id') || '';

    // Find the pre-selected buyer if applicable
    let preBuyer = null;
    let buyerActivities = [];
    if (preType === 'buyer' && preId) {
        preBuyer = (buyers || []).find(b => String(b.id) === preId);
        buyerActivities = (allActivities || []).filter(a => a.contact_type === 'buyer' && String(a.contact_id) === preId);
    }

    // Determine sequence step for new/contacted buyers
    let seqStep = null;
    let seqNext = null;
    if (preBuyer && ['new', 'contacted'].includes(preBuyer.status)) {
        const callCount = buyerActivities.filter(a => a.activity_type === 'call').length;
        const textCount = buyerActivities.filter(a => a.activity_type === 'text').length;
        const totalTouches = buyerActivities.length;

        if (callCount === 0) { seqStep = 1; seqNext = 'day1_call'; }
        else if (textCount === 0) { seqStep = 2; seqNext = 'day3_text'; }
        else if (callCount === 1) { seqStep = 3; seqNext = 'day7_call'; }
        else if (textCount === 1) { seqStep = 4; seqNext = 'day14_text'; }
        else { seqStep = 5; seqNext = 'done'; }
    }

    const showSequence = preBuyer && seqNext && seqNext !== 'done';
    const buyerFirstName = preBuyer ? (preBuyer.name || '').split(/[\s,]+/)[0] : '';

    // Sequence info
    const seqSteps = [
        { step: 1, label: 'Day 1: Call', desc: 'Leave voicemail if no answer', type: 'call' },
        { step: 2, label: 'Day 3: Text', desc: 'Intro text message', type: 'text' },
        { step: 3, label: 'Day 7: 2nd Call', desc: 'Different time of day', type: 'call' },
        { step: 4, label: 'Day 14: Final Text', desc: 'Soft close / leave door open', type: 'text' },
    ];

    // Follow-up date calculations
    const todayDate = new Date();
    const addDays = (d) => new Date(todayDate.getTime() + d * 86400000).toISOString().slice(0, 10);

    // Text templates
    const day3Text = `Hey ${buyerFirstName}, this is Dimitri with Dimalytics. I work with cash investors in the Sacramento/Placer area — if you're actively buying, I'd love to send you off-market leads that match your criteria. Worth a quick call?`;
    const day14Text = `Hey ${buyerFirstName}, just circling back one more time. If the timing isn't right, no worries. My number's here if you ever need deal flow in the Sacramento/Placer area.`;

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">Log Activity</h1>

    ${showSequence ? `
    <div class="card" style="margin-bottom:16px;">
      <h2>Outreach Sequence — ${preBuyer.name} ${badge(preBuyer.status, buyerStatusColor(preBuyer.status))}</h2>
      <div style="display:flex;gap:4px;margin:12px 0 16px;flex-wrap:wrap;">
        ${seqSteps.map(s => {
          const done = s.step < seqStep;
          const current = s.step === seqStep;
          const color = done ? 'var(--green)' : current ? 'var(--accent)' : 'var(--border)';
          const bg = done ? 'rgba(52,211,153,.1)' : current ? 'rgba(79,140,255,.15)' : 'transparent';
          return `<div style="flex:1;min-width:140px;padding:8px 12px;border:1px solid ${color};border-radius:var(--radius);background:${bg};font-size:12px;">
            <div style="font-weight:700;color:${done ? 'var(--green)' : current ? 'var(--accent)' : 'var(--text2)'}">${done ? '✓ ' : current ? '→ ' : ''}${s.label}</div>
            <div style="color:var(--text2);margin-top:2px;">${s.desc}</div>
          </div>`;
        }).join('')}
      </div>

      <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Call Outcome</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${seqNext === 'day3_text' || seqNext === 'day14_text' ? `
        <button class="btn" onclick="quickAction('send_text')" style="background:rgba(79,140,255,.15);border-color:var(--accent);color:var(--accent);">
          💬 Send Text${seqNext === 'day14_text' ? ' (Final)' : ''}
        </button>
        ` : ''}
        ${seqNext === 'day1_call' || seqNext === 'day7_call' ? `
        <button class="btn" onclick="quickAction('voicemail')" style="background:rgba(251,191,36,.15);border-color:var(--yellow);color:var(--yellow);">
          📵 Voicemail / No Answer
        </button>
        <button class="btn" onclick="quickAction('callback')" style="background:rgba(79,140,255,.15);border-color:var(--accent);color:var(--accent);">
          📞 Callback Requested
        </button>
        ` : ''}
        <button class="btn" onclick="quickAction('conversation_hot')" style="background:rgba(52,211,153,.15);border-color:var(--green);color:var(--green);">
          🔥 Conversation — Hot (gave criteria, wants deals)
        </button>
        <button class="btn" onclick="quickAction('conversation_warm')" style="background:rgba(251,191,36,.15);border-color:var(--yellow);color:var(--yellow);">
          🤝 Conversation — Warm (interested but vague)
        </button>
        <button class="btn" onclick="quickAction('not_interested')" style="background:rgba(139,144,165,.15);border-color:var(--text2);color:var(--text2);">
          🙅 Not Interested
        </button>
        <button class="btn" onclick="quickAction('not_investor')" style="background:rgba(251,146,60,.15);border-color:var(--orange);color:var(--orange);">
          🚫 Not an Investor → Marketing List
        </button>
        <button class="btn" onclick="quickAction('wrong_number')" style="background:rgba(248,113,113,.15);border-color:var(--red);color:var(--red);">
          ❌ Wrong Number / Bad Contact
        </button>
      </div>
    </div>
    ` : ''}

    <form class="card" id="actForm">
      <div class="form-grid">
        <div class="form-group"><label>Contact Type *</label>
          <select name="contact_type" id="act_ct" onchange="updateActContacts()" required>
            <option value="">Select…</option>
            <option value="buyer" ${preType==='buyer'?'selected':''}>Buyer</option>
            <option value="listing_agent" ${preType==='listing_agent'?'selected':''}>Listing Agent</option>
            <option value="seller" ${preType==='seller'?'selected':''}>Seller</option>
            <option value="other" ${preType==='other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="form-group"><label>Contact *</label><select name="contact_id" id="act_cid" required><option value="">Select type first…</option></select></div>
        <div class="form-group"><label>Activity Type *</label><select name="activity_type" id="act_atype">${['call','text','email','meeting','offer_submitted','offer_accepted','offer_rejected','note'].map(s=>`<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Call Outcome</label>
          <select name="call_outcome" id="act_outcome">
            <option value="">— N/A —</option>
            ${['conversation','voicemail','wrong_number','not_interested','callback_requested'].map(s=>`<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Contact Classification</label>
          <select name="contact_class" id="act_class">
            <option value="">— Unknown —</option>
            <option value="investor">Investor</option>
            <option value="not_investor">Not an Investor</option>
          </select>
        </div>
        <div class="form-group"><label>Engagement Level</label>
          <select name="engagement" id="act_engagement">
            <option value="">— N/A —</option>
            <option value="hot">🔥 Hot — gave criteria, wants deals</option>
            <option value="warm">🤝 Warm — interested but vague</option>
            <option value="cold">❄️ Cold — not interested / unreachable</option>
          </select>
        </div>
        <div class="form-group"><label>Follow-up Date</label><input type="date" name="followup_date" id="act_fdate"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="followup_needed" id="act_fchk"> Follow-up Needed</label></div>
        <div class="form-group full"><label>Notes / Intel *</label><textarea name="description" id="act_desc" required placeholder="What happened? Areas they mentioned, properties discussed, partners, complaints about other agents/wholesalers, anything specific…" style="min-height:100px;"></textarea></div>
        <div class="form-group"><label>Update Buyer Status</label>
          <select name="new_status" id="act_new_status">
            <option value="">— No change —</option>
            ${['new','new_high_priority','new_probably_not','contacted','criteria_collected','engaged','verified_active','not_investor','inactive'].map(s=>`<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveActivity('save_add')">Save & Log Another</button>
        <a href="${preType === 'buyer' && preId ? '/buyers/' + preId : '/activities'}" class="btn">Cancel</a>
      </div>
    </form>

    <div id="criteria-panel" class="card" style="display:none;margin-top:16px;">
      <h2>Fill Buyer Criteria${preBuyer ? ' — ' + preBuyer.name : ''}</h2>
      <div class="form-grid" style="margin-top:12px;">
        <div class="form-group full"><label>Target Zip Codes (comma-separated)</label><input type="text" id="qc_zips" value="${preBuyer?.zip_codes||''}" placeholder="95747,95678,95677"></div>
        <div class="form-group"><label>Min Price ($)</label><input type="number" id="qc_min_price" value="${preBuyer?.min_price||''}"></div>
        <div class="form-group"><label>Max Price ($)</label><input type="number" id="qc_max_price" value="${preBuyer?.max_price||''}"></div>
        <div class="form-group"><label>Property Types (comma-separated)</label><input type="text" id="qc_ptypes" value="${preBuyer?.property_types||''}" placeholder="sfr,multi,land,condo"></div>
        <div class="form-group"><label>Condition Tolerance</label><select id="qc_condition">${['','turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}">${s ? s.replace(/_/g,' ') : '— select —'}</option>`).join('')}</select></div>
        <div class="form-group"><label>Strategy</label><select id="qc_strategy">${['','flip','brrrr','rental_hold','wholesale'].map(s=>`<option value="${s}">${s === 'brrrr' ? 'BRRRR' : (s ? s.replace(/_/g,' ') : '— select —')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Funding Method</label><select id="qc_funding">${['','cash','hard_money','conventional','private_money'].map(s=>`<option value="${s}">${s ? s.replace(/_/g,' ') : '— select —'}</option>`).join('')}</select></div>
        <div class="form-group"><label>Deals (12mo)</label><input type="number" id="qc_deals" value="${preBuyer?.deals_last_12_months||0}"></div>
      </div>
    </div>

    ${showSequence && (seqNext === 'day3_text' || seqNext === 'day14_text') ? `
    <div class="card" style="margin-top:16px;">
      <h2>Text Template</h2>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;font-size:13px;line-height:1.6;margin-top:8px;white-space:pre-wrap;" id="text-template">${seqNext === 'day14_text' ? day14Text : day3Text}</div>
      <div style="margin-top:8px;">
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('text-template').textContent);flash('Copied to clipboard');">Copy Text</button>
      </div>
    </div>
    ` : ''}
    `;

    window._actBuyers = buyers || [];
    window._actContacts = contacts || [];
    window._actPreId = preId;
    window._actPreBuyer = preBuyer;
    window._actSeqNext = seqNext;
    window._actSeqStep = seqStep;

    if (preType) updateActContacts();
    document.getElementById('actForm').addEventListener('submit', e => { e.preventDefault(); saveActivity('save'); });
}

window.quickAction = (action) => {
    const desc = document.getElementById('act_desc');
    const fchk = document.getElementById('act_fchk');
    const fdate = document.getElementById('act_fdate');
    const atype = document.getElementById('act_atype');
    const outcome = document.getElementById('act_outcome');
    const contactClass = document.getElementById('act_class');
    const engagement = document.getElementById('act_engagement');
    const newStatus = document.getElementById('act_new_status');
    const criteriaPanel = document.getElementById('criteria-panel');

    const todayDate = new Date();
    const addDays = (d) => new Date(todayDate.getTime() + d * 86400000).toISOString().slice(0, 10);
    const seqNext = window._actSeqNext;

    // Reset
    if (criteriaPanel) criteriaPanel.style.display = 'none';

    if (action === 'voicemail') {
        atype.value = 'call';
        outcome.value = 'voicemail';
        contactClass.value = '';
        engagement.value = 'cold';
        newStatus.value = 'contacted';
        desc.value = 'Called — no answer, left voicemail.';
        fchk.checked = true;
        // Follow-up based on sequence position
        if (seqNext === 'day1_call') fdate.value = addDays(3); // next: Day 3 text
        else if (seqNext === 'day7_call') fdate.value = addDays(7); // next: Day 14 text
        else fdate.value = addDays(7);
    }
    else if (action === 'send_text') {
        atype.value = 'text';
        outcome.value = '';
        contactClass.value = '';
        engagement.value = '';
        newStatus.value = 'contacted';
        if (seqNext === 'day14_text') {
            desc.value = 'Sent final follow-up text. Leaving door open.';
            fchk.checked = false;
            fdate.value = '';
        } else {
            desc.value = 'Sent intro text message.';
            fchk.checked = true;
            fdate.value = addDays(4); // next: Day 7 call
        }
    }
    else if (action === 'callback') {
        atype.value = 'call';
        outcome.value = 'callback_requested';
        contactClass.value = '';
        engagement.value = 'warm';
        newStatus.value = 'contacted';
        desc.value = 'Reached — asked for callback. ';
        fchk.checked = true;
        fdate.value = addDays(1);
        desc.focus();
    }
    else if (action === 'conversation_hot') {
        atype.value = 'call';
        outcome.value = 'conversation';
        contactClass.value = 'investor';
        engagement.value = 'hot';
        newStatus.value = 'criteria_collected';
        desc.value = 'Conversation — active investor, gave criteria. Wants to see deals.\n\nAreas: \nPrice range: \nStrategy: \nFunding: \nVolume: \nNotes: ';
        fchk.checked = true;
        fdate.value = addDays(1);
        if (criteriaPanel) criteriaPanel.style.display = 'block';
        desc.focus();
    }
    else if (action === 'conversation_warm') {
        atype.value = 'call';
        outcome.value = 'conversation';
        contactClass.value = 'investor';
        engagement.value = 'warm';
        newStatus.value = 'contacted';
        desc.value = 'Conversation — interested but vague on criteria.\n\nNotes: ';
        fchk.checked = true;
        fdate.value = addDays(7);
        desc.focus();
    }
    else if (action === 'not_interested') {
        atype.value = 'call';
        outcome.value = 'not_interested';
        contactClass.value = '';
        engagement.value = 'cold';
        newStatus.value = 'inactive';
        desc.value = 'Not interested.';
        fchk.checked = false;
        fdate.value = '';
    }
    else if (action === 'not_investor') {
        atype.value = 'call';
        outcome.value = 'conversation';
        contactClass.value = 'not_investor';
        engagement.value = 'cold';
        newStatus.value = 'not_investor';
        desc.value = 'Reached — not an active investor. Moved to marketing list.\n\nNotes: ';
        fchk.checked = false;
        fdate.value = '';
        desc.focus();
    }
    else if (action === 'wrong_number') {
        atype.value = 'call';
        outcome.value = 'wrong_number';
        contactClass.value = '';
        engagement.value = 'cold';
        newStatus.value = 'inactive';
        desc.value = 'Wrong number / disconnected / bad contact info.';
        fchk.checked = false;
        fdate.value = '';
    }

    document.getElementById('actForm').scrollIntoView({ behavior: 'smooth' });
};

window.updateActContacts = () => {
    const type = document.getElementById('act_ct').value;
    const sel = document.getElementById('act_cid');
    sel.innerHTML = '<option value="">Select…</option>';
    let list = [];
    if (type === 'buyer') list = window._actBuyers.map(b => ({ id: b.id, name: b.name }));
    else list = window._actContacts.map(c => ({ id: c.id, name: `${c.name} (${(c.role||'').replace(/_/g,' ')})` }));
    list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (String(c.id) === window._actPreId) opt.selected = true;
        sel.appendChild(opt);
    });
};

window.saveActivity = async (action) => {
    const form = document.getElementById('actForm');
    const fd = new FormData(form);

    // Build structured description with outcome/classification/engagement
    let descParts = [];
    const outcome = document.getElementById('act_outcome')?.value;
    const contactClass = document.getElementById('act_class')?.value;
    const engagement = document.getElementById('act_engagement')?.value;
    if (outcome) descParts.push(`Outcome: ${outcome.replace(/_/g, ' ')}`);
    if (contactClass) descParts.push(`Type: ${contactClass.replace(/_/g, ' ')}`);
    if (engagement) descParts.push(`Engagement: ${engagement}`);

    const rawDesc = (fd.get('description') || '').trim();
    const fullDesc = descParts.length ? `[${descParts.join(' | ')}]\n${rawDesc}` : rawDesc;

    const data = {
        contact_type: fd.get('contact_type'),
        contact_id: parseInt(fd.get('contact_id')),
        activity_type: fd.get('activity_type'),
        description: fullDesc || null,
        followup_needed: form.querySelector('[name=followup_needed]').checked,
        followup_date: fd.get('followup_date') || null,
    };

    const result = await db.from('activity_log').insert(data);
    if (result.error) { flash(result.error.message, 'error'); return; }

    // Update last_contacted on the contact
    const todayStr = today();
    if (data.contact_type === 'buyer') {
        const upd = { last_contacted: todayStr };
        if (data.followup_needed && data.followup_date) upd.next_followup = data.followup_date;

        // Update buyer status if selected
        const newStatus = document.getElementById('act_new_status')?.value;
        if (newStatus) upd.status = newStatus;

        // Save criteria if the panel is visible and filled
        const criteriaPanel = document.getElementById('criteria-panel');
        if (criteriaPanel && criteriaPanel.style.display !== 'none') {
            const zips = document.getElementById('qc_zips')?.value;
            const minP = document.getElementById('qc_min_price')?.value;
            const maxP = document.getElementById('qc_max_price')?.value;
            const ptypes = document.getElementById('qc_ptypes')?.value;
            const cond = document.getElementById('qc_condition')?.value;
            const strat = document.getElementById('qc_strategy')?.value;
            const fund = document.getElementById('qc_funding')?.value;
            const deals = document.getElementById('qc_deals')?.value;

            if (zips) upd.zip_codes = zips;
            if (minP) upd.min_price = parseInt(minP);
            if (maxP) upd.max_price = parseInt(maxP);
            if (ptypes) upd.property_types = ptypes;
            if (cond) upd.condition_tolerance = cond;
            if (strat) upd.strategy = strat;
            if (fund) upd.funding_method = fund;
            if (deals !== undefined) upd.deals_last_12_months = parseInt(deals) || 0;
        }

        await db.from('buyers').update(upd).eq('id', data.contact_id);
    } else if (['listing_agent', 'other'].includes(data.contact_type)) {
        const upd = { last_contacted: todayStr };
        if (data.followup_needed && data.followup_date) upd.next_followup = data.followup_date;
        await db.from('contacts').update(upd).eq('id', data.contact_id);
    }

    invalidateCache('buyers');
    invalidateCache('buyerActivities');
    invalidateCache('contacts');
    flash('Activity logged');
    if (action === 'save_add') {
        navigate('/activities/new');
    } else if (data.contact_type === 'buyer') {
        navigate(`/buyers/${data.contact_id}`);
    } else {
        navigate('/activities');
    }
};

// ── Init ────────────────────────────────────────────────────────────────────
(async () => {
    if (await checkAuth()) {
        route(location.pathname + location.search);
    }
})();