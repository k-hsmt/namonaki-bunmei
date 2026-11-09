/** Read-only Mulberry32 state diagnostics, never advances an RNG. */
export function boundedRngDraws(before:number,after:number,limit:number):number {
 if(!Number.isInteger(before)||before<0||before>0xffffffff||!Number.isInteger(after)||after<0||after>0xffffffff||!Number.isSafeInteger(limit)||limit<0||limit>4096)throw Error('Invalid bounded RNG phase');
 const draws=Math.imul((after-before)>>>0,0xdc58aa5d)>>>0;
 if(draws>limit)throw Error('RNG phase exceeds diagnostic kernel bound');
 return draws;
}
export function mulberryOutputAt(state:number):number {let t=state>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
