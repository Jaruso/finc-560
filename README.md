# FINC 560 Visualizations

Static GitHub Pages site for weekly FINC 560 assignment visualizations.

The site is served from `docs/`, and Python Plotly figures are exported into
standalone HTML files under `docs/visualizations/`.

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Build Plotly exports

```bash
python scripts/export_plotly.py
```

The exporter reads assignment modules from `src/assignments/`. Each module
defines a `FIGURES` list with Plotly figures and metadata.

## Preview the site

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`.

## Publish with GitHub Pages

In the GitHub repo settings:

1. Go to **Pages**.
2. Set **Source** to **Deploy from a branch**.
3. Select the `main` branch and `/docs` folder.
4. Save.

After GitHub Pages finishes deploying, `docs/index.html` is the public entry
point and the exported Plotly HTML files are served as static assets.
