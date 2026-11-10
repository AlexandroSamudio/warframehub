import { mount } from 'svelte';
import App from './App.svelte';
// Bundled, open-licence fonts (SIL OFL 1.1). Nothing is fetched from font services.
import '@fontsource-variable/inter';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element in index.html');

export default mount(App, { target });
