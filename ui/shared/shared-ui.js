// shared-ui.js
// Injects shared header, loading, and message area into the container

export function injectSharedUI(containerSelector = '.container') {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.warn(`Shared UI injection failed: Container "${containerSelector}" not found.`);
        return;
    }

    // Use prepend for consistent insertion at the beginning,
    // inserting in reverse order of desired final appearance.

    // Inject Message Area if not present
    if (!container.querySelector('#messageArea')) {
        const messageDiv = document.createElement('div');
        messageDiv.id = 'messageArea';
        messageDiv.className = 'message-area hidden'; // Use class from styles.css
        container.prepend(messageDiv); // Prepend first (will end up below loading)
    }

    // Inject Loading Indicator if not present
    if (!container.querySelector('#loadingIndicator')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingIndicator';
        loadingDiv.className = 'loading hidden';
        // Add spinner span for consistency with styles.css
        loadingDiv.innerHTML = '<span class="spinner"></span> Loading...';
        container.prepend(loadingDiv); // Prepend second (will end up below header)
    }
}

export const showAndroidBanner = (container, msg) => {
  let banner = container.querySelector(".android-banner");
  // Consider moving these styles to a CSS class for better maintainability
    if (!banner) { // Styles moved to styles.css under .android-banner
        banner = document.createElement("div");
        banner.className = "android-banner small-text"; // Existing classes for structure and font size
        container.insertBefore(banner, container.firstChild ? container.firstChild.nextSibling : null);
    }
    banner.textContent = msg;
};
