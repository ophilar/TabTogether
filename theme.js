// theme.js
// Shared dark mode logic for TabTogether
// Apply dark mode based on user preference or system settings
import { debounce, getFromStorage, setInStorage } from './utils.js';
// Helper to determine the effective theme based on storage and system preference
async function determineThemePreference() {
    const saved = await getFromStorage(browser.storage.local, 'tt_dark_mode');
    if (saved === 'enabled') {
        return 'dark';
    }
    if (saved === 'disabled') {
        return 'light';
    }
    // 'auto' or null/undefined - use system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; // System preference
}

export async function applyThemeFromStorage() {
    setTheme(await determineThemePreference());
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export async function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;

    // Set initial value based on current preference
    const currentSetting = await getFromStorage(browser.storage.local, 'tt_dark_mode', 'auto');

    select.value = currentSetting;
    // Apply the theme initially (redundant if applyThemeFromStorage already ran, but safe)
    setTheme(determineThemePreference());
    
    select.addEventListener('change', (e) => {
        const value = e.target.value;
        localStorage.setItem('tt_dark_mode', value); // Store the setting ('enabled', 'disabled', 'auto')
        setInStorage(browser.storage.local, 'tt_dark_mode', value);
        determineThemePreference().then(theme => setTheme(theme)); // Re-determine and apply
    });
}

// Debounced theme change listener for system preference changes
const debouncedThemeChange = debounce(async () => {
    const theme = await determineThemePreference();
    setTheme(theme);
}, 250);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', debouncedThemeChange);
