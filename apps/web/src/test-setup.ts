import { setLanguage } from './lib/i18n/index.ts';

// Most tests read English text; i18n.test.ts switches to Spanish where it checks that.
setLanguage('en');
