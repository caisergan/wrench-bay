// The proposal page's view of the words: the game's own table (src/game/unlock-info.js), plus which pads show a
// preview (the facilities' previewModel hooks). NOT part of the game.
import { ICON } from '/src/ui/icons.js';
import { unlockInfo, UNLOCK_CHAINS } from '/src/game/unlock-info.js';

const PREVIEWS = {
  garage: { station: 'station', lift: 'bay', mechanic: 'staff', valet: 'valet', coffee: 'coffee', billboard: 'billboard' },
  paint: { tank: 'station', bay: 'bay', painter: 'staff', preptech: 'valet' },
};
export const describe = (facId, u) => ({ ...unlockInfo(facId, u), ghost: PREVIEWS[facId]?.[u.type] || null });
export const icon = (k) => ICON[k] || ICON.tag;
export const CHAINS = UNLOCK_CHAINS;
