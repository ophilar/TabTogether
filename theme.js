// theme.js
// Shared dark mode logic for TabTogether

export function applyThemeFromStorage() {
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        setTheme('dark');
    } else if (saved === 'disabled') {
        setTheme('light');
    } else {
        // auto or not set
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;
    select.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'enabled') {
            setTheme('dark');
            localStorage.setItem('tt_dark_mode', 'enabled');
        } else if (value === 'disabled') {
            setTheme('light');
            localStorage.setItem('tt_dark_mode', 'disabled');
        } else {
            localStorage.setItem('tt_dark_mode', 'auto');
            setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        }
    });
    // Set initial value
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') {
        setTheme('dark');
        select.value = 'enabled';
    } else if (saved === 'disabled') {
        setTheme('light');
        select.value = 'disabled';
    } else {
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        select.value = 'auto';
    }
}
