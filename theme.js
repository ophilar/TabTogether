// theme.js
// Shared dark mode logic for TabTogether

function applyThemeFromStorage() {
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (saved === 'disabled') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        // auto or not set
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
}

function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;
    select.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'enabled') {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('tt_dark_mode', 'enabled');
        } else if (value === 'disabled') {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('tt_dark_mode', 'disabled');
        } else {
            localStorage.setItem('tt_dark_mode', 'auto');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
    });
    // Set initial value
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        document.documentElement.setAttribute('data-theme', 'dark');
        select.value = 'enabled';
    } else if (saved === 'disabled') {
        document.documentElement.setAttribute('data-theme', 'light');
        select.value = 'disabled';
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        select.value = 'auto';
    }
}
