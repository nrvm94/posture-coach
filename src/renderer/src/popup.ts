import type { Api } from '../../shared/types';
import { chime } from './chime';
import './popup.css';

const api = (window as unknown as { api: Api }).api;
const params = new URLSearchParams(location.search);

document.getElementById('title')!.textContent = params.get('title');
document.getElementById('body')!.textContent = params.get('body');
document.getElementById('dismiss')!.addEventListener('click', () => api.dismissReminder());
requestAnimationFrame(() => document.getElementById('card')!.classList.add('in'));

if (params.get('sound') === '1') chime();
