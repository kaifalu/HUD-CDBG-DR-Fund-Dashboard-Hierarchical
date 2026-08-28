# Static data schema

The dashboard stores finance records as compact arrays in `data/rows/*.js`. Column positions are declared in `data/bootstrap.js` under `columns`. Repeated text is dictionary-encoded, geographic boundaries are loaded lazily, and privacy-screened public narrative excerpts are split into year-based chunks that are loaded only when a narrative table is opened.

The deployment package contains no Python runtime, SQLite database, or raw source CSV.
