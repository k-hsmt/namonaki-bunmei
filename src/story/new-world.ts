/** This producer is loaded only when explicitly creating a new generated world. */
import {generateWorldPrototype} from '../terrain/world-prototype.js';
import {captureTerrainRecord} from '../terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../terrain/river-reaches-review.js';
import {createGeneratedBridgeReview} from './generated-bridge-review.js';
import {generatedSession,observeWorldSession,type WorldSession} from './world-session.js';
export function createNewWorld(seed:number,policy:'terrain-placement-v1'|'terrain-placement-v2'='terrain-placement-v2'):WorldSession {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 if(!['terrain-placement-v1','terrain-placement-v2'].includes(policy))throw Error('Unknown new-world policy');
 const result=generateWorldPrototype(seed);if(result.status!=='ok')throw Error('No viable world');
 const terrain=captureTerrainRecord(result.world,'world-terrain-v1'),review=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only',policy==='terrain-placement-v2'?'organic-v2':undefined);
 if(review.status!=='review-only')throw Error('No viable initial settlement');const session=generatedSession(review);
 for(let i=0;i<3;i++)observeWorldSession(session,0,i);return session;
}
