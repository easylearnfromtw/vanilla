import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationEndpoint,dispatchNotifications} from '../services/detroit-jobs/notifications.mjs';
const valid={DETROIT_NOTIFY_WEBHOOK:'https://notifications.example.com/hook',DETROIT_NOTIFY_HOST:'notifications.example.com',DETROIT_NOTIFY_SECRET:'0123456789abcdef0123456789abcdef'};
test('notification endpoint requires explicit pinned HTTPS host',()=>{
 assert.equal(notificationEndpoint({}),null);
 assert.throws(()=>notificationEndpoint({...valid,DETROIT_NOTIFY_WEBHOOK:'http://notifications.example.com/hook'}),/HTTPS/);
 assert.throws(()=>notificationEndpoint({...valid,DETROIT_NOTIFY_WEBHOOK:'https://evil.example.com/hook'}),/pinned/);
 assert.equal(notificationEndpoint(valid),valid.DETROIT_NOTIFY_WEBHOOK);
});
test('notifications are never sent when webhook is not configured',async()=>{
 let sent=0;
 const none={DETROIT_DB:{prepare:()=>{throw Error('Unexpected query without webhook');}}};
 const r=await dispatchNotifications(none,Date.now(),async()=>{sent++;return new Response();});
 assert.equal(r.status,'not_configured');assert.equal(sent,0);
});
test('notifications reject improperly configured signing secret before delivery',async()=>{
 await assert.rejects(()=>dispatchNotifications({...valid,DETROIT_NOTIFY_SECRET:'short',DETROIT_DB:{}},Date.now()),/32/);
});
