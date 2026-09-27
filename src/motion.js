// The same tokens are exported to CSS by the standalone build.
export const MOTION = Object.freeze({micro:120,ui:220,layout:450,camera:700,scheme:300,stagger:20,staggerCap:200});
export const EASING = Object.freeze({standard:'cubic-bezier(0.2, 0, 0, 1)',toggle:'cubic-bezier(0.3, 0, 0, 1.2)'});
export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const duration = token => reducedMotion() ? 0 : MOTION[token];
// Solve the cubic Bezier x coordinate before evaluating y. This matches CSS.
export function ease(t){
  t=Math.max(0,Math.min(1,t));let lo=0,hi=1,u=t;
  for(let i=0;i<16;i++){u=(lo+hi)/2;const x=3*(1-u)*(1-u)*u*.2+u*u*u;if(x<t)lo=u;else hi=u;}
  return t===0?0:t===1?1:3*(1-u)*u*u+u*u*u;
}
export class Tweens {
  constructor(){this.items=new Map();}
  to(key,from,to,token,write){const ms=duration(token);if(!ms){write(to);this.items.delete(key);return;}this.items.set(key,{from,to,write,start:performance.now(),ms});}
  tick(now){for(const [key,t] of this.items){const p=reducedMotion()?1:Math.min(1,(now-t.start)/t.ms);t.write(t.from+(t.to-t.from)*ease(p));if(p===1)this.items.delete(key);}}
}
