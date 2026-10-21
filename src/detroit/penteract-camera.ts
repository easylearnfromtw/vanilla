/** October Penteract: explicit 3D camera for a genuine R5→R3→R2 projection.
 * This is a projection of five-dimensional geometry, not a claim that screens
 * can literally display five spatial coordinates. Pure CPU math, no GPU loop.
 */
import type {Vec3} from "./penteract-5d";
export type OrbitCamera={yaw:number;pitch:number;zoom:number};
export type ProjectedScreen={x:number;y:number;depth:number;radius:number};
export const DEFAULT_ORBIT_CAMERA:Readonly<OrbitCamera>=Object.freeze({yaw:0.38,pitch:-0.26,zoom:1});
export function clampOrbitCamera(camera:OrbitCamera):OrbitCamera{
 const clip=(x:number,lo:number,hi:number,fallback:number)=>Number.isFinite(x)?Math.min(hi,Math.max(lo,x)):fallback;
 return {yaw:clip(camera.yaw,-Math.PI,Math.PI,DEFAULT_ORBIT_CAMERA.yaw),
  pitch:clip(camera.pitch,-1.3,1.3,DEFAULT_ORBIT_CAMERA.pitch),
  zoom:clip(camera.zoom,0.65,1.5,DEFAULT_ORBIT_CAMERA.zoom)};
}
export function orbitRotate3D(point:Vec3,camera:OrbitCamera):Vec3{
 const c=clampOrbitCamera(camera);
 const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
 const x=cy*point[0]+sy*point[2];
 const z=-sy*point[0]+cy*point[2];
 return [x,cp*point[1]-sp*z,sp*point[1]+cp*z];
}
export function cameraProject3D(point:Vec3,camera:OrbitCamera):ProjectedScreen{
 if(point.some(v=>!Number.isFinite(v)))throw Error("NONFINITE_3D_COORDINATE");
 const rotated=orbitRotate3D(point,camera);
 const config=clampOrbitCamera(camera);
 // Signed depth is preserved; a fixed, positive near-plane prevents blowups.
 const depth=rotated[2],perspective=6/(6-Math.min(4.5,Math.max(-4.5,depth)));
 return {x:280+rotated[0]*82*config.zoom*perspective,
  y:186-rotated[1]*82*config.zoom*perspective,depth,
  radius:Math.max(1.4,Math.min(5,2.5+depth*0.3))};
}
