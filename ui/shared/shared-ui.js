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
    if (!banner) {
        banner = document.createElement("div");
        banner.className = "android-banner small-text"; // Existing classes for structure and font size
        container.insertBefore(banner, container.firstChild ? container.firstChild.nextSibling : null);
    }
    banner.textContent = msg;
};

export function showLoadingIndicator(
  indicatorElement,
  isLoading,
) {
  if (!indicatorElement) {
    console.warn("showLoadingIndicator: Indicator element not found.");
    return;
  }

  indicatorElement.classList.toggle("hidden", !isLoading);

  if (isLoading) {
    // Ensure spinner span exists and set text
    let spinner = indicatorElement.querySelector(".spinner");
    if (!spinner) {
      spinner = document.createElement("span");
      spinner.className = "spinner";
      indicatorElement.prepend(spinner); // Add spinner at the beginning
    }
  } else {
    indicatorElement.textContent = ""; // Clear content safely
  }
}

/**
 * Shows a message in a designated message area element.
 * @param {HTMLElement} messageArea - The DOM element for the message area.
 * @param {string} message - The message text to display.
 * @param {boolean} [isError=false] - True if the message is an error, false for success.
 * @param {number} [autoHideDelay=4000] - Delay in ms to auto-hide non-error messages (0 to disable).
 */
export function showMessage(
  messageArea,
  message,
  isError = false,
  autoHideDelay = 4000
) {
  if (!messageArea) return;

  messageArea.textContent = message;
  messageArea.className = "message-area"; // Reset classes first
  messageArea.classList.add(isError ? "error" : "success");
  messageArea.classList.remove("hidden");

  // Auto-hide non-error messages after a delay
  if (!isError && autoHideDelay > 0) {
    setTimeout(() => clearMessage(messageArea), autoHideDelay);
  }
}

/** Clears the content and hides the designated message area element. */
export function clearMessage(messageArea) {
  if (messageArea) {
    messageArea.textContent = "";
    messageArea.className = "message-area hidden"; // Add hidden class
  }
}

export const setLastSyncTime = (container, date) => {
  let syncDiv = container.querySelector(".last-sync-time");
  if (!syncDiv) {
    syncDiv = document.createElement("div");
    syncDiv.className = "last-sync-time small-text";
    syncDiv.style.marginBottom = "7px";
    container.insertBefore(syncDiv, container.firstChild.nextSibling);
  }
  syncDiv.textContent =
    "Last sync: " + (date ? new Date(date).toLocaleString() : "Never");
};