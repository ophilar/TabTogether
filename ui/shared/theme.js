// Shared dark mode logic for TabTogether
// Apply dark mode based on user preference or system settings
import { debounce } from '../../common/utils.js';
import { storage } from '../../core/storage.js';

// Helper to determine the effective theme based on storage and system preference
async function determineThemePreference() {
    // Use 'auto' as the default if nothing is saved
    console.log("[determineThemePreference] Fetching 'tt_dark_mode' from local storage...");
    const saved = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    console.log("[determineThemePreference] Saved preference:", saved);
    if (saved === 'enabled') {
        console.log("[determineThemePreference] Determined theme: dark (enabled)");
        return 'dark';
    }
    if (saved === 'disabled') {
        console.log("[determineThemePreference] Determined theme: light (disabled)");
        return 'light';
    }
    // 'auto' - use system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    console.log("[determineThemePreference] System prefers dark:", systemPrefersDark, "-> Determined theme:", systemPrefersDark ? 'dark' : 'light');
    return systemPrefersDark ? 'dark' : 'light';
}

// Applies the theme based on current preference. Called on page load.
export async function applyThemeFromStorage() {
    console.log("[applyThemeFromStorage] Applying theme from storage...");
    setTheme(await determineThemePreference());
}

// Sets the data-theme attribute on the root element
export function setTheme(theme) {
    console.log("[setTheme] Setting data-theme to:", theme);
    document.documentElement.setAttribute('data-theme', theme);
    console.log("[setTheme] document.documentElement data-theme is now:", document.documentElement.getAttribute('data-theme'));
}

// Sets up the theme selection dropdown interaction
export async function setupThemeDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if (!select) return;

    // Set initial value based on current preference ('auto' is the default)
    console.log("[setupThemeDropdown] Fetching 'tt_dark_mode' for dropdown initial value...");
    const currentSetting = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    select.value = currentSetting;
    console.log("[setupThemeDropdown] Dropdown initial value set to:", currentSetting);

    // Apply the theme initially (ensures correct theme even if applyThemeFromStorage hasn't run)
    // This is slightly redundant if applyThemeFromStorage always runs first, but adds robustness.
    // setTheme(await determineThemePreference());

    select.addEventListener('change', async (e) => {
        const value = e.target.value;
        // Store the setting ('enabled', 'disabled', 'auto') only in browser.storage.local
        console.log("[setupThemeDropdown] Theme changed via dropdown to:", value);
        await storage.set(browser.storage.local, 'tt_dark_mode', value);
        // Re-determine and apply the theme based on the new setting
        console.log("[setupThemeDropdown] Re-applying theme after dropdown change...");
        setTheme(await determineThemePreference());
    });
}

// Debounced theme change listener for system preference changes
const debouncedThemeChange = debounce(async () => {
    // Only apply system theme change if the user preference is 'auto'
    console.log("[debouncedThemeChange] System theme preference changed. Checking 'tt_dark_mode' setting...");
    const currentSetting = await storage.get(browser.storage.local, 'tt_dark_mode', 'auto');
    if (currentSetting === 'auto') {
        // Determine theme based on the *new* system preference
        const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        setTheme(theme);
        console.log("[debouncedThemeChange] Applied system theme change because setting is 'auto'. New theme:", theme);
    }
}, 250); // Debounce to avoid rapid changes

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', debouncedThemeChange);
