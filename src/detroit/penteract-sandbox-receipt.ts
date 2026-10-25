/** Local SHA-256 consistency check for a user-supplied 10M synthetic 5D artifact
 * and training report. This is NOT a trusted signature, model safety proof,
 * permission grant, or independent benchmark. Never fetches or persists data.
 */
import {assertLearnedFiveWeights,type LearnedFiveWeights} from "./penteract-learned";

export type VerifiedSyntheticFiveDReceipt={
 artifact:LearnedFiveWeights;
 updates:10000000;
 selectedStep:number;
 syntheticValidationLoss:number;
 syntheticSealedTestMatches:number;
 localSha256:string;
 authenticity:"local-sha256-match-only-not-signed";
 authorized:false;
};
const sha256Hex=async(input:string):Promise<string>=>{
 if(typeof crypto==="undefined"||!crypto.subtle)throw Error("5D_WEBCRYPTO_UNAVAILABLE");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
};
export async function verifySyntheticFiveDBundle(
 originalJson:string,reportInput:unknown
):Promise<VerifiedSyntheticFiveDReceipt>{
 if(typeof originalJson!=="string"||originalJson.length>180000)
  throw Error("5D_INVALID_ARTIFACT_SIZE");
 const artifact=assertLearnedFiveWeights(JSON.parse(originalJson));
 if(!reportInput||typeof reportInput!=="object"||Array.isArray(reportInput))
  throw Error("5D_INVALID_TRAINING_REPORT");
 const report=reportInput as Record<string,unknown>;
 const selected=report.bestCheckpointStep;
 const n=Number(selected);
 if(report.schema!==1||report.kind!=="detroit-atuber-penteract-five-d-training-sandbox"||
  report.modelFamily!=="october-linear-five-space-v1"||
  report.actualWeightUpdates!==10000000||report.requestedWeightUpdates!==10000000||
  report.trainableParameters!==1925||report.outputDimensions!==5||
  report.syntheticHoldoutOnly!==true||
  report.sealedSyntheticTestNotUsedForCheckpointSelection!==true||
  report.sealedSyntheticTestRows!==300||
  report.exportedWeightsCheckpointStep!==selected||
  !Number.isInteger(n)||n<20000||n>10000000||n%20000!==0||
  report.additionalUpdatesAfterBest!==10000000-n||
  report.artifactTrainingDataSha256!==artifact.provenance.trainSha256||
  artifact.provenance.epochs!==n/20000||
  artifact.provenance.expertReviewed!==false||
  report.cudaUsed!==false||report.atuber0_6BWeightsUpdated!==false||
  report.octuber30BWeightsUpdated!==false||report.octuber60BWeightsUpdated!==false||
  report.detroitFactoryToolsDispatched!==false||
  report.productionRouterModified!==false||report.permissionsGranted!==false||
  typeof report.syntheticValidationSelectedLoss!=="number"||
  !Number.isFinite(report.syntheticValidationSelectedLoss)||
  typeof report.syntheticValidationLastLoss!=="number"||
  !Number.isFinite(report.syntheticValidationLastLoss)||
  report.syntheticValidationSelectedLoss>report.syntheticValidationLastLoss||
  !Number.isInteger(report.sealedSyntheticTestSelectedMatches)||
  Number(report.sealedSyntheticTestSelectedMatches)<0||
  Number(report.sealedSyntheticTestSelectedMatches)>300||
  typeof report.artifactSha256!=="string"||
  !/^[a-f0-9]{64}$/.test(report.artifactSha256))
  throw Error("5D_TRAINING_REPORT_NOT_ACCEPTED");
 const digest=await sha256Hex(originalJson);
 if(digest!==report.artifactSha256)throw Error("5D_ARTIFACT_SHA256_MISMATCH");
 return {artifact,updates:10000000,selectedStep:n,
  syntheticValidationLoss:report.syntheticValidationSelectedLoss,
  syntheticSealedTestMatches:report.sealedSyntheticTestSelectedMatches,
  localSha256:digest,
  authenticity:"local-sha256-match-only-not-signed",authorized:false};
}
