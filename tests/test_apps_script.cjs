const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function context(){
 const props=new Map();let email='owner@example.com',content='',created=0,locked=false;
 const file={getId:()=> 'file-id',getBlob:()=>({getDataAsString:()=>content}),setContent:s=>{content=s}};
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})},LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(locked,false);locked=true},releaseLock:()=>locked=false})},DriveApp:{createFolder:()=>({createFile:(_,s)=>{content=s;created++;return file}}),getFileById:()=>file},MimeType:{PLAIN_TEXT:'text/plain'}});
 vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 return {c,setEmail:e=>email=e,created:()=>created,locked:()=>locked};
}
test('setup is repeatable; block lifecycle persists; category deletion cascades',()=>{
 const {c,created,locked}=context();c.setup();c.setup();assert.equal(created(),1);
 assert.equal(c.libraryApi('library','GET').categories.length,3);
 const cat=c.libraryApi('categories','POST',{name:'Landing'}).id;
 const input={name:'Card',category_id:cat,html:'<h1>Hi</h1>',css:'h1{color:red}'};
 const id=c.libraryApi('blocks','POST',input).id;
 assert.equal(c.libraryApi('library','GET').blocks[0].html,input.html);
 c.libraryApi('blocks/'+id,'PUT',{...input,name:'Changed'});
 assert.equal(c.libraryApi('library','GET').blocks[0].name,'Changed');
 c.libraryApi('blocks/'+id,'DELETE');assert.equal(c.libraryApi('library','GET').blocks.length,0);
 c.libraryApi('blocks','POST',input);c.libraryApi('categories/'+cat,'DELETE');
 assert.equal(c.libraryApi('library','GET').blocks.length,0);assert.equal(locked(),false);
});
test('unauthorized and unidentified users cannot read, write, or set up',()=>{
 const {c,setEmail}=context();c.setup();for(const email of ['stranger@example.com','']){setEmail(email);assert.throws(()=>c.libraryApi('library','GET'));assert.throws(()=>c.libraryApi('categories','POST',{name:'x'}));assert.throws(()=>c.setup());}
});
test('validation failures preserve data and release lock',()=>{
 const {c,locked}=context();c.setup();assert.throws(()=>c.libraryApi('categories','POST',{name:' '}));
 assert.throws(()=>c.libraryApi('blocks','POST',{name:'x',category_id:999,html:'',css:''}));
 assert.throws(()=>c.libraryApi('blocks','POST',{name:'x',category_id:1,html:'x'.repeat(500001),css:''}));
 assert.equal(c.libraryApi('library','GET').blocks.length,0);assert.equal(locked(),false);
 for(const cat of c.libraryApi('library','GET').categories)c.libraryApi('categories/'+cat.id,'DELETE');
 c.setup();assert.equal(c.libraryApi('library','GET').categories.length,0);
});
