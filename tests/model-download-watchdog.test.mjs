import test from "node:test";
import assert from "node:assert/strict";
import {firstDownloadProgress,noteDownloadProgress,downloadHasStalled,downloadNeedsNotice,DOWNLOAD_STALL_MS,isDownloadStallError,stalledDownloadError} from "../src/local-ai/model-download-watchdog.ts";

test("Repeated fetch-params callbacks without numeric advancement cannot keep download alive",()=>{
 let state=firstDownloadProgress(0);
 for(let i=10000;i<180000;i+=10000)state=noteDownloadProgress(state,0,i);
 assert.equal(state.lastAdvancedAt,0);
 assert.equal(downloadNeedsNotice(state,30000),true);
 assert.equal(downloadHasStalled(state,180000),true);
 assert.equal(downloadHasStalled(state,179999),false);
});
test("Actual shard download progress resets stall window",()=>{
 let state=firstDownloadProgress(0);
 state=noteDownloadProgress(state,0.2,170000);
 assert.equal(state.lastAdvancedAt,170000);
 state=noteDownloadProgress(state,0.2,250000); // duplicate numeric progress
 assert.equal(downloadHasStalled(state,340000),false);
 assert.equal(downloadHasStalled(state,350000),true);
 state=noteDownloadProgress(state,0.23,350000);
 assert.equal(downloadHasStalled(state,350000+DOWNLOAD_STALL_MS-1),false);
});
test("Bad WebLLM progress input cannot suppress stall detection",()=>{
 const state=noteDownloadProgress(firstDownloadProgress(0),Number.NaN,100000);
 assert.equal(state.highest,0);
 assert.equal(downloadHasStalled(state,180000),true);
 assert.equal(isDownloadStallError(stalledDownloadError()),true);
 assert.equal(isDownloadStallError(Error("worker-stalled")),false);
});
