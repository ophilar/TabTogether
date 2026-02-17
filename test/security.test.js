
import { jest } from '@jest/globals';
import { renderHistoryUI } from '../ui/shared/shared-ui.js';

describe('Security Tests', () => {
    let container;

    beforeEach(() => {
        // Create a container element for the test
        container = document.createElement('div');
    });

    test('renderHistoryUI should not allow javascript: URLs', () => {
        const history = [
            {
                url: 'javascript:alert("XSS")',
                title: 'Malicious Link',
                receivedAt: Date.now(),
                fromDevice: 'Attacker'
            }
        ];

        renderHistoryUI(container, history);

        const link = container.querySelector('a');
        // It should either be null (not rendered as link) or have a safe href
        if (link) {
            expect(link.href).not.toMatch(/^javascript:/);
        } else {
             // If no link is rendered, that's also safe, but we expect the content to be there
             const textContent = container.textContent;
             expect(textContent).toContain('Malicious Link');
        }
    });

    test('renderHistoryUI should render valid http URLs', () => {
        const history = [
            {
                url: 'http://example.com',
                title: 'Example',
                receivedAt: Date.now(),
                fromDevice: 'Sender'
            }
        ];
        renderHistoryUI(container, history);
        const link = container.querySelector('a');
        expect(link).not.toBeNull();
        expect(link.href).toBe('http://example.com/');
        expect(link.rel).toBe('noopener noreferrer');
    });
});
