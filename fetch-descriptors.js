const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ORG = 'folio-org';
const MOD_FILE_CANDIDATES = [
    'descriptors/ModuleDescriptor-template.json',
    'service/src/main/okapi/ModuleDescriptor-template.json',
];
const UI_FILE = 'package.json';
const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
const OUTPUT_FILE = path.join(__dirname, 'data', 'dependencies.json');
const HEADERS = {
    'User-Agent': 'folio-dependency-graph',
    // 'Authorization': 'token <TOKEN>', // Optional: for higher rate limit
};

async function fetchJson(url) {
    const res = await fetch(url, {headers: HEADERS});
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function fetchAllRepos() {
    let page = 1;
    const repos = [];
    while (true) {
        const url = `${GITHUB_API}/orgs/${ORG}/repos?per_page=100&page=${page}`;
        const pageRepos = await fetchJson(url);
        if (pageRepos.length === 0) break;
        repos.push(...pageRepos);
        page++;
    }
    return repos;
}

async function tryFetchDescriptor(repo) {
    console.log('Repo: ', repo.name, 'Default branch: ', repo.default_branch);
    if (repo.archived) {
        console.log(`Skipping archived repo: ${repo.name}`);
        return null;
    }
    if (repo.name.startsWith('mod-')) {
        for (const candidate of MOD_FILE_CANDIDATES) {
            const url = `${RAW_BASE}/${ORG}/${repo.name}/${repo.default_branch}/${candidate}`;
            try {
                const res = await fetch(url, {headers: HEADERS});
                if (res.status === 404) {
                    console.log('Fetch descriptor status for ', repo.name, ': ', res.status);
                    continue;
                }
                if (res.ok) return await res.json();
            } catch (_) {
            }
        }
    } else if (repo.name.startsWith('ui-') || repo.name.startsWith('stripes-')) {
        const url = `${RAW_BASE}/${ORG}/${repo.name}/${repo.default_branch}/${UI_FILE}`;
        try {
            const res = await fetch(url, {headers: HEADERS});
            if (res.status === 404) {
                console.log('Fetch descriptor status for ', repo.name, ': ', res.status);
                return null;
            }
            if (res.ok) return await res.json();
        } catch (_) {
        }
    }

    return null;
}

async function buildDependencyMap() {
    const repos = await fetchAllRepos();
    const map = {};

    for (const repo of repos) {
        const descriptor = await tryFetchDescriptor(repo);
        if (!descriptor) continue;

        const modId = repo.name;

        if (modId.startsWith('mod-')) {
            map[modId] = {
                provides: (descriptor.provides || []).map(p => ({
                    id: p.id,
                    version: p.version || ''
                })),
                requires: (descriptor.requires || []).flatMap(r =>
                    (r.version || '').split(' ').map(version => ({
                        id: r.id,
                        version: version || ''
                    }))
                ),
                optional: (descriptor.optional || []).flatMap(o =>
                    (o.version || '').split(' ').map(version => ({
                        id: o.id,
                        version: version || ''
                    }))
                )
            };
        } else if (modId.startsWith('ui-') || modId.startsWith('stripes-')) {
            map[modId] = {
                requires: Object.entries(descriptor.stripes?.okapiInterfaces || {})
                    .flatMap(([id, versions]) =>
                        (versions || '').split(' ').map(version => ({
                            id,
                            version: version || ''
                        }))
                    ),
                optional: Object.entries(descriptor.stripes?.optionalOkapiInterfaces || {})
                    .flatMap(([id, versions]) =>
                        (versions || '').split(' ').map(version => ({
                            id,
                            version: version || ''
                        }))
                    )
            }
        }
    }

    return map;
}

async function main() {
    console.log('Fetching FOLIO dependencies...');
    const map = await buildDependencyMap();

    fs.mkdirSync(path.dirname(OUTPUT_FILE), {recursive: true});
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(map, null, 2));
    console.log(`Saved dependency map to ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
