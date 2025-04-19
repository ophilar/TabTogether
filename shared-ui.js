// shared-ui.js
// Injects shared header, loading, and message area into the container

function injectSharedUI(containerSelector = '.container') {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    // Only inject if not already present
    if (!container.querySelector('header')) {
        const header = document.createElement('header');
        header.innerHTML = '<h1 id="mainTitle">TabTogether</h1>';
        container.prepend(header);
    }
    if (!container.querySelector('#loadingIndicator')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingIndicator';
        loadingDiv.className = 'loading';
        loadingDiv.style.display = 'none';
        loadingDiv.textContent = 'Loading...';
        container.insertBefore(loadingDiv, container.firstChild.nextSibling);
    }
    if (!container.querySelector('#messageArea')) {
        const messageDiv = document.createElement('div');
        messageDiv.id = 'messageArea';
        messageDiv.style.display = 'none';
        container.insertBefore(messageDiv, container.firstChild.nextSibling.nextSibling);
    }
}
