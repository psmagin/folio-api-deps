# FOLIO API Dependencies

This repository provides tools and resources for managing and visualizing dependencies in the FOLIO API ecosystem. It
includes a web-based interface for exploring module dependencies, API usage counts, and detailed API usage views.

## Features

- **Table View**: Search and sort module dependencies, API types, and versions.
- **API Usage Count**: View aggregated usage counts for APIs.
- **API Usage View**: Explore detailed information about specific APIs.

## Directory Structure
```
.
├── docs/                      # GitHub Pages root (static website)
│   ├── index.html             # Main UI with tabbed interface
│   ├── style.css              # Custom styles for tables, dropdowns, etc.
│   ├── script.js              # Core logic: parsing, rendering, filtering
│   └── dependencies.json      # API dependency data (auto-generated)
│
├── .github/
│   └── workflows/
│       └── fetch-data.yml     # GitHub Actions workflow for updating dependencies.json
│
└── fetch-descriptors.js       # Script to fetch and build dependency graph from folio-org
```


## Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:psmagin/folio-api-deps.git
   cd folio-api-deps
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Web Interface

Open docs/index.html in a browser to explore the FOLIO API dependencies.

### Fetch Descriptors

Run the [fetch-descriptors.js](fetch-descriptors.js) script to update dependency data:

```bash
node fetch-descriptors.js
```

## License
This project is licensed under the terms of the [LICENSE](LICENSE) file.