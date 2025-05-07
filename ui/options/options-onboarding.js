// ui/options/options-onboarding.js

const onboardingSteps = [
  {
    title: "Welcome to TabTogether!",
    content:
      "<p>TabTogether lets you send tabs to groups of devices instantly. This onboarding will guide you through the main features.</p>",
  },
  {
    title: "Device Settings",
    content:
      "<p>Set your device name and icon. This helps you identify your devices in groups and the registry.</p>",
  },
  {
    title: "Groups",
    content:
      "<p>Create, rename, and delete groups. Subscribe your devices to groups to send tabs between them.</p>",
  },
  {
    title: "Notifications & Sync",
    content:
      "<p>Customize notification sound and duration. Use manual or auto-sync to keep your devices up to date.</p>",
  },
  {
    title: "Help & About",
    content:
      "<p>Find more help in the Help/About section or on the project page. You can always reopen this onboarding from the link at the bottom of the settings page.</p>",
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

  // Optionally, decide if onboarding should show automatically on first load
  // For example, by checking a flag in localStorage.
  // if (!localStorage.getItem('onboardingComplete')) {
  //   elements.modal.classList.remove("hidden");
  //   showOnboardingStep(0, elements);
  //   localStorage.setItem('onboardingComplete', 'true');
  // }
}