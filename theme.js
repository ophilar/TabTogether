// theme.js
// Shared dark mode logic for TabTogether

// Helper to determine the effective theme based on storage and system preference
function determineThemePreference() {
    const saved = localStorage.getItem('tt_dark_mode');
    if (saved === 'enabled') return 'dark';
    if (saved === 'disabled') return 'light';
    // 'auto' or null
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeFromStorage() {
    setTheme(determineThemePreference());
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;

    // Set initial value based on current preference
    const currentSetting = localStorage.getItem('tt_dark_mode') || 'auto';
    select.value = currentSetting;
    // Apply the theme initially (redundant if applyThemeFromStorage already ran, but safe)
    setTheme(determineThemePreference());

    select.addEventListener('change', (e) => {
        const value = e.target.value;
        localStorage.setItem('tt_dark_mode', value); // Store the setting ('enabled', 'disabled', 'auto')
        setTheme(determineThemePreference()); // Re-determine and apply
    });
}
