/** Pure Google Analytics data conversion: GA4 is a data source, CREAM does analytics. */
import {fromCreamRows,type CreamDataset} from "./core.ts";
export type GA4Property={id:string;name:string;accountId:string;accountName:string};
export type GA4Metric="activeUsers"|"sessions"|"eventCount"|"totalUsers"|"screenPageViews";
export type GA4Dimension="date"|"sessionDefaultChannelGroup"|"country"|"eventName";
export type GA4ReportOptions={propertyId:string;dimension:GA4Dimension;metric:GA4Metric;days:7|28|90};
export type GA4Report={dataset:CreamDataset;propertyId:string;query:GA4ReportOptions;rowCount:number;sourceUrl:string};
const CLIENT=/^\d{8,21}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
export function validateGoogleClientId(input:string):string{
 const id=input.trim();
 if(!CLIENT.test(id))throw Error("請填入完整的 Google OAuth Client ID（…apps.googleusercontent.com），不要填寫 GOCSPX- 開頭的 Client Secret。");
 return id;
}

export function parseAccountSummaries(raw:unknown):GA4Property[]{
 const data=raw as {accountSummaries?:Array<{account?:unknown;displayName?:unknown;propertySummaries?:Array<{property?:unknown;displayName?:unknown}>}>};
 const properties:GA4Property[]=[];
 for(const account of (Array.isArray(data?.accountSummaries)?data.accountSummaries:[])){
  const accountId=String(account.account||"").replace(/^accounts\//,"");
  if(!/^\d+$/.test(accountId))continue;
  for(const p of Array.isArray(account.propertySummaries)?account.propertySummaries:[]){
   const id=String(p.property||"").replace(/^properties\//,"");
   if(!/^\d+$/.test(id))continue;
   properties.push({id,name:String(p.displayName||"GA4 "+id).slice(0,130),accountId,accountName:String(account.displayName||"").slice(0,120)});
  }
 }
 return properties;
}

export function validateGA4Options(options:GA4ReportOptions):GA4ReportOptions{
 if(!/^\d{1,20}$/.test(options.propertyId)||!["date","sessionDefaultChannelGroup","country","eventName"].includes(options.dimension)||
 !["activeUsers","sessions","eventCount","totalUsers","screenPageViews"].includes(options.metric)||
 ![7,28,90].includes(options.days))throw Error("不支援的 GA4 Property ID、維度、指標或日期範圍");
 return options;
}
export function parseGA4Report(raw:unknown,options:GA4ReportOptions):GA4Report{
 validateGA4Options(options);
 const data=raw as {rows?:Array<{dimensionValues?:Array<{value?:unknown}>;metricValues?:Array<{value?:unknown}>}>;rowCount?:number};
 const rows:unknown[][]=[[options.dimension,options.metric]];
 const input=Array.isArray(data?.rows)?data.rows:[];
 for(const item of input.slice(0,2999)){
  let label=String(item.dimensionValues?.[0]?.value??"").trim().slice(0,120);
  const metric=String(item.metricValues?.[0]?.value??"").trim();
  if(options.dimension==="date"&&/^\d{8}$/.test(label))label=label.slice(0,4)+"-"+label.slice(4,6)+"-"+label.slice(6);
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(metric))continue;
  rows.push([label,metric]);
 }
 if(rows.length<2)throw Error("這個 GA4 資源沒有可供 CREAM 分析的數值資料；請換日期或指標");
 const propertyId=options.propertyId;
 return {dataset:fromCreamRows(rows,"GA4 Property "+propertyId+" · "+options.metric+" / "+options.days+" 日"),
  propertyId,query:{...options},rowCount:Number(data.rowCount)||rows.length-1,
  sourceUrl:"https://analytics.google.com/analytics/web/#/p"+propertyId};
}

/** Official Looker Studio Linking API: user owns and confirms the new report in Google UI.
 * No Looker Studio OAuth secret is needed to open this URL.
 */
export function lookerStudioLink(property:GA4Property):string{
 if(!/^\d+$/.test(property.id)||!/^\d+$/.test(property.accountId))throw Error("GA4 帳戶與資源 ID 格式錯誤");
 const u=new URL("https://lookerstudio.google.com/reporting/create");
 u.searchParams.set("r.reportName","CREAM · GA4 · "+property.name.slice(0,50));
 u.searchParams.set("ds.ds0.connector","googleAnalytics");
 u.searchParams.set("ds.ds0.accountId",property.accountId);
 u.searchParams.set("ds.ds0.propertyId",property.id);
 u.searchParams.set("ds.ds0.refreshFields","true");
 return u.toString();
}
