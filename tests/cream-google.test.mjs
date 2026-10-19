import test from "node:test";
import assert from "node:assert/strict";
import {validateGoogleClientId,parseAccountSummaries,validateGA4Options,parseGA4Report,lookerStudioLink} from "../src/cream/ga4-format.ts";

test("only complete Google OAuth Client IDs are accepted; never Client Secrets",()=>{
 const valid="1234567890-exampleclient.apps.googleusercontent.com";
 assert.equal(validateGoogleClientId(valid),valid);
 for(const invalid of ["GOCSPX-example","1234567890-invalid|id.apps.googleusercontent.com",
 "1234567890-invalid/id with spaces.apps.googleusercontent.com",
 "https://accounts.google.com",""]){
  assert.throws(()=>validateGoogleClientId(invalid),/Client ID/,invalid);
 }
});
test("GA4 resource discovery faithfully reads account summaries",()=>{
 const accounts=parseAccountSummaries({accountSummaries:[
  {account:"accounts/123",displayName:"Marketing",propertySummaries:[{property:"properties/456",displayName:"Website A"},{property:"properties/789",displayName:"Website B"}]},
  {account:"accounts/notnumber",propertySummaries:[{property:"properties/123"}]}
 ]});
 assert.deepEqual(accounts.map(p=>p.id),["456","789"]);
 assert.equal(accounts[0].accountId,"123");
 assert.equal(accounts[0].name,"Website A");
});
test("GA4 API numeric responses are converted into CREAM input, not model-estimated numbers",()=>{
 const options={propertyId:"456",dimension:"date",metric:"activeUsers",days:28};
 const report=parseGA4Report({rowCount:2,rows:[
  {dimensionValues:[{value:"20261017"}],metricValues:[{value:"30"}]},
  {dimensionValues:[{value:"20261018"}],metricValues:[{value:"50"}]}
 ]},options);
 assert.deepEqual(report.dataset.columns,["date","activeUsers"]);
 assert.deepEqual(report.dataset.rows,[["2026-10-17","30"],["2026-10-18","50"]]);
 assert.match(report.sourceUrl,/456/);
 assert.equal(report.rowCount,2);
});
test("invalid metrics, property IDs and responses fail without fabricating measurements",()=>{
 assert.throws(()=>validateGA4Options({propertyId:"../456",dimension:"date",metric:"activeUsers",days:28}),/不支援/);
 assert.throws(()=>validateGA4Options({propertyId:"456",dimension:"date",metric:"secretMetric",days:28}),/不支援/);
 assert.throws(()=>parseGA4Report({rows:[]},{propertyId:"456",dimension:"date",metric:"sessions",days:7}),/沒有可供 CREAM/);
});
test("Looker Studio link uses official Google Analytics connector and no secrets",()=>{
 const link=lookerStudioLink({id:"456",accountId:"123",name:"Website A",accountName:"Marketing"});
 const u=new URL(link);
 assert.equal(u.hostname,"lookerstudio.google.com");
 assert.equal(u.searchParams.get("ds.ds0.connector"),"googleAnalytics");
 assert.equal(u.searchParams.get("ds.ds0.accountId"),"123");
 assert.equal(u.searchParams.get("ds.ds0.propertyId"),"456");
 assert.equal(u.searchParams.get("ds.ds0.refreshFields"),"true");
 assert.doesNotMatch(link,/GOCSPX/);
});
