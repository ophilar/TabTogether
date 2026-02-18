// Shared dark mode logic for TabTogether
// Apply dark mode based on user preference or system settings
import { debounce } from '../../common/utils.js';
import { storage } from '../../core/storage.js';
// Helper to determine the effective theme based on storage and system preference
async function determineThemePreference() {
    // Use 'auto' as the default if nothing is saved
    const saved = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    if (saved === 'enabled') {
        return 'dark';
    }
    if (saved === 'disabled') {
        return 'light';
    }
    // 'auto' - use system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return systemPrefersDark ? 'dark' : 'light';
}

// Applies the theme based on current preference. Called on page load.
export async function applyThemeFromStorage() {
    console.log("[applyThemeFromStorage] Applying theme from storage...");
    setTheme(await determineThemePreference());
}

// Sets the data-theme attribute on the root element
export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    console.log("[setTheme] document.documentElement data-theme is now:", document.documentElement.getAttribute('data-theme'));
}

// Sets up the theme selection dropdown interaction
export async function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;

    // Set initial value based on current preference ('auto' is the default)
    const currentSetting = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    select.value = currentSetting;

    // Apply the theme initially (ensures correct theme even if applyThemeFromStorage hasn't run)
    // This is slightly redundant if applyThemeFromStorage always runs first, but adds robustness.
    // setTheme(await determineThemePreference());

    select.addEventListener('change', async (e) => {
        // Store the setting ('enabled', 'disabled', 'auto') only in browser.storage.local
        console.log("[setupThemeDropdown] Theme changed via dropdown to:", e.target.value);
        await storage.set(browser.storage.local, 'tt_dark_mode', e.target.value);
        // Re-determine and apply the theme based on the new setting
        console.log("[setupThemeDropdown] Re-applying theme after dropdown change...");
        setTheme(await determineThemePreference());
    });
}

// Debounced theme change listener for system preference changes
const debouncedThemeChange = debounce(async () => {
    // Only apply system theme change if the user preference is 'auto'
    const currentSetting = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    if (currentSetting === 'auto') {
        // Determine theme based on the *new* system preference
        const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        setTheme(theme);
    }
}, 250); // Debounce to avoid rapid changes

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', debouncedThemeChange);
