import {athenaInspectBytes} from './athena-quarantine';
self.onmessage=(event:MessageEvent<{name:string;mime:string;bytes:Uint8Array}>)=>{
 const {name,mime,bytes}=event.data;
 try{self.postMessage({findings:athenaInspectBytes(name,mime,new Uint8Array(bytes))});}
 catch{self.postMessage({findings:[{level:'block',reason:'檔案檢查失敗，已隔離'}]});}
};