import { useEffect } from 'react';
import { Platform } from 'react-native';

// React Native Web renders screens inside fixed-height scroll containers; for printing they must
// expand to their content, and on-screen controls (testID "print-hide") must disappear.
const PRINT_CSS = `
@media print {
  [data-testid="print-hide"] { display: none !important; }
  html, body, #root, #root div { height: auto !important; overflow: visible !important; }
  /* RN Web draws <Image> as a CSS background, which browsers skip when printing by default. */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { margin: 14mm; }
}`;

/** Inject print-only CSS while the calling screen is mounted (web only). */
export function usePrintStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}
