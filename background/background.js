import { initAlarms } from "./alarms.js";
import { initContextMenus } from "./context-menus.js";
import { initMessageHandlers } from "./message-handlers.js";
import { initInitialization } from "./init.js";

/**
 * TabTogether Background Entry Point
 * 
 * This file modularizes background responsibilities for better maintainability.
 * Responsibilities are divided into:
 * - alarms.js: Periodic tasks and cleanup
 * - context-menus.js: Browser context menu integration
 * - message-handlers.js: Runtime and storage communication
 * - init.js: Extension lifecycle management
 */

// Initialize all modules
initAlarms();
initContextMenus();
initMessageHandlers();
initInitialization();

console.log("Background: All modules initialized.");
