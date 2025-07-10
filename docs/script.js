let allRows = [];

async function loadDependencies() {
    const res = await fetch('../data/dependencies.json');
    const data = await res.json();

    const rows = [];

    for (const moduleId in data) {
        for (const p of data[moduleId].provides || []) {
            rows.push({
                module: moduleId,
                type: 'provides',
                api: p.id,
                version: p.version || ''
            });
        }

        ['requires', 'optional'].forEach(depType => {
            for (const r of data[moduleId][depType] || []) {
                rows.push({
                    module: moduleId,
                    type: depType,
                    api: r.id,
                    version: r.version || ''
                });
            }
        });
    }

    return rows;
}

function renderTable(rows) {
    const tbody = document.querySelector('#dependency-table tbody');
    tbody.innerHTML = '';

    // Step 1: Group rows by module + api + type
    const grouped = new Map(); // key = `${module}|${type}|${api}`, value = array of versions

    for (const row of rows) {
        const key = `${row.module}|${row.type}|${row.api}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row.version || '?');
    }

    // Step 2: Render grouped rows
    for (const [key, versions] of grouped.entries()) {
        const [module, type, api] = key.split('|');
        const versionText = [...new Set(versions)].join(', ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${module}</td>
      <td class="type-${type}">${type}</td>
      <td>${api}</td>
      <td>${versionText}</td>
    `;
        tbody.appendChild(tr);
    }
}


function setupSearch() {
    const input = document.getElementById('search');
    input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        const filtered = allRows.filter(r =>
            r.module.toLowerCase() === term ||
            r.api.toLowerCase() === term
        );
        renderTable(filtered);
    });
}

function buildApiIndex(rows) {
    const index = new Map();

    for (const row of rows) {
        if (!index.has(row.api)) index.set(row.api, {provides: [], requires: [], optional: []});
        index.get(row.api)[row.type].push(row);
    }

    return index;
}

function renderApiList(apiIndex) {
    const input = document.getElementById('api-select');
    const dropdown = document.getElementById('api-dropdown');

    const apis = Array.from(apiIndex.keys()).sort();
    let filteredApis = [];
    let activeIndex = -1;

    function highlightMatch(api, term) {
        const idx = api.toLowerCase().indexOf(term.toLowerCase());
        if (idx === -1) return api;
        return (
            api.substring(0, idx) +
            '<strong>' + api.substring(idx, idx + term.length) + '</strong>' +
            api.substring(idx + term.length)
        );
    }

    function renderDropdown(matches, term) {
        dropdown.innerHTML = '';
        if (matches.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        matches.forEach((api, i) => {
            const item = document.createElement('div');
            item.className = 'dropdown-item' + (i === activeIndex ? ' active' : '');
            item.innerHTML = highlightMatch(api, term);

            item.addEventListener('mousedown', e => {
                e.preventDefault();
                selectApi(api);
            });

            dropdown.appendChild(item);
        });

        dropdown.style.display = 'block';
    }

    function selectApi(api) {
        const record = apiIndex.get(api.trim());
        if (record) {
            input.value = api; // update input cleanly
            dropdown.style.display = 'none';
            activeIndex = -1;
            renderApiUsage(api, record);
        } else {
            console.warn('No match for API:', api);
            document.getElementById('api-details').innerHTML = '<em>No usage found</em>';
        }


    }

    function updateMatches() {
        const term = input.value.trim().toLowerCase();
        if (!term) {
            dropdown.style.display = 'none';
            return;
        }

        filteredApis = apis.filter(api => api.toLowerCase().startsWith(term));
        activeIndex = -1;
        renderDropdown(filteredApis, input.value);
    }

    input.addEventListener('input', updateMatches);
    input.addEventListener('focus', updateMatches);

    input.addEventListener('keydown', e => {
        if (dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, filteredApis.length - 1);
            renderDropdown(filteredApis, input.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderDropdown(filteredApis, input.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) {
                selectApi(filteredApis[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}


function renderApiUsage(apiId, data) {
    const div = document.getElementById('api-details');
    if (!data) {
        div.innerHTML = `<p>No data for API <code>${apiId}</code></p>`;
        return;
    }

    let html = `<h3>API: <code>${apiId}</code></h3>`;

    html += `<h4>✅ Provided by:</h4><ul>`;
    for (const p of data.provides) {
        html += `<li><code>${p.module}</code> (${p.version || 'n/a'})</li>`;
    }
    if (data.provides.length === 0) {
        html += `<li><em>No providers</em></li>`;
    }
    html += `</ul>`;

    html += `<h4>🔍 Required by:</h4><ul>`;
    if (data.requires.length === 0) {
        html += `<li><em>No consumers</em></li>`;
    } else {
        const groupedRequires = groupByModule(data.requires);
        for (const mod in groupedRequires) {
            const versions = groupedRequires[mod].join(', ');
            const mismatch = isMismatch(groupedRequires[mod], data.provides.map(p => p.version));
            html += `<li><code>${mod}</code> (${versions})` +
                (mismatch ? ` ⚠️ <span style="color: orange;">version mismatch</span>` : '') +
                `</li>`;
        }
    }
    html += `</ul>`;

    html += `<h4>🟡 Optionally used by:</h4><ul>`;
    if (data.optional.length === 0) {
        html += `<li><em>No optional users</em></li>`;
    } else {
        const groupedOptional = groupByModule(data.optional);
        for (const mod in groupedOptional) {
            const versions = groupedOptional[mod].join(', ');
            const mismatch = isMismatch(groupedOptional[mod], data.provides.map(p => p.version));
            html += `<li><code>${mod}</code> (${versions})` +
                (mismatch ? ` ⚠️ <span style="color: orange;">version mismatch</span>` : '') +
                `</li>`;
        }
    }
    html += `</ul>`;

    div.innerHTML = html;
}

function groupByModule(entries) {
    const grouped = {};
    for (const entry of entries) {
        if (!grouped[entry.module]) grouped[entry.module] = [];
        grouped[entry.module].push(entry.version || '?');
    }
    return Object.keys(grouped)
        .sort()
        .reduce((sorted, key) => {
            sorted[key] = grouped[key];
            return sorted;
        }, {});
}

function isMismatch(requiredVersions, providedVersions) {
    if (!providedVersions.length) return true;
    return !requiredVersions.some(v => providedVersions.includes(v));
}

function setupSorting() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            const ascending = th.classList.toggle('asc');
            allRows.sort((a, b) => {
                const av = a[key].toLowerCase();
                const bv = b[key].toLowerCase();
                return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
            renderTable(allRows);
        });
    });
}

function setupTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    const views = document.querySelectorAll('.tab-view');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');

            // Toggle active button
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show the right view
            views.forEach(view => {
                view.id === 'view-' + tab
                    ? view.classList.add('active')
                    : view.classList.remove('active');
            });
        });
    });

    // Activate default tab
    document.querySelector('.tab-button.active').click();
}


loadDependencies().then(rows => {
    allRows = rows;
    renderTable(allRows);
    setupSearch();
    setupSorting();

    const apiIndex = buildApiIndex(rows);
    renderApiList(apiIndex);

    setupTabs();
});

