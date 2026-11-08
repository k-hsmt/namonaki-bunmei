/** Bounded Yen loopless paths. Pure integer graph; no terrain producer or world state. */
export interface RouteBudget {used:number;limit:number;exhausted:boolean}
export function spend(b:RouteBudget):boolean {if(b.used>=b.limit){b.exhausted=true;return false;}b.used++;return true;}
export interface RouteGraph {readonly size:number;readonly source:number;readonly sink:number;neighbors:(node:number)=>readonly number[]}
type Path=readonly number[];
function shortest(g:RouteGraph,start:number,bannedNodes:ReadonlySet<number>,bannedEdges:ReadonlySet<number>,budget:RouteBudget):number[]|null {
 const parents=new Int32Array(g.size);parents.fill(-1);const queue=new Int32Array(g.size);let head=0,tail=0;
 if(bannedNodes.has(start)||!spend(budget))return null;parents[start]=start;queue[tail++]=start;
 while(head<tail){const node=queue[head++]!;if(node===g.sink){const out=[node];while(out[out.length-1]!==start)out.push(parents[out[out.length-1]!]!);return out.reverse();}
  for(const next of g.neighbors(node)){if(parents[next]!==-1||bannedNodes.has(next)||bannedEdges.has(node*g.size+next))continue;if(!spend(budget))return null;parents[next]=node;queue[tail++]=next;}
 }return null;
}
class PathHeap {
 private items:number[][]=[];
 constructor(private compare:(a:Path,b:Path)=>number){}
 get length(){return this.items.length;}
 push(path:number[]){const a=this.items;let i=a.length;a.push(path);while(i>0){const p=(i-1)>>1;if(this.compare(a[p]!,path)<=0)break;a[i]=a[p]!;i=p;}a[i]=path;}
 pop(){const a=this.items,first=a[0]!,last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&this.compare(a[j+1]!,a[j]!)<0)j++;if(this.compare(last,a[j]!)<=0)break;a[i]=a[j]!;i=j;}a[i]=last;}return first;}
}
/** The yielded paths include virtual endpoints. Every enqueue/candidate consumes the shared budget. */
export function* shortestSimpleRoutes(g:RouteGraph,budget:RouteBudget,compare:(a:Path,b:Path)=>number):Generator<number[]> {
 const first=shortest(g,g.source,new Set(),new Set(),budget);if(!first)return;
 const accepted:number[][]=[],seen=new Set<string>([first.join(',')]),candidates=new PathHeap(compare);let current=first;
 while(!budget.exhausted){accepted.push(current);yield current;
  for(let i=0;i<current.length-1;i++){
   const prefix=current.slice(0,i),bannedEdges=new Set<number>();
   for(const path of accepted)if(path.length>i+1&&path.slice(0,i+1).every((v,n)=>v===current[n]))bannedEdges.add(path[i]!*g.size+path[i+1]!);
   const spur=shortest(g,current[i]!,new Set(prefix),bannedEdges,budget);if(budget.exhausted)return;if(!spur)continue;
   const path=[...prefix,...spur],key=path.join(',');if(seen.has(key))continue;if(!spend(budget))return;seen.add(key);candidates.push(path);
  }
  if(!candidates.length)return;current=candidates.pop();
 }
}
