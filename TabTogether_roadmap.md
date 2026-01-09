# TabTogether Roadmap

## Phase 1: Foundation & Core Functionality (Current)
- [x] Basic Firefox Sync integration
- [x] Device group management
- [x] Context menu and popup UI for sending tabs
- [x] Tab receiving and opening logic
- [x] Basic notifications
- [x] Subscriptions system

## Phase 2: Refactoring & Stabilization
- [x] Implement solid error handling for Sync latency (via Heartbeat/Periodic Sync)
- [x] Android Reliability Fix (Recursive Bookmark Search)
- [ ] Refactor "God" functions in `background.js` and `actions.js`
- [ ] Add comprehensive unit tests for core logic
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
