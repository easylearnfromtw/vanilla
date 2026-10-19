export function visibleSwipeIndex(scrollLeft:number,offsets:readonly number[]):number{
 if(!offsets.length)return 0;
 let closest=0,delta=Infinity;
 for(let i=0;i<offsets.length;i++){
  const d=Math.abs(offsets[i]-scrollLeft);
  if(d<delta){closest=i;delta=d;}
 }
 return closest;
}
