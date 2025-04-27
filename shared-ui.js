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

    // Inject header but without h1/hr ---
    if (!container.querySelector('header#sharedHeader')) {
        const header = document.createElement('header');
        header.id = 'sharedHeader';
        const h1 = document.createElement('h1'); // REMOVED
        h1.id = 'mainTitle';                 // REMOVED
        h1.textContent = 'TabTogether';        // REMOVED
        header.appendChild(h1);                // REMOVED
        container.prepend(header);             // REMOVED (or just prepend an empty header if needed for structure)
    }
}
