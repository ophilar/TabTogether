const onboardingSteps = [
  {
    title: "Welcome to TabTogether!",
    content:
      "<p>TabTogether lets you send tabs to groups of devices instantly. This onboarding will guide you through the main features.</p>",
  },
  {
    title: "End-to-End Encryption",
    content:
      "<p>All tabs sent via Firebase are encrypted using your <strong>Master Sync Password</strong>. Only devices with this password can decrypt and open your tabs.</p><p>Set your password in the settings page to get started.</p>",
  },
  {
    title: "Groups & Devices",
    content:
      "<p>Create a group, then 'Join' it from all your devices. Use a unique <strong>Nickname</strong> for each device so you know who sent what.</p>",
  },
  {
    title: "Sending Tabs",
    content:
      "<p>Right-click any page or use the extension popup to 'Send Tab to Group'. It will instantly open on all other active devices in that group.</p>",
  },
  {
    title: "Live Feed",
    content:
      "<p>The settings page shows a <strong>Live Feed</strong> status. You can see which other devices are currently 'online' in your joined groups.</p>",
  },
];

let currentOnboardingStep = 0;

function showOnboardingStep(idx, elements) {
  currentOnboardingStep = idx;
  const step = onboardingSteps[currentOnboardingStep];

  elements.contentArea.textContent = ''; // Clear previous content

  const titleElement = document.createElement('h2');
  titleElement.style.marginTop = '0';
  titleElement.textContent = step.title;
  elements.contentArea.appendChild(titleElement);

  if (step.content && typeof step.content === 'string') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(step.content, 'text/html');
    Array.from(doc.body.childNodes).forEach(node => {
      elements.contentArea.appendChild(node.cloneNode(true));
    });
  }

  elements.prevBtn.disabled = currentOnboardingStep === 0;
  elements.nextBtn.disabled = currentOnboardingStep === onboardingSteps.length - 1;
}

export function setupOnboarding() {
  const onboardingModal = document.getElementById("onboardingModal");
  const onboardingStepContent = document.getElementById("onboardingStepContent");
  const onboardingPrevBtn = document.getElementById("onboardingPrevBtn");
  const onboardingNextBtn = document.getElementById("onboardingNextBtn");
  const onboardingCloseBtn = document.getElementById("onboardingCloseBtn");
  const openOnboardingLink = document.getElementById("openOnboardingLink");

  if (!onboardingModal || !onboardingStepContent || !onboardingPrevBtn || !onboardingNextBtn || !onboardingCloseBtn || !openOnboardingLink) {
    console.warn("Onboarding UI elements not found. Skipping setup.");
    return;
  }

  const elements = {
    modal: onboardingModal,
    contentArea: onboardingStepContent,
    prevBtn: onboardingPrevBtn,
    nextBtn: onboardingNextBtn,
    closeBtn: onboardingCloseBtn,
    openLink: openOnboardingLink,
  };

  elements.openLink.addEventListener("click", (e) => {
    e.preventDefault();
    elements.modal.classList.remove("hidden");
    showOnboardingStep(0, elements);
  });

  elements.prevBtn.onclick = () => showOnboardingStep(Math.max(0, currentOnboardingStep - 1), elements);
  elements.nextBtn.onclick = () => showOnboardingStep(Math.min(onboardingSteps.length - 1, currentOnboardingStep + 1), elements);
  elements.closeBtn.onclick = () => elements.modal.classList.add("hidden");

  // Show onboarding automatically on first load
  browser.storage.local.get('onboardingComplete').then(res => {
    if (!res.onboardingComplete) {
      elements.modal.classList.remove("hidden");
      showOnboardingStep(0, elements);
      browser.storage.local.set({ onboardingComplete: true });
    }
  });
}
