// This game's text layer: the shared 5x7 pixel font from the library, with this game's ink applied.
//
// The renderer itself is engine and lives in src/lib/engine/text.ts, shared with the sibling game.
// The only thing that differs between the two is the ink -- this game's cool near-black #120c14
// against the sibling's warm #2A1F1A -- so the library takes it as a default and each game sets its
// own. It is set HERE, as an import side effect, rather than at startup in main.js, so that any
// entry point gets the right ink: the game, the contact sheet, the headless playtest, the
// art-invariant runner. There is no ordering to get wrong.
//
// It is set explicitly even though the library's built-in default happens to be this game's value,
// so that changing the library default can never silently restyle this game.
import { setTextDefaults } from '../lib/engine/text.ts';

setTextDefaults({ shadowColor: '#120c14', outline: '#120c14' });

export * from '../lib/engine/text.ts';
