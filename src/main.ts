import './styles/main.css';
import { Game } from './core/Game';
import { $ } from './utils/dom';

const game = new Game();

try {
  game.init();
} catch (err) {
  const loading = $('loading');
  loading.textContent = 'Failed to load: ' + (err instanceof Error ? err.message : String(err));
  console.error(err);
}
