let allRows = [];
let currentGroupedRows = [];  // <-- will track current rows in table

let globalApiIndex;

function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
}


function selectApi(api) {
    const record = globalApiIndex.get(api.trim());
    if (record) {
        const input = document.getElementById('api-select');
        input.value = api;
        document.getElementById('api-dropdown').style.display = 'none';
        renderApiUsage(api, record);

        // 🔗 Update URL for shareable link
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('api', api);
        history.replaceState({}, '', newUrl);
    } else {
        console.warn('No match for API:', api);
        document.getElementById('api-details').innerHTML = '<em>No usage found</em>';
    }
}


async function loadDependencies() {
    const res = await fetch('dependencies.json');
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

    const grouped = new Map(); // key = `${module}|${type}|${api}`, value = array of versions

    for (const row of rows) {
        const key = `${row.module}|${row.type}|${row.api}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row.version || '?');
    }

    const groupedDisplayRows = []; // ← Will track for sorting

    for (const [key, versions] of grouped.entries()) {
        const [module, type, api] = key.split('|');
        const versionText = [...new Set(versions)].join(', ');

        groupedDisplayRows.push({ module, type, api, version: versionText });

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${module}</td>
          <td class="type-${type}">${type}</td>
          <td>${api}</td>
          <td>${versionText}</td>
        `;
        tbody.appendChild(tr);
    }

    currentGroupedRows = groupedDisplayRows; // Store for sorting
}

function initTableSearch(allRows) {
    const input = document.getElementById('table-search');
    const clearBtn = document.getElementById('table-clear');
    const dropdown = document.getElementById('table-dropdown');
    const matchCountEl = document.getElementById('table-match-count');

    const uniqueValues = new Set();
    allRows.forEach(row => {
        uniqueValues.add(row.module);
        uniqueValues.add(row.api);
    });

    const options = Array.from(uniqueValues).sort();
    let filtered = [];
    let activeIndex = -1;

    function highlight(text, term) {
        const idx = text.toLowerCase().indexOf(term.toLowerCase());
        if (idx === -1) return text;
        return (
            text.slice(0, idx) +
            '<strong>' + text.slice(idx, idx + term.length) + '</strong>' +
            text.slice(idx + term.length)
        );
    }

    function renderDropdown(term) {
        dropdown.innerHTML = '';
        if (filtered.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        filtered.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'dropdown-item' + (i === activeIndex ? ' active' : '');
            el.innerHTML = highlight(item, term);
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                select(item);
            });
            dropdown.appendChild(el);
        });

        dropdown.style.display = 'block';
    }

    function renderCount(count) {
        matchCountEl.textContent = count === allRows.length
            ? ''
            : `${count} matching ${count === 1 ? 'row' : 'rows'}`;
    }

    function select(value) {
        input.value = value;
        dropdown.style.display = 'none';
        activeIndex = -1;
        clearBtn.style.display = 'block';

        const filteredRows = allRows.filter(
            row => row.module === value || row.api === value
        );
        renderTable(filteredRows);
        renderCount(filteredRows.length);
    }

    function updateMatches() {
        const term = input.value.trim();
        if (!term) {
            dropdown.style.display = 'none';
            renderTable(allRows);
            renderCount(allRows.length);
            clearBtn.style.display = 'none';
            return;
        }

        filtered = options.filter(opt => opt.toLowerCase().includes(term.toLowerCase()));
        activeIndex = -1;
        renderDropdown(term);

        const matchedRows = allRows.filter(
            row =>
                row.module.toLowerCase() === term.toLowerCase() ||
                row.api.toLowerCase() === term.toLowerCase()
        );
        renderTable(matchedRows);
        renderCount(matchedRows.length);
        clearBtn.style.display = 'block';
    }

    function clearSearch() {
        input.value = '';
        dropdown.style.display = 'none';
        clearBtn.style.display = 'none';
        renderTable(allRows);
        renderCount(allRows.length);
    }

    input.addEventListener('input', updateMatches);
    input.addEventListener('focus', updateMatches);
    clearBtn.addEventListener('click', clearSearch);

    input.addEventListener('keydown', e => {
        if (dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
            renderDropdown(input.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderDropdown(input.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) {
                select(filtered[activeIndex]);
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

    // Initial state
    renderCount(allRows.length);
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
            th.classList.remove('desc');
            if (!ascending) th.classList.add('desc');

            sortTableBy(key, ascending);
        });
    });
}

function sortTableBy(column, ascending = true) {
    const rows = [...currentGroupedRows];
    rows.sort((a, b) => {
        const av = a[column]?.toLowerCase?.() ?? '';
        const bv = b[column]?.toLowerCase?.() ?? '';
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    const tbody = document.querySelector('#dependency-table tbody');
    tbody.innerHTML = '';

    for (const row of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.module}</td>
      <td class="type-${row.type}">${row.type}</td>
      <td>${row.api}</td>
      <td>${row.version}</td>
    `;
        tbody.appendChild(tr);
    }
}

function renderApiUsageCountTable(rows) {
    const providesMap = new Map(); // key = API, value = provider module
    const usageMap = new Map();    // key = API, value = Set of modules that require/optional

    for (const row of rows) {
        if (row.type === 'provides') {
            // Register the provider for this API
            if (!providesMap.has(row.api)) {
                providesMap.set(row.api, row.module); // First provider only
            }
        } else if (row.type === 'requires' || row.type === 'optional') {
            // Add to usage set
            if (!usageMap.has(row.api)) usageMap.set(row.api, new Set());
            usageMap.get(row.api).add(row.module);
        }
    }

    // Build display list
    const resultList = Array.from(usageMap.entries()).map(([api, users]) => ({
        api,
        count: users.size,
        provider: providesMap.get(api) || null
    }));

    resultList.sort((a, b) => b.count - a.count);

    // Render
    const container = document.getElementById('api-usage-count');
    container.innerHTML = `
      <table class="simple-table">
        <thead>
          <tr>
            <th>API Interface</th>
            <th>Usage Count</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${resultList.map(u => `
            <tr>
              <td>
                ${u.provider
            ? `<a href="https://github.com/folio-org/${u.provider}" target="_blank">${u.api}</a>`
            : u.api}
              </td>
              <td>${u.count}</td>
              <td>
                <button class="view-usage-btn" data-api="${u.api}">View Usage</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Attach click events to "View Usage" buttons
    container.querySelectorAll('.view-usage-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const api = btn.getAttribute('data-api');

            // ✅ Fix: match your actual tab button data-tab="api"
            const apiUsageTabButton = document.querySelector('.tab-button[data-tab="api"]');
            if (apiUsageTabButton) {
                apiUsageTabButton.click();

                // Wait for DOM update
                setTimeout(() => {
                    const input = document.getElementById('api-select');
                    if (input) {
                        input.value = api;
                        input.dispatchEvent(new Event('input'));
                        selectApi(api);
                    }
                }, 50);
            }
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

function initProgressiveConsumersGraph(rows) {
    const container = document.getElementById('module-consumers-graph');
    container.innerHTML = ''; // clear previous

    const providesMap = new Map(); // api → [providerModules]
    const dependentsMap = new Map(); // api → [consumerModules]
    const providesByModule = new Map(); // module → [api]

    // Build lookup maps
    for (const row of rows) {
        if (row.type === 'provides') {
            if (!providesMap.has(row.api)) providesMap.set(row.api, []);
            providesMap.get(row.api).push(row.module);

            if (!providesByModule.has(row.module)) providesByModule.set(row.module, []);
            providesByModule.get(row.module).push(row.api);
        } else if (row.type === 'requires' || row.type === 'optional') {
            if (!dependentsMap.has(row.api)) dependentsMap.set(row.api, []);
            dependentsMap.get(row.api).push(row.module);
        }
    }

    let cy = null;
    const addedNodes = new Set(); // track expanded modules

    function expandModule(moduleName) {
        if (addedNodes.has(moduleName)) return;

        // Add node if not yet present in graph
        if (!cy.getElementById(moduleName).length) {
            cy.add({ group: 'nodes', data: { id: moduleName, label: moduleName } });
        }

        addedNodes.add(moduleName);

        const providedApis = providesByModule.get(moduleName) || [];

        for (const api of providedApis) {
            const consumers = dependentsMap.get(api) || [];

            for (const consumer of consumers) {
                // Add consumer node only if it doesn't exist yet
                if (!cy.getElementById(consumer).length) {
                    cy.add({ group: 'nodes', data: { id: consumer, label: consumer } });
                }

                // Add edge only if it doesn't exist
                const edgeId = `${consumer}__to__${moduleName}__${api}`;
                if (!cy.getElementById(edgeId).length) {
                    // Determine dependency type
                    const isOptional = rows.some(
                        r => r.module === consumer && r.api === api && r.type === 'optional'
                    );

                    cy.add({
                        group: 'edges',
                        data: {
                            id: edgeId,
                            source: consumer,
                            target: moduleName,
                            label: `${api}${isOptional ? ' (optional)' : ''}`,
                            depType: isOptional ? 'optional' : 'requires'
                        }
                    });
                }

            }
        }

        cy.layout({ name: 'breadthfirst', directed: true, padding: 10 }).run();
    }


    function renderInitial(moduleName) {
        cy = cytoscape({
            container,
            elements: [
                { data: { id: moduleName, label: moduleName } }
            ],
            layout: {
                name: 'breadthfirst',
                directed: true,
                padding: 10
            },
            style: [
                {
                    selector: 'node',
                    style: {
                        label: 'data(label)',
                        'background-color': '#1976d2',
                        color: '#fff',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-size': '12px',
                        'text-outline-color': '#1976d2',
                        'text-outline-width': 2
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        label: 'data(label)',
                        width: 2,
                        'line-color': '#666',
                        'target-arrow-color': '#666',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'font-size': '10px',
                        'text-rotation': 'autorotate',
                        'text-margin-y': -5,
                        'text-outline-color': '#fff',
                        'text-outline-width': 2
                    }
                },
                {
                    selector: 'edge[depType = "optional"]',
                    style: {
                        'line-color': '#ff9800',
                        'target-arrow-color': '#ff9800',
                        'line-style': 'dashed'
                    }
                },
                {
                    selector: 'edge[depType = "requires"]',
                    style: {
                        'line-color': '#4caf50',
                        'target-arrow-color': '#4caf50',
                        'line-style': 'solid'
                    }
                }
            ]

        });

        addedNodes.clear();
        expandModule(moduleName);

        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            expandModule(node.id());
        });
    }

    // Hook up input/dropdown logic
    const input = document.getElementById('module-consumers-input');
    const dropdown = document.getElementById('module-consumers-dropdown');
    const moduleNames = [...new Set(rows.map(r => r.module))].sort();
    let filtered = [];
    let activeIndex = -1;

    function renderDropdown(term) {
        dropdown.innerHTML = '';
        filtered.forEach((mod, i) => {
            const el = document.createElement('div');
            el.className = 'dropdown-item' + (i === activeIndex ? ' active' : '');
            el.textContent = mod;
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                input.value = mod;
                dropdown.style.display = 'none';
                renderInitial(mod);
            });
            dropdown.appendChild(el);
        });
        dropdown.style.display = filtered.length ? 'block' : 'none';
    }

    input.addEventListener('input', () => {
        const term = input.value.trim().toLowerCase();
        filtered = moduleNames.filter(m => m.toLowerCase().startsWith(term));
        renderDropdown(term);
    });

    input.addEventListener('keydown', e => {
        if (dropdown.style.display === 'none') return;
        if (e.key === 'ArrowDown') {
            activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
            renderDropdown(input.value);
        } else if (e.key === 'ArrowUp') {
            activeIndex = Math.max(activeIndex - 1, 0);
            renderDropdown(input.value);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            input.value = filtered[activeIndex];
            dropdown.style.display = 'none';
            renderInitial(filtered[activeIndex]);
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




loadDependencies().then(rows => {
    allRows = rows;
    renderTable(allRows);
    initTableSearch(allRows);
    setupSorting();

    globalApiIndex = buildApiIndex(rows);
    renderApiList(globalApiIndex);
    renderApiUsageCountTable(allRows);
    initProgressiveConsumersGraph(allRows);


    setupTabs();

    const initialApi = getQueryParam('api');
    if (initialApi) {
        // Switch to the tab using your existing button
        const usageTabBtn = document.querySelector('.tab-button[data-tab="api"]');
        if (usageTabBtn) {
            usageTabBtn.click();

            // Ensure DOM is ready before selecting
            setTimeout(() => {
                selectApi(initialApi);
            }, 100);
        }
    }

});

