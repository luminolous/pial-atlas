// Display-only grouping; ventral diencephalon remains an undivided aseg label.
export const LIFT_GROUPS = [
  {key:'thalamus',name:'Thalamus',ids:[10,49]},
  {key:'basal',name:'Basal ganglia',ids:[11,50,12,51,13,52,26,58]},
  {key:'limbic',name:'Limbic structures',ids:[17,53,18,54]},
  {key:'ventricles',name:'Ventricles',ids:[4,43,5,44,14,15]},
  {key:'brainstem',name:'Brainstem',ids:[16]},
  {key:'cerebellum',name:'Cerebellum',ids:[7,46,8,47]},
  {key:'ventral-dc',name:'Ventral diencephalon',ids:[28,60]},
];
export function boundsOf(positions){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++) {const a=i%3;min[a]=Math.min(min[a],positions[i]);max[a]=Math.max(max[a],positions[i]);}return {min,max};}
export function overlaps(a,b,gap=0){return a.min.every((v,i)=>v<b.max[i]+gap&&a.max[i]+gap>b.min[i]);}
export function buildLiftLayout(structures){
  const entries=new Map(),groups=[];const itemGap=16,groupGap=36;
  // Three columns, measured row heights, and two columns within each group.
  // The lifted view looks along +Y; X/Z separation also prevents screen overlap.
  const packed=LIFT_GROUPS.map(group=>{
    const items=group.ids.map(id=>structures.find(s=>s.id===id)).filter(Boolean).map(s=>({id:s.id,source:boundsOf(s.positions)}));
    const widths=[0,0];items.forEach((s,i)=>widths[i%2]=Math.max(widths[i%2],s.source.max[0]-s.source.min[0]));
    let z=0;for(let i=0;i<items.length;i+=2){const row=items.slice(i,i+2),height=Math.max(...row.map(s=>s.source.max[2]-s.source.min[2]));row.forEach((s,j)=>{const w=s.source.max[0]-s.source.min[0],h=s.source.max[2]-s.source.min[2];s.x=(j?widths[0]+itemGap:0)+(widths[j]-w)/2;s.z=z+(height-h)/2;});z+=height+itemGap;}
    return {...group,items,width:widths[0]+(items.length>1?itemGap+widths[1]:0),height:Math.max(0,z-itemGap)+22};
  });
  const columnWidths=[190,190,190],rowHeights=[100,100,100];packed.forEach((g,i)=>{columnWidths[i%3]=Math.max(columnWidths[i%3],g.width);rowHeights[Math.floor(i/3)]=Math.max(rowHeights[Math.floor(i/3)],g.height);});
  const totalWidth=columnWidths.reduce((a,b)=>a+b)+groupGap*2,totalHeight=rowHeights.reduce((a,b)=>a+b)+groupGap*2;
  packed.forEach((g,i)=>{
    const col=i%3,row=Math.floor(i/3),x=-totalWidth/2+columnWidths.slice(0,col).reduce((a,b)=>a+b,0)+groupGap*col+(columnWidths[col]-g.width)/2;
    const z=140+totalHeight-rowHeights.slice(0,row).reduce((a,b)=>a+b,0)-groupGap*row-g.height;
    for(const item of g.items){const {min,max}=item.source,offset=[x+item.x-min[0],-(min[1]+max[1])/2,z+item.z-min[2]];entries.set(item.id,{offset,group:g.key,bounds:{min:min.map((v,a)=>v+offset[a]),max:max.map((v,a)=>v+offset[a])}});}
    groups.push({key:g.key,name:g.name,ids:g.items.map(s=>s.id),anchor:[x+g.width/2,0,z+g.height],bounds:{min:[x,-80,z],max:[x+g.width,80,z+g.height]}});
  });
  return {entries,groups,bounds:{min:[-totalWidth/2,-100,-85],max:[totalWidth/2,100,140+totalHeight+24]},itemGap,groupGap};
}
