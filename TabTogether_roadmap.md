# TabTogether Roadmap

## Phase 1: Foundation & Core Functionality (Current)
- [x] Basic Firefox Sync integration
- [x] Device group management
- [x] Context menu and popup UI for sending tabs
- [x] Tab receiving and opening logic
- [x] Basic notifications
- [x] Subscriptions system

## Phase 2: Refactoring & Stabilization
- [x] Implement solid error handling for Sync latency (via Manual Sync/Periodic Sync)
- [x] Android Reliability Fix (Recursive Bookmark Search)
- [x] Refactor "God" functions in `background.js` and `actions.js`
- [x] Add comprehensive unit tests for core logic
- [ ] Optimize storage usage to minimize Sync conflicts

## Phase 3: Enhanced Features
- [x] Device Nicknames support
- [x] Tab History (Persistence)
- [x] Modern UI Overhaul (Vibrant Gradients, Collapsible Sections)
- [ ] Synchronize tab states (scroll position, etc.)
- [ ] Support for tab groups synchronization
- [ ] Cross-browser support (Chrome/Edge via Polyfills)

## Phase 4: Production & Maintenance
- [ ] Finalize AMO publication
- [ ] Implement automated CI/CD for linting and testing
- [ ] User feedback integration

## Phase 5: Modernization & Security (2026)
- [x] Replace `html-minifier` with `html-minifier-terser` or `html-minifier-next`
- [x] Fix all high-severity security advisories (flatted, minimatch)
- [x] Verify `storage.sync` status on Android (Confirmed: still local-only in 2026)
- [x] Ensure CI parity with latest `web-ext` and `jest` versions
- [x] Refine Android Sync Strategy (Reliable Late-Arriving Task Processing)
- [x] Fix regressions in Test Mock Environment
