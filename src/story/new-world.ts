/** This producer is loaded only when explicitly creating a new generated world. */
import {generateWorldPrototype} from '../terrain/world-prototype.js';
import {captureTerrainRecord} from '../terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../terrain/river-reaches-review.js';
import {createGeneratedBridgeReview} from './generated-bridge-review.js';
import {generatedSession,observeWorldSession,type WorldSession} from './world-session.js';
export function createNewWorld(seed:number):WorldSession {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 const result=generateWorldPrototype(seed);if(result.status!=='ok')throw Error('No viable world');
 const terrain=captureTerrainRecord(result.world,'world-terrain-v1'),review=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only');
 if(review.status!=='review-only')throw Error('No viable initial settlement');const session=generatedSession(review);
 for(let i=0;i<3;i++)observeWorldSession(session,0,i);return session;
}
