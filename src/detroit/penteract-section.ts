/** Exact axis-aligned 3D section of a 5D hypercube.
 *
 * Hold the intrinsic w and v coordinates constant. For w,v in [-1,1],
 * their intersection with [-1,1]^5 is [-1,1]^3 × {(w,v)}, i.e. eight
 * genuine five-dimensional vertices and twelve one-axis edges.
 *
 * Apply the selected R5 rotation AFTER taking the intrinsic section.
 * This does NOT compute an axis-aligned section in the rotated frame;
 * that would require a separate polytope clipping algorithm.
 *
 * No rendering, network, model call or GPU work.
 */
import type {Vec5} from "./penteract-5d";

export type FiveSlice={w:number;v:number};
export type FiveSliceGeometry={
 vertices:readonly Vec5[];
 edges:readonly (readonly [number,number])[];
 intrinsicCoordinates:Readonly<FiveSlice>;
 dimension:3;
};
export const FIVE_SLICE_EDGES:readonly (readonly [number,number])[]=
 Array.from({length:8},(_,i)=>Array.from({length:3},(_,axis)=>
  [i,i^(1<<axis)] as const).filter(([a,b])=>a<b)).flat();

export function sectionPenteract5D(section:FiveSlice):FiveSliceGeometry {
 const {w,v}=section;
 if(!Number.isFinite(w)||!Number.isFinite(v)||Math.abs(w)>1||Math.abs(v)>1)
  throw new Error("INVALID_5D_SLICE");
 return {
  vertices:Array.from({length:8},(_,i)=>[
   (i&1)?1:-1,(i&2)?1:-1,(i&4)?1:-1,w,v
  ] as Vec5),
  edges:FIVE_SLICE_EDGES,
  intrinsicCoordinates:{w,v},
  dimension:3
 };
}
