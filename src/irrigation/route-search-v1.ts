/** Bounded Yen loopless paths. Pure integer graph; no terrain producer or world state. */
export interface RouteBudget {used:number;limit:number;exhausted:boolean}
export function spend(b:RouteBudget):boolean {if(b.used>=b.limit){b.exhausted=true;return false;}b.used++;return true;}
export interface RouteGraph {readonly size:number;readonly source:number;readonly sink:number;neighbors:(node:number)=>readonly number[]}
type Path=readonly number[];
interface SearchWorkspace {parents:Int32Array;visited:Uint32Array;queue:Int32Array;generation:number}
function shortest(g:RouteGraph,start:number,bannedNodes:ReadonlySet<number>,bannedEdges:ReadonlySet<number>,budget:RouteBudget,work:SearchWorkspace):number[]|null {
 const {parents,visited,queue}=work;let head=0,tail=0;
 if(++work.generation>0xffffffff){visited.fill(0);work.generation=1;}const generation=work.generation;
 if(bannedNodes.has(start)||!spend(budget))return null;visited[start]=generation;parents[start]=start;queue[tail++]=start;
 while(head<tail){const node=queue[head++]!;if(node===g.sink){const out=[node];while(out[out.length-1]!==start)out.push(parents[out[out.length-1]!]!);return out.reverse();}
  for(const next of g.neighbors(node)){if(visited[next]===generation||bannedNodes.has(next)||bannedEdges.has(node*g.size+next))continue;if(!spend(budget))return null;visited[next]=generation;parents[next]=node;queue[tail++]=next;}
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
 // Private to this enumeration: spur searches reuse memory without clearing the
 // entire terrain-sized parent array. Visit stamps retain identical BFS order,
 // paths and budget accounting; concurrently paused generators share no scratch.
 const work:SearchWorkspace={parents:new Int32Array(g.size),visited:new Uint32Array(g.size),queue:new Int32Array(g.size),generation:0};
 const first=shortest(g,g.source,new Set(),new Set(),budget,work);if(!first)return;
 const accepted:number[][]=[],seen=new Set<string>([first.join(',')]),candidates=new PathHeap(compare);let current=first;
 while(!budget.exhausted){accepted.push(current);yield current;
  for(let i=0;i<current.length-1;i++){
   const prefix=current.slice(0,i),bannedEdges=new Set<number>();
   for(const path of accepted)if(path.length>i+1&&path.slice(0,i+1).every((v,n)=>v===current[n]))bannedEdges.add(path[i]!*g.size+path[i+1]!);
   const spur=shortest(g,current[i]!,new Set(prefix),bannedEdges,budget,work);if(budget.exhausted)return;if(!spur)continue;
   const path=[...prefix,...spur],key=path.join(',');if(seen.has(key))continue;if(!spend(budget))return;seen.add(key);candidates.push(path);
  }
  if(!candidates.length)return;current=candidates.pop();
 }
}
