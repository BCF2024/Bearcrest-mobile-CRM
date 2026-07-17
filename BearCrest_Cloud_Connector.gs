const ROOT_FOLDER_NAME = 'BearCrest CRM Documents';
const SUBFOLDERS = ['Application','Identity','Entity','Property','Financial','Insurance','Underwriting','Closing','Generated Documents','Other'];

const LENDERS_PROPERTY_PREFIX = 'BCF_LENDERS_';
const LENDERS_COUNT_KEY = 'BCF_LENDERS_CHUNK_COUNT';
const PROPERTY_CHUNK_SIZE = 8000;

const DEFAULT_LENDERS = [
  'Unitas Funding','Kiavi','Visio Lending','Ternus Lending','Quickline Capital',
  'RCN Capital','Easy Street Capital','IceCap Group','New Silver','Rock Capital',
  'Velocity Mortgage Capital','Deephaven Mortgage','Groundfloor','Anchor Loans',
  'Constructive Capital','EquityMax','First Equity Funding','Capital Funding',
  'Lendo One','ABL Funding','A&D Mortgages','Tidal Loans','Cogo Capital',
  'Private Capital','Other'
];

function doGet(){
  return json_({ok:true,message:'BearCrest Cloud Connector Version 4.0 is running.'});
}

function doPost(e){
  try{
    const action=(e.parameter.action||'').trim();
    const payload=JSON.parse(e.parameter.payload||'{}');

    if(action==='ping')return json_({ok:true,message:'Google Drive connection successful.'});
    if(action==='ensureLoanFolder')return json_(ensureLoanFolder_(payload));
    if(action==='uploadFile')return json_(uploadFile_(payload));
    if(action==='listFiles')return json_(listFiles_(payload));
    if(action==='syncJotform')return json_(syncJotform_(payload));
    if(action==='sendEmail')return json_(sendEmail_(payload));
    if(action==='createCalendarEvent')return json_(createCalendarEvent_(payload));
    if(action==='uploadLibraryFile')return json_(uploadLibraryFile_(payload));
    if(action==='listLibraryFiles')return json_(listLibraryFiles_(payload));
    if(action==='deleteLibraryFile')return json_(deleteLibraryFile_(payload));
    if(action==='saveCRMDatabase')return json_(saveCRMDatabase_(payload));
    if(action==='loadCRMDatabase')return json_(loadCRMDatabase_(payload));

    if(action==='listLenders')return json_(listLenders_(payload));
    if(action==='saveLender')return json_(saveLender_(payload));
    if(action==='setLenderActive')return json_(setLenderActive_(payload));
    if(action==='reorderLenders')return json_(reorderLenders_(payload));

    return json_({ok:false,error:'Unknown action.'});
  }catch(err){
    return json_({ok:false,error:String(err.message||err)});
  }
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function root_(name){
  name=clean_(name||ROOT_FOLDER_NAME)||ROOT_FOLDER_NAME;
  const it=DriveApp.getFoldersByName(name);
  return it.hasNext()?it.next():DriveApp.createFolder(name);
}

function clean_(s){
  return String(s||'')
    .replace(/[\\/:*?"<>|#%]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,140);
}

function ensureLoanFolder_(p){
  const root=root_(p.rootFolder);
  const name=clean_(`${p.loanNumber||'Unnumbered Loan'} - ${p.propertyAddress||p.borrowerName||'New Application'}`);
  const props=PropertiesService.getScriptProperties();
  const key='loan_'+p.loanId;
  let folder;
  const existing=props.getProperty(key);

  if(existing){
    try{folder=DriveApp.getFolderById(existing);}catch(e){}
  }

  if(!folder){
    const it=root.getFoldersByName(name);
    folder=it.hasNext()?it.next():root.createFolder(name);
    props.setProperty(key,folder.getId());
  }

  SUBFOLDERS.forEach(n=>{
    if(!folder.getFoldersByName(n).hasNext())folder.createFolder(n);
  });

  return {ok:true,folderId:folder.getId(),folderUrl:folder.getUrl()};
}

function categoryFolder_(parent,category){
  const name=SUBFOLDERS.includes(category)?category:'Other';
  const it=parent.getFoldersByName(name);
  return it.hasNext()?it.next():parent.createFolder(name);
}

function uploadFile_(p){
  const parent=DriveApp.getFolderById(p.folderId);
  const folder=categoryFolder_(parent,p.category);
  const bytes=Utilities.base64Decode(p.base64);
  const blob=Utilities.newBlob(bytes,p.mimeType||'application/octet-stream',clean_(p.name||'Document'));
  const f=folder.createFile(blob);
  return {ok:true,id:f.getId(),url:f.getUrl(),name:f.getName()};
}

function listFiles_(p){
  const parent=DriveApp.getFolderById(p.folderId);
  const files=[];
  const folders=parent.getFolders();

  while(folders.hasNext()){
    const folder=folders.next();
    const it=folder.getFiles();
    while(it.hasNext()){
      const f=it.next();
      files.push({
        id:f.getId(),
        name:f.getName(),
        url:f.getUrl(),
        size:f.getSize(),
        mimeType:f.getMimeType(),
        modified:Utilities.formatDate(f.getLastUpdated(),Session.getScriptTimeZone(),'MM/dd/yyyy'),
        modifiedTimestamp:f.getLastUpdated().getTime(),
        category:folder.getName()
      });
    }
  }

  files.sort((a,b)=>b.modifiedTimestamp-a.modifiedTimestamp);
  return {ok:true,files:files};
}

function syncJotform_(p){
  const key=PropertiesService.getScriptProperties().getProperty('JOTFORM_API_KEY');
  if(!key)throw new Error('Add JOTFORM_API_KEY in Apps Script Project Settings > Script Properties.');

  const url=`https://api.jotform.com/form/${encodeURIComponent(p.formId)}/submissions?apiKey=${encodeURIComponent(key)}&limit=100&orderby=created_at`;
  const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
  const data=JSON.parse(res.getContentText());

  if(data.responseCode!==200)throw new Error(data.message||'Jotform could not be read.');
  return {ok:true,submissions:data.content||[]};
}


function validateEmailList_(value){
  const text=String(value||'').trim();
  if(!text)return '';
  const emails=text.split(/[,;]/).map(v=>v.trim()).filter(Boolean);
  const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  emails.forEach(email=>{
    if(!valid.test(email))throw new Error('Invalid email address: '+email);
  });
  return emails.join(',');
}

function buildEmailAttachments_(items){
  const attachments=[];
  (items||[]).forEach(item=>{
    if(item.source==='drive' && item.fileId){
      const file=DriveApp.getFileById(item.fileId);
      attachments.push(file.getBlob().setName(item.name||file.getName()));
      return;
    }

    if(item.source==='upload' && item.base64){
      const bytes=Utilities.base64Decode(item.base64);
      attachments.push(
        Utilities.newBlob(
          bytes,
          item.mimeType||'application/octet-stream',
          clean_(item.name||'Attachment')
        )
      );
    }
  });
  return attachments;
}

function sendEmail_(p){
  const to=validateEmailList_(p.to);
  if(!to)throw new Error('Recipient email is required.');

  const subject=String(p.subject||'').trim();
  if(!subject)throw new Error('Email subject is required.');

  const plainBody=String(p.plainBody||'').trim();
  if(!plainBody)throw new Error('Email message is required.');

  const options={
    htmlBody:String(p.htmlBody||''),
    name:String(p.senderName||'BearCrest Funding, LLC').trim()||'BearCrest Funding, LLC'
  };

  const cc=validateEmailList_(p.cc);
  const bcc=validateEmailList_(p.bcc);
  const replyTo=String(p.replyTo||'').trim();
  const attachments=buildEmailAttachments_(p.attachments||[]);

  if(cc)options.cc=cc;
  if(bcc)options.bcc=bcc;
  if(replyTo)options.replyTo=replyTo;
  if(attachments.length)options.attachments=attachments;

  GmailApp.sendEmail(to,subject,plainBody,options);

  return {
    ok:true,
    message:'Email sent successfully.',
    sentAt:new Date().toISOString(),
    messageId:Utilities.getUuid(),
    attachmentCount:attachments.length
  };
}


function createCalendarEvent_(p){
  const title=String(p.title||'').trim();
  const date=String(p.date||'').trim();
  const time=String(p.time||'09:00').trim();
  if(!title)throw new Error('Calendar event title is required.');
  if(!date)throw new Error('Calendar event date is required.');
  const parts=date.split('-').map(Number);
  const timeParts=time.split(':').map(Number);
  const start=new Date(parts[0],parts[1]-1,parts[2],timeParts[0]||9,timeParts[1]||0,0);
  const end=new Date(start.getTime()+60*60*1000);
  const event=CalendarApp.getDefaultCalendar().createEvent(title,start,end,{description:String(p.description||'')});
  return {ok:true,eventId:event.getId(),eventUrl:'https://calendar.google.com/calendar/u/0/r',start:start.toISOString()};
}


function documentLibraryRoot_(rootFolderName){
  const root=root_(rootFolderName);
  const name='CRM Document Library';
  const folders=root.getFoldersByName(name);
  return folders.hasNext()?folders.next():root.createFolder(name);
}

function documentLibraryCategory_(root,category){
  const name=clean_(category||'Other')||'Other';
  const folders=root.getFoldersByName(name);
  return folders.hasNext()?folders.next():root.createFolder(name);
}

function uploadLibraryFile_(p){
  const library=documentLibraryRoot_(p.rootFolder);
  const folder=documentLibraryCategory_(library,p.category);
  const bytes=Utilities.base64Decode(p.base64);
  const blob=Utilities.newBlob(bytes,p.mimeType||'application/octet-stream',clean_(p.name||'Document'));
  const file=folder.createFile(blob);
  if(p.description)file.setDescription(String(p.description));
  return {ok:true,id:file.getId(),name:file.getName(),url:file.getUrl()};
}

function listLibraryFiles_(p){
  const library=documentLibraryRoot_(p.rootFolder);
  const files=[];
  const folders=library.getFolders();
  while(folders.hasNext()){
    const folder=folders.next();
    const iter=folder.getFiles();
    while(iter.hasNext()){
      const file=iter.next();
      files.push({
        id:file.getId(),
        name:file.getName(),
        url:file.getUrl(),
        size:file.getSize(),
        mimeType:file.getMimeType(),
        modified:Utilities.formatDate(file.getLastUpdated(),Session.getScriptTimeZone(),'MM/dd/yyyy'),
        modifiedTimestamp:file.getLastUpdated().getTime(),
        category:folder.getName(),
        description:file.getDescription()||''
      });
    }
  }
  files.sort((a,b)=>b.modifiedTimestamp-a.modifiedTimestamp);
  return {ok:true,files:files};
}

function deleteLibraryFile_(p){
  if(!p.fileId)throw new Error('File ID is required.');
  DriveApp.getFileById(p.fileId).setTrashed(true);
  return {ok:true};
}


function crmDatabaseFile_(rootFolderName){
  const root=root_(rootFolderName);
  const name='BearCrest_CRM_Shared_Database.json';
  const files=root.getFilesByName(name);
  return files.hasNext()?files.next():null;
}

function saveCRMDatabase_(p){
  const root=root_(p.rootFolder);
  const name='BearCrest_CRM_Shared_Database.json';
  const content=JSON.stringify(p.database||{},null,2);
  const existing=crmDatabaseFile_(p.rootFolder);
  let file;
  if(existing){
    existing.setContent(content);
    file=existing;
  }else{
    file=root.createFile(name,content,MimeType.PLAIN_TEXT);
  }
  return {ok:true,fileId:file.getId(),url:file.getUrl(),savedAt:new Date().toISOString()};
}

function loadCRMDatabase_(p){
  const file=crmDatabaseFile_(p.rootFolder);
  if(!file)return {ok:true,exists:false};
  const database=JSON.parse(file.getBlob().getDataAsString());
  return {ok:true,exists:true,database:database,fileId:file.getId(),url:file.getUrl()};
}

/* LENDER MANAGEMENT */

function createDefaultLenders_(){
  return DEFAULT_LENDERS.map((name,index)=>({
    id:Utilities.getUuid(),
    name:name,
    active:true,
    order:index+1,
    contactName:'',
    email:'',
    phone:'',
    portalUrl:'',
    notes:'',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  }));
}

function readChunkedProperty_(){
  const props=PropertiesService.getScriptProperties();
  const count=Number(props.getProperty(LENDERS_COUNT_KEY)||0);
  if(!count)return '';

  let value='';
  for(let i=0;i<count;i++){
    value+=props.getProperty(LENDERS_PROPERTY_PREFIX+i)||'';
  }
  return value;
}

function writeChunkedProperty_(value){
  const props=PropertiesService.getScriptProperties();
  const oldCount=Number(props.getProperty(LENDERS_COUNT_KEY)||0);
  const chunks=[];

  for(let i=0;i<value.length;i+=PROPERTY_CHUNK_SIZE){
    chunks.push(value.slice(i,i+PROPERTY_CHUNK_SIZE));
  }

  chunks.forEach((chunk,index)=>{
    props.setProperty(LENDERS_PROPERTY_PREFIX+index,chunk);
  });

  for(let i=chunks.length;i<oldCount;i++){
    props.deleteProperty(LENDERS_PROPERTY_PREFIX+i);
  }

  props.setProperty(LENDERS_COUNT_KEY,String(chunks.length));
}

function getStoredLenders_(){
  const stored=readChunkedProperty_();

  if(!stored){
    const defaults=createDefaultLenders_();
    saveStoredLenders_(defaults);
    return defaults;
  }

  try{
    const lenders=JSON.parse(stored);
    if(!Array.isArray(lenders))throw new Error('Invalid lender list.');
    return lenders;
  }catch(error){
    const defaults=createDefaultLenders_();
    saveStoredLenders_(defaults);
    return defaults;
  }
}

function saveStoredLenders_(lenders){
  writeChunkedProperty_(JSON.stringify(lenders));
}

function listLenders_(p){
  let lenders=getStoredLenders_();
  lenders.sort((a,b)=>Number(a.order||0)-Number(b.order||0));

  if(p.activeOnly===true){
    lenders=lenders.filter(l=>l.active!==false);
  }

  return {ok:true,lenders:lenders};
}

function saveLender_(p){
  const name=clean_(p.name);
  if(!name)throw new Error('Lender name is required.');

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);

  try{
    const lenders=getStoredLenders_();
    const now=new Date().toISOString();
    let lender=p.id?lenders.find(item=>item.id===p.id):null;

    const duplicate=lenders.find(item=>
      item.id!==(lender&&lender.id) &&
      String(item.name).toLowerCase()===name.toLowerCase()
    );
    if(duplicate)throw new Error('A lender with that name already exists.');

    if(!lender){
      lender={
        id:Utilities.getUuid(),
        name:name,
        active:true,
        order:lenders.length+1,
        contactName:'',
        email:'',
        phone:'',
        portalUrl:'',
        notes:'',
        createdAt:now,
        updatedAt:now
      };
      lenders.push(lender);
    }

    lender.name=name;
    lender.contactName=clean_(p.contactName);
    lender.email=String(p.email||'').trim();
    lender.phone=String(p.phone||'').trim();
    lender.portalUrl=String(p.portalUrl||'').trim();
    lender.notes=String(p.notes||'').trim();
    if(typeof p.active==='boolean')lender.active=p.active;
    lender.updatedAt=now;

    saveStoredLenders_(lenders);
    return {ok:true,lender:lender,lenders:lenders};
  }finally{
    lock.releaseLock();
  }
}

function setLenderActive_(p){
  if(!p.id)throw new Error('Lender ID is required.');

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);

  try{
    const lenders=getStoredLenders_();
    const lender=lenders.find(item=>item.id===p.id);
    if(!lender)throw new Error('Lender was not found.');

    lender.active=p.active!==false;
    lender.updatedAt=new Date().toISOString();
    saveStoredLenders_(lenders);

    return {ok:true,lender:lender,lenders:lenders};
  }finally{
    lock.releaseLock();
  }
}

function reorderLenders_(p){
  if(!Array.isArray(p.ids))throw new Error('A lender ID order list is required.');

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);

  try{
    const lenders=getStoredLenders_();

    p.ids.forEach((id,index)=>{
      const lender=lenders.find(item=>item.id===id);
      if(lender){
        lender.order=index+1;
        lender.updatedAt=new Date().toISOString();
      }
    });

    lenders.sort((a,b)=>Number(a.order||0)-Number(b.order||0));
    saveStoredLenders_(lenders);
    return {ok:true,lenders:lenders};
  }finally{
    lock.releaseLock();
  }
}
