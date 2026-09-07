import double from './double.js';
import sink from './sink.js';

/**
 * Whack-a-Mole module registry. Same hook API as Target Rush
 * (see games/target-rush/modules/shrink.js); there are no moving targets here.
 */
export const modules = [double, sink];
