const STORAGE_KEY = "bearcrest_loans_v4_1_clean";
const OLD_STORAGE_KEY = "bearcrest_loans_v4_1_none";
const $ = id => document.getElementById(id);
const STATUSES = ["New Lead","Reviewing","Submitted","Approved","Closing","Closed","Dead","Archived"];
const DOCS = ["Government-issued ID","Bank/asset statements","Entity documents","Purchase contract","Insurance information","Property photos","Scope of work / budget","Experience worksheet","Lease / rent information","Payoff statement"];
const fields = ["loanId","loanNumber","dateReceived","borrowerName","phone","email","entityName","program","propertyAddress","loanAmount","purchasePrice","rehabBudget","arv","status","lender","finalLender","nextFollowUp","targetClosing","dateSubmitted","dateApproved","dateFunded","interestRate","points","loanTerm","leverage","exitStrategy","termExpiration","termConditions","declineReason","missingDocs","notes"];
let showBoard = false;
let todayOnly = false;
let archiveOnly = false;
const SYNC_META_KEY="bearcrest_sync_meta_v4_2";


const FILE_DB_NAME = "bearcrest_crm_files";
const FILE_DB_VERSION = 1;
const FILE_STORE = "documents";
let fileDbPromise;
function openFileDb(){
  if(fileDbPromise) return fileDbPromise;
  fileDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(FILE_DB_NAME,FILE_DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(FILE_STORE)){
        const store=db.createObjectStore(FILE_STORE,{keyPath:"id"});
        store.createIndex("loanId","loanId",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return fileDbPromise;
}
async function addClientFile(loanId,file,category){
  const db=await openFileDb();
  const record={id:uuid(),loanId,name:file.name,type:file.type||"application/octet-stream",size:file.size,category,addedAt:new Date().toISOString(),blob:file};
  await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readwrite");tx.objectStore(FILE_STORE).add(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function getClientFiles(loanId){
  if(!loanId)return [];
  const db=await openFileDb();
  return await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly");const req=tx.objectStore(FILE_STORE).index("loanId").getAll(loanId);req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.addedAt.localeCompare(a.addedAt)));req.onerror=()=>reject(req.error);});
}
async function getClientFile(id){
  const db=await openFileDb();
  return await new Promise((resolve,reject)=>{const req=db.transaction(FILE_STORE,"readonly").objectStore(FILE_STORE).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
async function deleteClientFile(id){
  const db=await openFileDb();
  await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readwrite");tx.objectStore(FILE_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function deleteLoanFiles(loanId){
  const files=await getClientFiles(loanId);
  for(const f of files) await deleteClientFile(f.id);
}
function fileSize(bytes){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}
async function renderClientDocuments(){
  const loanId=$("loanId").value;
  const box=$("clientDocumentList");
  if(!loanId){box.innerHTML='<div class="empty-docs">Save or open a loan to attach documents.</div>';return;}
  try{
    const files=await getClientFiles(loanId);
    box.innerHTML=files.length?files.map(f=>`<div class="document-file-row"><div><strong title="${esc(f.name)}">${esc(f.name)}</strong><small>${new Date(f.addedAt).toLocaleDateString()} · ${fileSize(f.size)}</small></div><div>${esc(f.category)}</div><div>${esc((f.type||"").split("/").pop().toUpperCase()||"FILE")}</div><div class="document-file-actions"><button type="button" onclick="openStoredFile('${f.id}')">Open</button><button type="button" onclick="downloadStoredFile('${f.id}')">Download</button><button type="button" class="danger" onclick="removeStoredFile('${f.id}')">Delete</button></div></div>`).join(""):'<div class="empty-docs">No documents uploaded for this client yet.</div>';
    box.insertAdjacentHTML("beforeend",'<div class="storage-note">Local storage: these files stay in this browser on this device. Use Export Backup for loan data; uploaded files should also be backed up separately.</div>');
  }catch(e){box.innerHTML='<div class="empty-docs">Document storage could not be opened in this browser.</div>';}
}
window.openStoredFile=async id=>{const f=await getClientFile(id);if(!f)return;const u=URL.createObjectURL(f.blob);window.open(u,"_blank");setTimeout(()=>URL.revokeObjectURL(u),60000);};
window.downloadStoredFile=async id=>{const f=await getClientFile(id);if(!f)return;const u=URL.createObjectURL(f.blob),a=document.createElement("a");a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
window.removeStoredFile=async id=>{if(!confirm("Delete this document from the client file?"))return;await deleteClientFile(id);renderClientDocuments();};

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random(); }
function today(){ return new Date().toISOString().slice(0,10); }
function normalizeLoan(x={}){
  return {...x, loanId:x.loanId||uuid(), documents:x.documents||{}};
}
let saved = localStorage.getItem(STORAGE_KEY);
if(!saved){ saved = localStorage.getItem(OLD_STORAGE_KEY); }
let loans = (JSON.parse(saved || "[]")).map(normalizeLoan);
if(!loans.length){ loans=[]; }

function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(loans)); render(); }
function money(v){ if(!v) return ""; return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v)); }
function esc(s){ return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function isOverdue(date,status){ return !!date && !["Closed","Dead","Archived"].includes(status) && date < today(); }
function isDueToday(date,status){ return !!date && !["Closed","Dead","Archived"].includes(status) && date <= today(); }
function missingCount(loan){ return DOCS.filter(d=>!loan.documents?.[d]).length + (loan.missingDocs?.trim()?1:0); }

function renderStats(){
  const active=loans.filter(x=>!["Closed","Dead","Archived"].includes(x.status)).length;
  const followUps=loans.filter(x=>isDueToday(x.nextFollowUp,x.status)).length;
  const newLeads=loans.filter(x=>x.status==="New Lead").length;
  const reviewing=loans.filter(x=>x.status==="Reviewing").length;
  const approved=loans.filter(x=>x.status==="Approved").length;
  const closing=loans.filter(x=>x.status==="Closing").length;
  const closed=loans.filter(x=>x.status==="Closed").length;
  const volume=loans.filter(x=>!["Dead"].includes(x.status)).reduce((sum,x)=>sum+Number(x.loanAmount||0),0);
  $("stats").innerHTML=`<div class="stat"><strong>${newLeads}</strong><span>New Leads</span></div><div class="stat"><strong>${reviewing}</strong><span>Reviewing</span></div><div class="stat"><strong>${followUps}</strong><span>Follow-Ups Due</span></div><div class="stat"><strong>${approved}</strong><span>Approved</span></div><div class="stat"><strong>${closing}</strong><span>Closing</span></div><div class="stat"><strong>${closed}</strong><span>Closed</span></div><div class="stat"><strong>${active}</strong><span>Active Loans</span></div><div class="stat"><strong>${money(volume)}</strong><span>Total Loan Volume</span></div>`;
}
function filteredLoans(){
  const q=$("searchInput").value.toLowerCase().trim();
  const status=$("statusFilter").value;
  return loans.filter(l=>{
    const hay=[l.loanNumber,l.borrowerName,l.phone,l.email,l.propertyAddress,l.program,l.lender,l.finalLender,l.status,l.notes].join(" ").toLowerCase();
    const archiveMatch=archiveOnly ? l.status==="Archived" : l.status!=="Archived";
    const statusMatch=!status || l.status===status;
    return (!q||hay.includes(q)) && statusMatch && archiveMatch && (!todayOnly||isDueToday(l.nextFollowUp,l.status));
  });
}
function renderTable(list){
  $("loanCount").textContent=`${list.length} loan${list.length===1?"":"s"}`;
  $("loanTableBody").innerHTML=list.map(l=>`<tr><td>${esc(l.loanNumber)}</td><td><strong>${esc(l.borrowerName)}</strong><br><small>${esc(l.phone)}</small></td><td>${esc(l.program)}</td><td>${esc(l.propertyAddress)}</td><td><span class="badge">${esc(l.status)}</span></td><td>${money(l.loanAmount)}</td><td>${esc(l.lender||"")}${l.finalLender?`<br><small>Funded by: ${esc(l.finalLender)}</small>`:""}</td><td class="${isOverdue(l.nextFollowUp,l.status)?"overdue":""}">${esc(l.nextFollowUp)}${missingCount(l)?`<br><small>${missingCount(l)} need item(s)</small>`:""}</td><td><button onclick="editLoan('${l.loanId}')">Open</button></td></tr>`).join("") || `<tr><td colspan="9" class="empty-state">No loans match this view.</td></tr>`;
}
function renderBoard(list){
  const boardStatuses=archiveOnly?["Archived"]:STATUSES.filter(status=>status!=="Archived");
  $("boardPanel").innerHTML=boardStatuses.map(status=>{
    const items=list.filter(l=>l.status===status);
    return `<div class="board-column" data-status="${status}"><h3>${status}<span>${items.length}</span></h3>${items.map(l=>`<div class="loan-card ${isOverdue(l.nextFollowUp,l.status)?"overdue-card":""}" draggable="true" data-id="${l.loanId}" onclick="editLoan('${l.loanId}')"><strong>${esc(l.borrowerName||l.loanNumber)}</strong><div>${esc(l.propertyAddress)}</div><small>${esc(l.program)} · ${money(l.loanAmount)}</small><small>Follow-up: ${esc(l.nextFollowUp||"Not set")}</small></div>`).join("")}</div>`;
  }).join("");
  document.querySelectorAll(".loan-card").forEach(card=>card.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",card.dataset.id)));
  document.querySelectorAll(".board-column").forEach(col=>{
    col.addEventListener("dragover",e=>e.preventDefault());
    col.addEventListener("drop",e=>{ e.preventDefault(); const id=e.dataTransfer.getData("text/plain"); const loan=loans.find(x=>x.loanId===id); if(loan){loan.status=col.dataset.status;save();} });
  });
}
function render(){
  renderStats(); const list=filteredLoans(); renderTable(list); renderBoard(list);
  $("tablePanel").classList.toggle("hidden",showBoard); $("boardPanel").classList.toggle("hidden",!showBoard);
  $("viewToggleBtn").textContent=showBoard?"Table View":"Board View";
  $("todayBtn").textContent=todayOnly?"Show All Loans":"Today's Follow-Ups";
  if($("archiveBtn"))$("archiveBtn").textContent=archiveOnly?"Active Pipeline":"Archived Loans";
}
function renderChecklist(values={}){
  $("documentChecklist").innerHTML=DOCS.map((d,i)=>`<label class="check-item"><input type="checkbox" data-doc="${esc(d)}" ${values[d]?"checked":""}/> ${esc(d)}</label>`).join("");
}
function clearForm(){ fields.forEach(id=>{if($(id))$(id).value=""}); $("program").value="Fix & Flip"; $("status").value="New Lead"; $("dateReceived").value=today(); $("deleteBtn").classList.add("hidden"); renderChecklist({}); renderEmailActivity(); }
function openAdd(){ clearForm(); $("loanId").value=uuid(); $("dialogTitle").textContent="Add Loan"; $("loanNumber").value=nextLoanNumber(); $("loanDialog").showModal(); renderClientDocuments(); renderEmailActivity(); }
window.editLoan=function(id){ const l=loans.find(x=>x.loanId===id); if(!l)return; fields.forEach(f=>{if($(f))$(f).value=l[f]||""}); renderChecklist(l.documents||{}); $("dialogTitle").textContent=`Edit ${l.loanNumber||"Loan"}`; $("deleteBtn").classList.remove("hidden"); $("loanDialog").showModal(); renderClientDocuments(); renderEmailActivity(); };
function currentFormData(){
  const data={};
  fields.forEach(f=>data[f]=$(f)?.value||"");
  data.loanId=data.loanId||uuid();
  data.documents={};
  document.querySelectorAll("#documentChecklist input").forEach(cb=>data.documents[cb.dataset.doc]=cb.checked);
  const existing=loans.find(x=>x.loanId===data.loanId);
  if(existing){
    ["driveFolderId","driveFolderUrl","jotformSubmissionId","jotformImportedAt","emailActivity"].forEach(key=>{
      if(existing[key]!==undefined)data[key]=existing[key];
    });
  }
  if(!Array.isArray(data.emailActivity))data.emailActivity=[];
  return data;
}

$("loanForm").addEventListener("submit",e=>{e.preventDefault();const data=currentFormData();const i=loans.findIndex(x=>x.loanId===data.loanId);if(i>=0)loans[i]=data;else loans.unshift(data);$("loanDialog").close();save();});
$("deleteBtn").addEventListener("click",async()=>{const id=$("loanId").value;if(id&&confirm("Delete this loan and all locally stored documents?")){loans=loans.filter(x=>x.loanId!==id);await deleteLoanFiles(id);$("loanDialog").close();save();}});
$("closeDialogBtn").onclick=()=>$("loanDialog").close(); $("cancelDialogBtn").onclick=()=>$("loanDialog").close();
$("loanDialog").addEventListener("click",e=>{if(e.target===$("loanDialog"))$("loanDialog").close();});
$("addLoanBtn").onclick=openAdd;
let searchTimer;
$("searchInput").addEventListener("input",()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(render,60);
});
$("statusFilter").onchange=()=>{archiveOnly=$("statusFilter").value==="Archived";render();};

function applyStatusMilestoneDates(){
  const status=$("status")?.value;
  if(status==="Submitted" && !$("dateSubmitted").value)$("dateSubmitted").value=today();
  if(status==="Approved" && !$("dateApproved").value)$("dateApproved").value=today();
  if(status==="Closed" && !$("dateFunded").value)$("dateFunded").value=today();
}
if($("status"))$("status").addEventListener("change",applyStatusMilestoneDates);

$("viewToggleBtn").onclick=()=>{showBoard=!showBoard;render();};
$("todayBtn").onclick=()=>{todayOnly=!todayOnly;archiveOnly=false;$("statusFilter").value="";render();if(todayOnly)openFollowups();};
$("archiveBtn").onclick=()=>{archiveOnly=!archiveOnly;todayOnly=false;$("statusFilter").value=archiveOnly?"Archived":"";render();};

function openFollowups(){
  const due=loans.filter(l=>isDueToday(l.nextFollowUp,l.status)).sort((a,b)=>(a.nextFollowUp||"").localeCompare(b.nextFollowUp||""));
  $("followupList").innerHTML=due.map(l=>`<div class="followup-item ${isOverdue(l.nextFollowUp,l.status)?"overdue":""}"><div><strong>${esc(l.borrowerName)}</strong><br>${esc(l.propertyAddress)}<br><small>${esc(l.nextFollowUp)} · ${esc(l.status)}</small></div><button onclick="document.getElementById('followupDialog').close();editLoan('${l.loanId}')">Open</button></div>`).join("")||`<div class="empty-state">Nothing is due today. Nice.</div>`;
  $("followupDialog").showModal();
}
$("closeFollowupBtn").onclick=()=>$("followupDialog").close();

$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(loans,null,2)],{type:"application/json"});const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`bearcrest-crm-v2-backup-${today()}.json`;a.click();URL.revokeObjectURL(u);};
$("importFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data))throw 0;loans=data.map(normalizeLoan);save();alert("Backup imported.");}catch{alert("That is not a valid BearCrest CRM backup.");}e.target.value="";});

function parseCSV(text){
  const rows=[];let row=[],cell="",quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quote=!quote;}else if(c===','&&!quote){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell="";}else cell+=c;} row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
$("csvFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{const rows=parseCSV(await f.text());const headers=rows.shift().map(h=>h.trim().toLowerCase());const aliases={"loan #":"loanNumber","loan number":"loanNumber","borrower":"borrowerName","borrower name":"borrowerName","phone":"phone","email":"email","borrowing entity":"entityName","entity name":"entityName","program":"program","loan program requested":"program","property address":"propertyAddress","status":"status","assigned lender":"lender","lender":"lender","final funding partner":"finalLender","funding partner":"finalLender","date submitted":"dateSubmitted","date approved":"dateApproved","date funded":"dateFunded","next follow-up":"nextFollowUp","loan amount":"loanAmount","date received":"dateReceived","target closing date":"targetClosing","estimated arv":"arv","rehab budget":"rehabBudget","purchase price":"purchasePrice","exit strategy":"exitStrategy","notes":"notes"};let count=0;rows.forEach(r=>{const l=normalizeLoan({status:"New Lead",documents:{}});headers.forEach((h,i)=>{const key=aliases[h];if(key)l[key]=(r[i]||"").trim();});if(l.borrowerName||l.propertyAddress){loans.unshift(l);count++;}});save();alert(`${count} loan(s) imported from CSV.`);}catch(err){alert("I could not read that CSV file.");}e.target.value="";});

const ADMIN_SETTINGS_KEY="bearcrest_admin_settings_v4_1_clean";
const ADMIN_DEFAULTS={companyName:"BearCrest Funding, LLC",representative:"Joel Vazquez",phone:"423-454-1956",email:"getfunded@bearcrest.com",subtitle:"Investment Real Estate Financing",loanPrefix:"BCF",nextLoanNumber:1001,rootFolder:"BearCrest CRM Documents",endpoint:"",formId:"261954251577061",formUrl:"https://form.jotform.com/261954251577061",emailSenderName:"BearCrest Funding, LLC",emailReplyTo:"getfunded@bearcrest.com",emailSignature:"Thank you,\n\nJoel Vazquez\nBearCrest Funding, LLC\n423-454-1956\ngetfunded@bearcrest.com"};
function getAdminSettings(){try{return {...ADMIN_DEFAULTS,...JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY)||"{}")};}catch{return {...ADMIN_DEFAULTS};}}
function setAdminSettings(v){localStorage.setItem(ADMIN_SETTINGS_KEY,JSON.stringify({...getAdminSettings(),...v}));}
function company(){const a=getAdminSettings();return {name:a.companyName,representative:a.representative,phone:a.phone,email:a.email,subtitle:a.subtitle};}
function nextLoanNumber(){const a=getAdminSettings();const n=Number(a.nextLoanNumber||1001);setAdminSettings({nextLoanNumber:n+1});return `${a.loanPrefix||"BCF"}-${n}`;}

function longDate(value){const d=value?new Date(value+"T12:00:00"):new Date();return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});}
function printable(title,body,opts={}){
  const COMPANY=company();
  const w=window.open("","_blank");
  if(!w){alert("Please allow pop-ups for the CRM so the document can open.");return;}
  const compact=opts.compact?"compact":"";
  const editable=opts.editable?"editable":"";
  const logoUrl=new URL("bcf-logo.png",window.location.href).href;
  const controls=opts.editable?`<div class="editor-toolbar"><strong>Editable Document</strong><span>Click anywhere in the highlighted document area to make changes, then print or save as PDF.</span><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div>`:"";
  const autoPrint=opts.editable?"":`<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:Letter;margin:.46in}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#24332d;font-size:13px;line-height:1.48;background:white}body.compact{font-size:11.4px;line-height:1.31}body.compact .document-editor{font-size:13.2px;line-height:1.46}body.compact .document-editor ul{font-size:13.2px;line-height:1.4}body.compact .document-editor li{margin:3px 0}body.compact .document-editor .small{font-size:10.5px}.editor-toolbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:10px 16px;background:#173f35;color:#fff;border-bottom:4px solid #c9a34a;box-shadow:0 3px 12px #0003}.editor-toolbar span{flex:1;font-size:12px;opacity:.9}.editor-toolbar button{border:0;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer}.page{position:relative;min-height:9.55in;padding-bottom:.42in}.top-rule{height:11px;background:linear-gradient(90deg,#173f35 0 73%,#c9a34a 73% 100%);margin-bottom:13px}.letterhead{display:flex;align-items:center;justify-content:space-between;padding:0 3px 12px;border-bottom:1px solid #d7dfda;margin-bottom:15px}.brand{display:flex;align-items:center;gap:13px}.brand img{width:68px;height:68px;object-fit:contain}.brand h1{margin:0;color:#173f35;font-size:27px;letter-spacing:-.5px}.brand h1 span{color:#a9822f}.brand small{display:block;color:#6b756f;margin-top:2px;letter-spacing:.7px;text-transform:uppercase}.contact{text-align:right;color:#173f35;font-weight:700}.contact div{margin:3px 0}.document-banner{display:flex;justify-content:space-between;align-items:flex-end;background:#173f35;color:#fff;padding:12px 15px;border-left:8px solid #c9a34a;margin:0 0 15px}.document-banner h2{margin:0;font-size:21px;letter-spacing:.3px}.document-banner .date{font-size:11px;text-transform:uppercase;letter-spacing:.5px}.intro{font-size:13.2px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d6ded9;border-radius:8px;overflow:hidden;margin-bottom:15px}.meta div{padding:8px 11px;border-bottom:1px solid #e0e6e2}.meta div:nth-child(odd){border-right:1px solid #e0e6e2}.meta div:nth-last-child(-n+2){border-bottom:0}.meta strong{color:#173f35}.terms{width:100%;border-collapse:separate;border-spacing:0;margin:10px 0 15px;border:1px solid #ccd6d0;border-radius:8px;overflow:hidden}.terms th,.terms td{border-bottom:1px solid #d9e0dc;padding:8px 10px;text-align:left}.terms tr:last-child th,.terms tr:last-child td{border-bottom:0}.terms th{width:31%;background:#edf3ef;color:#173f35;font-weight:700}.terms td{background:#fff}.editable .terms td[contenteditable="true"],.editable .editable-field,.editable .document-editor{background:#fffdf3;outline:none}.editable .terms td[contenteditable="true"]:focus,.editable .editable-field:focus,.editable .document-editor:focus{box-shadow:inset 0 0 0 2px #c9a34a;background:#fff}.document-editor{padding:2px 3px;border-radius:4px}.section-title{color:#173f35;font-size:14px;text-transform:uppercase;letter-spacing:.7px;margin:15px 0 7px;padding-bottom:4px;border-bottom:2px solid #c9a34a}.notice{background:#fbf7e9;border:1px solid #eadcae;border-left:6px solid #c9a34a;padding:10px 12px;margin:14px 0;border-radius:4px}.decision-box{background:#edf3ef;border:1px solid #cfdbd4;border-left:7px solid #173f35;padding:13px 15px;margin:14px 0}.signature{margin-top:22px}.signature-name{color:#173f35;font-size:15px;font-weight:800}.signature-line{margin-top:30px;border-top:1px solid #555;width:300px;padding-top:5px}.footer{position:fixed;left:.46in;right:.46in;bottom:.16in;border-top:2px solid #c9a34a;padding-top:5px;font-size:9px;color:#66736d;display:flex;justify-content:space-between}ul{margin:7px 0 0;padding-left:22px;columns:${opts.twoColumns?2:1};column-gap:35px}li{margin:5px 0;break-inside:avoid}.check{color:#173f35;font-weight:bold;margin-right:6px}.small{font-size:10px;color:#66736d}.conditions{white-space:pre-line}.one-page{page-break-inside:avoid}.reason-box{border:1px solid #d7dfda;background:#f7f9f8;padding:11px 13px;margin:12px 0;border-radius:6px}@media print{.editor-toolbar{display:none!important}body{background:#fff}.page{min-height:auto}}
  </style></head><body class="${compact} ${editable}">${controls}<div class="page"><div class="top-rule"></div><div class="letterhead"><div class="brand"><img src="${logoUrl}"><div><h1>${esc(COMPANY.name)}</h1><small>${esc(COMPANY.subtitle)}</small></div></div><div class="contact"><div>${COMPANY.phone}</div><div>${COMPANY.email}</div></div></div>${opts.fullEditable?`<div class="document-editor" contenteditable="true" spellcheck="true">${body}</div>`:body}<div class="footer"><span>${esc(COMPANY.name)} · Business-purpose financing</span><span>${COMPANY.phone} · ${COMPANY.email}</span></div></div>${autoPrint}</body></html>`);
  w.document.close();
}
function getDocData(){return currentFormData();}
function borrowerMeta(l){return `<div class="meta"><div><strong>Borrower:</strong> ${esc(l.borrowerName||"—")}</div><div><strong>Entity:</strong> ${esc(l.entityName||"—")}</div><div><strong>Property:</strong> ${esc(l.propertyAddress||"—")}</div><div><strong>Program:</strong> ${esc(l.program||"—")}</div><div><strong>Loan Number:</strong> ${esc(l.loanNumber||"—")}</div><div><strong>Date:</strong> ${longDate()}</div></div>`;}
function banner(title){return `<div class="document-banner"><h2>${esc(title)}</h2><div class="date">Issued ${longDate()}</div></div>`;}

$("termSheetBtn").onclick=()=>{
 const COMPANY=company();
 const l=getDocData();
 const conditions=l.termConditions.trim()||"Final underwriting approval; satisfactory valuation or appraisal; acceptable title and insurance; verification of borrower, entity, liquidity, and project information; and receipt of all required closing documentation.";
 const edit=v=>`<td contenteditable="true" spellcheck="true">${v}</td>`;
 printable("BearCrest Funding, LLC Term Sheet",`${banner("Preliminary Term Sheet")}${borrowerMeta(l)}<p class="intro">The following preliminary terms are provided for discussion and review. Highlighted fields are editable before printing or saving as a PDF.</p><table class="terms"><tr><th>Loan Amount</th>${edit(money(l.loanAmount)||"To be determined")}</tr><tr><th>Purchase Price</th>${edit(money(l.purchasePrice)||"—")}</tr><tr><th>Rehab Budget</th>${edit(money(l.rehabBudget)||"—")}</tr><tr><th>Estimated ARV / Value</th>${edit(money(l.arv)||"—")}</tr><tr><th>Interest Rate</th>${edit(esc(l.interestRate||"To be determined"))}</tr><tr><th>Origination Points</th>${edit(esc(l.points||"To be determined"))}</tr><tr><th>Loan Term</th>${edit(esc(l.loanTerm||"To be determined"))}</tr><tr><th>LTV / LTC</th>${edit(esc(l.leverage||"Subject to underwriting"))}</tr><tr><th>Exit Strategy</th>${edit(esc(l.exitStrategy||"—"))}</tr><tr><th>Term Sheet Expiration</th>${edit(l.termExpiration?longDate(l.termExpiration):"10 days from issuance")}</tr></table><div class="section-title">Conditions</div><div class="conditions editable-field" contenteditable="true" spellcheck="true">${esc(conditions)}</div><div class="notice"><strong>Important:</strong> This preliminary term sheet is for discussion purposes only. It is not a commitment to lend, a guarantee of financing, or a binding obligation. All terms remain subject to underwriting and final lender approval.</div><div class="signature"><div class="signature-name">${esc(COMPANY.name)}</div><div>${COMPANY.phone} · ${COMPANY.email}</div><div class="signature-line">Borrower Acknowledgment / Date</div></div>`,{editable:true});
};
$("needsListBtn").onclick=()=>{
 const COMPANY=company();
 const l=getDocData();const missing=DOCS.filter(d=>!l.documents[d]);if(l.missingDocs.trim())missing.push(...l.missingDocs.split(/\n|;/).map(x=>x.trim()).filter(Boolean));
 printable("BearCrest Funding, LLC Needs List",`<div class="one-page">${banner("Loan Documentation Needs List")}${borrowerMeta(l)}<p>Thank you for choosing BearCrest Funding. To continue reviewing your request, please provide the items listed below:</p><ul>${missing.map(x=>`<li><span class="check">□</span>${esc(x)}</li>`).join("")||"<li>No outstanding items are currently listed.</li>"}</ul><div class="notice">Please send clear, complete copies. Questions may be directed to <strong>${COMPANY.phone}</strong> or <strong>${COMPANY.email}</strong>.</div><p class="small">Additional documentation may be requested as underwriting progresses.</p></div>`,{compact:true,twoColumns:true,editable:true,fullEditable:true});
};
$("preapprovalBtn").onclick=()=>{
 const COMPANY=company();
 const l=getDocData();
 printable("BearCrest Funding, LLC Approval Letter",`${banner("Preliminary Approval / Intent to Fund")}${borrowerMeta(l)}<p>Dear ${esc(l.borrowerName||"Applicant")},</p><p>Thank you for the opportunity to assist with your financing request. BearCrest Funding has reviewed the preliminary information submitted for <strong>${esc(l.propertyAddress||"the subject property")}</strong>.</p><div class="decision-box">Based on the information currently available, the request has received <strong>preliminary approval</strong> for financing of up to <strong>${money(l.loanAmount)||"an amount to be determined"}</strong> under the <strong>${esc(l.program||"applicable")}</strong> loan program.</div><p>This preliminary approval remains subject to satisfactory underwriting, valuation, title review, acceptable insurance, verification of all borrower and transaction information, receipt of required documentation, and final lender approval.</p><div class="notice"><strong>This letter is not a commitment or guarantee to lend.</strong> Loan terms, proceeds, and eligibility may change based on underwriting findings or changes to the transaction.</div><div class="signature"><p>Sincerely,</p><div class="signature-name">${esc(COMPANY.name)}</div><div>${COMPANY.phone}</div><div>${COMPANY.email}</div></div>`,{editable:true,fullEditable:true});
};
$("declineBtn").onclick=()=>{
 const COMPANY=company();
 const l=getDocData(); const reason=l.declineReason.trim();
 printable("BearCrest Funding, LLC Decline Letter",`${banner("Loan Request Decision")}${borrowerMeta(l)}<p>Dear ${esc(l.borrowerName||"Applicant")},</p><p>Thank you for allowing BearCrest Funding to review your financing request for <strong>${esc(l.propertyAddress||"the subject property")}</strong>.</p><p>After reviewing the information currently available, we are unable to approve this request under the program guidelines available to us at this time.</p>${reason?`<div class="reason-box"><strong>Primary reason:</strong><br>${esc(reason)}</div>`:""}<p>This decision applies only to the current request. You are welcome to submit updated information or a different transaction for future consideration.</p><div class="notice">To discuss other possible financing options, please contact us at <strong>${COMPANY.phone}</strong> or <strong>${COMPANY.email}</strong>.</div><div class="signature"><p>Sincerely,</p><div class="signature-name">${esc(COMPANY.name)}</div><div>${COMPANY.phone}</div><div>${COMPANY.email}</div></div>`,{editable:true,fullEditable:true});
};


$("clientDocumentInput").addEventListener("change",async e=>{
  const files=[...e.target.files];
  const loanId=$("loanId").value;
  if(!loanId||!files.length)return;
  const category=$("documentCategory").value;
  const button=document.querySelector(".upload-doc-btn");
  const original=button.childNodes[0].textContent;
  try{
    button.childNodes[0].textContent="Uploading... ";
    for(const file of files) await addClientFile(loanId,file,category);
    await renderClientDocuments();
  }catch(err){alert("The document could not be stored. Your browser may be out of storage space.");}
  finally{button.childNodes[0].textContent=original;e.target.value="";}
});

$("templateBtn").onclick=()=>{const headers=["Loan Number","Date Received","Borrower Name","Phone","Email","Borrowing Entity","Loan Program Requested","Property Address","Purchase Price","Rehab Budget","Estimated ARV","Loan Amount","Target Closing Date","Status","Assigned Lender","Final Funding Partner","Date Submitted","Date Approved","Date Funded","Next Follow-Up","Exit Strategy","Notes"];const blob=new Blob([headers.join(",")+"\n"],{type:"text/csv"});const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="BearCrest_Client_Application_Import_Template.csv";a.click();URL.revokeObjectURL(u);};

render();

// ----- BearCrest Google Drive + Jotform connector (Version 2.5) -----
const DEFAULT_FORM_ID=ADMIN_DEFAULTS.formId;
const DEFAULT_FORM_URL=ADMIN_DEFAULTS.formUrl;
function getCloudSettings(){const a=getAdminSettings();return {endpoint:a.endpoint,formId:a.formId,formUrl:a.formUrl};}
function setCloudSettings(v){setAdminSettings(v);}
function cloudConfigured(){return /^https:\/\/script\.google\.com\//.test(getCloudSettings().endpoint||"");}
async function cloudCall(action,payload={}){
  const {endpoint}=getCloudSettings();
  if(!endpoint)throw new Error("Google Drive is not connected. Open Cloud Setup first.");
  const body=new URLSearchParams({action,payload:JSON.stringify(payload)});
  const r=await fetch(endpoint,{method:"POST",body});
  const out=await r.json();
  if(!out.ok)throw new Error(out.error||"Cloud request failed.");
  return out;
}
function updateDriveUi(){
  const s=getCloudSettings(), loan=loans.find(x=>x.loanId===$("loanId").value);
  const status=$("driveStatus"); if(!status)return;
  if(!s.endpoint){status.textContent="Drive not connected";status.classList.remove("connected");}
  else if(loan?.driveFolderUrl){status.textContent="Drive folder connected";status.classList.add("connected");}
  else{status.textContent="Drive connected — folder not created";status.classList.add("connected");}
  $("openDriveFolderBtn").disabled=!loan?.driveFolderUrl;
}
async function ensureDriveFolder(){
  const data=currentFormData();
  if(!cloudConfigured()){alert("Open Cloud Setup and connect Google Drive first.");return null;}
  const out=await cloudCall("ensureLoanFolder",{loanId:data.loanId,loanNumber:data.loanNumber,propertyAddress:data.propertyAddress,borrowerName:data.borrowerName,rootFolder:getAdminSettings().rootFolder});
  const i=loans.findIndex(x=>x.loanId===data.loanId);
  const merged={...data,driveFolderId:out.folderId,driveFolderUrl:out.folderUrl};
  if(i>=0)loans[i]=merged;else loans.unshift(merged);
  fields.forEach(f=>{if($(f)&&merged[f]!==undefined)$(f).value=merged[f]||""});
  localStorage.setItem(STORAGE_KEY,JSON.stringify(loans));updateDriveUi();return merged;
}
function fillAdminSettings(){const a=getAdminSettings();$("adminCompanyName").value=a.companyName;$("adminRepresentative").value=a.representative;$("adminPhone").value=a.phone;$("adminEmail").value=a.email;$("adminSubtitle").value=a.subtitle;$("adminLoanPrefix").value=a.loanPrefix;$("adminNextLoanNumber").value=a.nextLoanNumber;$("adminRootFolder").value=a.rootFolder;$("cloudEndpoint").value=a.endpoint||"";$("jotformFormId").value=a.formId||DEFAULT_FORM_ID;$("jotformUrl").value=a.formUrl||DEFAULT_FORM_URL;$("adminEmailSenderName").value=a.emailSenderName||a.companyName||"BearCrest Funding, LLC";$("adminEmailReplyTo").value=a.emailReplyTo||a.email||"";$("adminEmailSignature").value=a.emailSignature||ADMIN_DEFAULTS.emailSignature;}
function readAdminSettings(){return {companyName:$("adminCompanyName").value.trim()||ADMIN_DEFAULTS.companyName,representative:$("adminRepresentative").value.trim(),phone:$("adminPhone").value.trim(),email:$("adminEmail").value.trim(),subtitle:$("adminSubtitle").value.trim(),loanPrefix:$("adminLoanPrefix").value.trim().toUpperCase()||"BCF",nextLoanNumber:Number($("adminNextLoanNumber").value||1001),rootFolder:$("adminRootFolder").value.trim()||ADMIN_DEFAULTS.rootFolder,endpoint:$("cloudEndpoint").value.trim(),formId:$("jotformFormId").value.trim()||DEFAULT_FORM_ID,formUrl:$("jotformUrl").value.trim()||DEFAULT_FORM_URL,emailSenderName:$("adminEmailSenderName").value.trim()||ADMIN_DEFAULTS.emailSenderName,emailReplyTo:$("adminEmailReplyTo").value.trim(),emailSignature:$("adminEmailSignature").value.trim()||ADMIN_DEFAULTS.emailSignature};}
$("cloudSetupBtn").onclick=()=>{fillAdminSettings();$("cloudSetupDialog").showModal();};
$("closeCloudSetupBtn").onclick=()=>$("cloudSetupDialog").close();
$("cloudSetupForm").addEventListener("submit",e=>{e.preventDefault();setAdminSettings(readAdminSettings());$("cloudSetupDialog").close();updateDriveUi();alert("Admin settings saved. New documents and loan numbers will use these settings.");});
$("resetAdminBtn").onclick=()=>{if(!confirm("Restore the default BearCrest settings?"))return;localStorage.setItem(ADMIN_SETTINGS_KEY,JSON.stringify(ADMIN_DEFAULTS));fillAdminSettings();};
$("testCloudBtn").onclick=async()=>{try{setAdminSettings(readAdminSettings());const out=await cloudCall("ping");alert(out.message||"Connection successful.");}catch(e){alert(e.message);}};
$("applicationBtn").onclick=()=>window.open(getCloudSettings().formUrl||DEFAULT_FORM_URL,"_blank");
$("createDriveFolderBtn").onclick=async()=>{try{const b=$("createDriveFolderBtn");b.disabled=true;b.textContent="Creating...";await ensureDriveFolder();await renderClientDocuments();alert("Google Drive folder is ready.");}catch(e){alert(e.message);}finally{$("createDriveFolderBtn").disabled=false;$("createDriveFolderBtn").textContent="Create / Connect Drive Folder";}};
$("openDriveFolderBtn").onclick=()=>{const l=loans.find(x=>x.loanId===$("loanId").value);if(l?.driveFolderUrl)window.open(l.driveFolderUrl,"_blank");};

async function fileToBase64(file){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}
const originalRenderClientDocuments=renderClientDocuments;
renderClientDocuments=async function(){
  const loan=loans.find(x=>x.loanId===$("loanId").value);
  if(cloudConfigured()&&loan?.driveFolderId){
    const box=$("clientDocumentList");box.innerHTML='<div class="empty-docs">Loading Google Drive documents...</div>';
    try{const out=await cloudCall("listFiles",{folderId:loan.driveFolderId});box.innerHTML=out.files.length?out.files.map(f=>`<div class="document-file-row"><div><a class="cloud-file-link" href="${esc(f.url)}" target="_blank">${esc(f.name)}</a><small>${esc(f.modified||"")} · ${fileSize(f.size||0)}</small></div><div>${esc(f.category||"Drive")}</div><div>${esc(f.mimeType?.split("/").pop()?.toUpperCase()||"FILE")}</div><div class="document-file-actions"><button type="button" onclick="window.open('${esc(f.url)}','_blank')">Open</button></div></div>`).join(""):'<div class="empty-docs">No documents uploaded to this Google Drive loan folder yet.</div>';updateDriveUi();return;}catch(e){box.innerHTML=`<div class="empty-docs">Could not load Drive documents: ${esc(e.message)}</div>`;}
  }
  await originalRenderClientDocuments();updateDriveUi();
};

const oldUploadHandler=$("clientDocumentInput");
oldUploadHandler.addEventListener("change",async e=>{
  if(!cloudConfigured())return; // existing local handler remains the fallback
  e.stopImmediatePropagation();
  const files=[...e.target.files], category=$("documentCategory").value; if(!files.length)return;
  try{let loan=loans.find(x=>x.loanId===$("loanId").value);if(!loan?.driveFolderId)loan=await ensureDriveFolder();
    for(const file of files){const base64=await fileToBase64(file);await cloudCall("uploadFile",{folderId:loan.driveFolderId,category,name:file.name,mimeType:file.type||"application/octet-stream",base64});}
    await renderClientDocuments();
  }catch(err){alert(err.message);}finally{e.target.value="";}
},true);

function answerValue(answers,needles){
  for(const a of Object.values(answers||{})){const q=String(a.text||a.name||"").toLowerCase();if(needles.some(n=>q.includes(n)))return Array.isArray(a.answer)?a.answer.join(", "):(typeof a.answer==="object"?Object.values(a.answer||{}).join(" "):String(a.answer||""));}return "";
}
function getSyncMeta(){
  try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||"{}");}
  catch{return {};}
}
function saveSyncMeta(values){
  localStorage.setItem(SYNC_META_KEY,JSON.stringify({...getSyncMeta(),...values}));
  renderSyncStatus();
}
function renderSyncStatus(){
  const el=$("syncStatus");
  if(!el)return;
  const meta=getSyncMeta();
  if(!meta.lastSync){
    el.textContent="Smart Sync ready";
    return;
  }
  el.textContent=`Last sync: ${new Date(meta.lastSync).toLocaleString()} · ${meta.lastAdded||0} new · ${meta.lastSkipped||0} skipped`;
}
renderSyncStatus();

$("syncApplicationsBtn").onclick=async()=>{
  if(!cloudConfigured()){
    alert("Connect the Google Apps Script first using Settings.");
    return;
  }

  const button=$("syncApplicationsBtn");
  try{
    button.disabled=true;
    button.textContent="Checking Jotform...";

    const settings=getCloudSettings();
    const out=await cloudCall("syncJotform",{formId:settings.formId||DEFAULT_FORM_ID});
    const importedIds=new Set(
      loans.map(loan=>String(loan.jotformSubmissionId||"")).filter(Boolean)
    );

    let added=0;
    let skipped=0;
    let errors=0;

    for(const submission of out.submissions||[]){
      try{
        const submissionId=String(submission.id||"");
        if(!submissionId){
          errors++;
          continue;
        }

        if(importedIds.has(submissionId)){
          skipped++;
          continue;
        }

        const answers=submission.answers||{};
        const loan=normalizeLoan({
          jotformSubmissionId:submissionId,
          jotformImportedAt:new Date().toISOString(),
          loanNumber:nextLoanNumber(),
          dateReceived:(submission.created_at||today()).slice(0,10),
          borrowerName:answerValue(answers,["full name","borrower name"]),
          phone:answerValue(answers,["phone"]),
          email:answerValue(answers,["email"]),
          entityName:answerValue(answers,["entity name","borrowing entity"]),
          program:answerValue(answers,["loan program"])||"Other",
          propertyAddress:answerValue(answers,["property address","full property"]),
          loanAmount:answerValue(answers,["requested loan amount"]).replace(/[^0-9.]/g,""),
          purchasePrice:answerValue(answers,["purchase price"]).replace(/[^0-9.]/g,""),
          rehabBudget:answerValue(answers,["rehab budget","scope of work"]).replace(/[^0-9.]/g,""),
          arv:answerValue(answers,["estimated arv"]).replace(/[^0-9.]/g,""),
          targetClosing:answerValue(answers,["target closing"]),
          exitStrategy:answerValue(answers,["exit strategy"]),
          status:"New Lead",
          notes:`Imported from Jotform submission ${submissionId}`
        });

        loans.unshift(loan);
        importedIds.add(submissionId);
        added++;
      }catch(error){
        errors++;
      }
    }

    save();
    saveSyncMeta({
      lastSync:new Date().toISOString(),
      lastAdded:added,
      lastSkipped:skipped,
      lastErrors:errors
    });

    alert(
      `${added} new application${added===1?"":"s"} imported.\n`+
      `${skipped} already in CRM and skipped.\n`+
      `${errors} error${errors===1?"":"s"}.\n\n`+
      `Dead and archived loans were not re-imported.`
    );
  }catch(error){
    alert(error.message);
  }finally{
    button.disabled=false;
    button.textContent="Sync New Applications";
  }
};

// refresh Drive controls whenever a loan dialog is opened
const oldEditLoan=window.editLoan;window.editLoan=function(id){oldEditLoan(id);setTimeout(updateDriveUi,0);};
const oldOpenAdd=openAdd;openAdd=function(){oldOpenAdd();setTimeout(updateDriveUi,0);};$("addLoanBtn").onclick=openAdd;


// ===== BearCrest Version 3.1: Google Drive for Desktop synchronized folder storage =====
const LOCAL_DIR_DB="bearcrest_directory_handles_v1";
const LOCAL_DIR_STORE="handles";
const LOCAL_DIR_KEY="documentRoot";
const LOAN_SUBFOLDERS=["Application","Identity","Entity","Property","Financial","Insurance","Underwriting","Closing","Generated Documents","Other"];
let selectedDocumentRoot=null;
function openDirDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(LOCAL_DIR_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(LOCAL_DIR_STORE))r.result.createObjectStore(LOCAL_DIR_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveDirectoryHandle(handle){const db=await openDirDb();await new Promise((resolve,reject)=>{const tx=db.transaction(LOCAL_DIR_STORE,"readwrite");tx.objectStore(LOCAL_DIR_STORE).put(handle,LOCAL_DIR_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});selectedDocumentRoot=handle;}
async function loadDirectoryHandle(){try{const db=await openDirDb();selectedDocumentRoot=await new Promise((resolve,reject)=>{const r=db.transaction(LOCAL_DIR_STORE,"readonly").objectStore(LOCAL_DIR_STORE).get(LOCAL_DIR_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});}catch(e){selectedDocumentRoot=null;}return selectedDocumentRoot;}
async function clearDirectoryHandle(){const db=await openDirDb();await new Promise((resolve,reject)=>{const tx=db.transaction(LOCAL_DIR_STORE,"readwrite");tx.objectStore(LOCAL_DIR_STORE).delete(LOCAL_DIR_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});selectedDocumentRoot=null;updateLocalDriveStatus();}
async function ensureDirPermission(handle,write=true){if(!handle)return false;const opts={mode:write?"readwrite":"read"};if((await handle.queryPermission(opts))==="granted")return true;return (await handle.requestPermission(opts))==="granted";}
function safeFolderPart(v){return String(v||"").replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ").trim().slice(0,90)||"Unnamed";}
function loanFolderName(loan){return `${safeFolderPart(loan.loanNumber||"BCF-Loan")} - ${safeFolderPart(loan.propertyAddress||loan.borrowerName||"New Loan")}`;}
async function getLoanDirectory(loan,create=true){if(!selectedDocumentRoot)await loadDirectoryHandle();if(!selectedDocumentRoot)throw new Error("Choose your Google Drive for Desktop folder first.");if(!await ensureDirPermission(selectedDocumentRoot,true))throw new Error("Permission to use the selected folder was not granted.");const folder=await selectedDocumentRoot.getDirectoryHandle(loanFolderName(loan),{create});if(create){for(const name of LOAN_SUBFOLDERS)await folder.getDirectoryHandle(name,{create:true});}return folder;}
async function chooseDocumentRoot(){if(!window.showDirectoryPicker){alert("This browser cannot select a synchronized folder. Open this CRM in the newest Microsoft Edge or Chrome.");return null;}const handle=await window.showDirectoryPicker({id:"bearcrest-documents",mode:"readwrite",startIn:"documents"});await saveDirectoryHandle(handle);updateLocalDriveStatus();return handle;}
function updateLocalDriveStatus(){const label=selectedDocumentRoot?`Connected to: ${selectedDocumentRoot.name}`:"Storage folder not selected";const status=$("driveStatus");if(status){status.textContent=label;status.classList.toggle("connected",!!selectedDocumentRoot);}const a=$("localDriveAdminStatus");if(a)a.textContent=selectedDocumentRoot?`Connected to ${selectedDocumentRoot.name}. Files saved here will sync through Google Drive for Desktop.`:"No synchronized folder selected.";const help=$("fileStorageHelp");if(help)help.textContent=selectedDocumentRoot?"Documents are copied into the selected Google Drive for Desktop folder and synchronized to Google Drive.":"Choose your Google Drive for Desktop folder, then upload documents into this client file.";}
async function scanLoanFiles(loan){const root=await getLoanDirectory(loan,false);const files=[];for await(const [category,entry] of root.entries()){if(entry.kind!=="directory")continue;for await(const [name,item] of entry.entries()){if(item.kind!=="file")continue;const file=await item.getFile();files.push({name,category,size:file.size,type:file.type,modified:file.lastModified,fileHandle:item,dirHandle:entry});}}return files.sort((a,b)=>b.modified-a.modified);}
window.openSyncedFile=async function(category,name){const loan=loans.find(x=>x.loanId===$("loanId").value);if(!loan)return;const root=await getLoanDirectory(loan,false),dir=await root.getDirectoryHandle(category),fh=await dir.getFileHandle(name),file=await fh.getFile(),url=URL.createObjectURL(file);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),60000);};
window.downloadSyncedFile=async function(category,name){const loan=loans.find(x=>x.loanId===$("loanId").value);if(!loan)return;const root=await getLoanDirectory(loan,false),dir=await root.getDirectoryHandle(category),fh=await dir.getFileHandle(name),file=await fh.getFile(),url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.deleteSyncedFile=async function(category,name){if(!confirm(`Delete ${name} from this client folder?`))return;const loan=loans.find(x=>x.loanId===$("loanId").value);const root=await getLoanDirectory(loan,false),dir=await root.getDirectoryHandle(category);await dir.removeEntry(name);renderClientDocuments();};
const renderDocsBeforeDesktop=renderClientDocuments;
renderClientDocuments=async function(){
  const loan=loans.find(x=>x.loanId===$("loanId").value);
  if(selectedDocumentRoot&&loan){const box=$("clientDocumentList");box.innerHTML='<div class="empty-docs">Loading synchronized documents...</div>';try{const files=await scanLoanFiles(loan);box.innerHTML=files.length?files.map(f=>`<div class="document-file-row"><div><strong title="${esc(f.name)}">${esc(f.name)}</strong><small>${new Date(f.modified).toLocaleDateString()} · ${fileSize(f.size)}</small></div><div>${esc(f.category)}</div><div>${esc((f.type||"").split("/").pop().toUpperCase()||"FILE")}</div><div class="document-file-actions"><button type="button" onclick="openSyncedFile('${esc(f.category)}','${esc(f.name)}')">Open</button><button type="button" onclick="downloadSyncedFile('${esc(f.category)}','${esc(f.name)}')">Download</button><button type="button" class="danger" onclick="deleteSyncedFile('${esc(f.category)}','${esc(f.name)}')">Delete</button></div></div>`).join(""):'<div class="empty-docs">No documents have been uploaded to this synchronized client folder.</div>';box.insertAdjacentHTML("beforeend",`<div class="storage-note">Google Drive for Desktop: ${esc(selectedDocumentRoot.name)} / ${esc(loanFolderName(loan))}</div>`);updateLocalDriveStatus();return;}catch(e){if(e.name!=="NotFoundError")box.innerHTML=`<div class="empty-docs">${esc(e.message)}</div>`;else box.innerHTML='<div class="empty-docs">This client folder has not been created yet. Click Prepare Client Folder or upload a document.</div>';return;}}
  return renderDocsBeforeDesktop();
};
const desktopUploadInput=$("clientDocumentInput");
desktopUploadInput.addEventListener("change",async e=>{if(!selectedDocumentRoot)return;e.stopImmediatePropagation();const loan=loans.find(x=>x.loanId===$("loanId").value);const files=[...e.target.files];if(!loan||!files.length)return;try{const root=await getLoanDirectory(loan,true),category=$("documentCategory").value||"Other",dir=await root.getDirectoryHandle(category,{create:true});for(const file of files){const fh=await dir.getFileHandle(file.name,{create:true}),writer=await fh.createWritable();await writer.write(file);await writer.close();}await renderClientDocuments();}catch(err){alert(`The document could not be saved: ${err.message}`);}finally{e.target.value="";}},true);

// Re-purpose existing Drive buttons for the synchronized desktop folder.
if($("createDriveFolderBtn"))$("createDriveFolderBtn").onclick=async()=>{try{await chooseDocumentRoot();const loan=loans.find(x=>x.loanId===$("loanId").value);if(loan)await getLoanDirectory(loan,true);await renderClientDocuments();}catch(e){if(e.name!=="AbortError")alert(e.message);}};
if($("openDriveFolderBtn"))$("openDriveFolderBtn").onclick=async()=>{const loan=loans.find(x=>x.loanId===$("loanId").value);if(!loan){alert("Save the loan first.");return;}try{await getLoanDirectory(loan,true);updateLocalDriveStatus();await renderClientDocuments();alert(`Client folder prepared:\n${loanFolderName(loan)}\n\nYou can also open this folder from Google Drive in File Explorer.`);}catch(e){alert(e.message);}};
if($("chooseLocalDriveBtn"))$("chooseLocalDriveBtn").onclick=async()=>{try{await chooseDocumentRoot();}catch(e){if(e.name!=="AbortError")alert(e.message);}};
if($("clearLocalDriveBtn"))$("clearLocalDriveBtn").onclick=()=>{if(confirm("Disconnect the selected folder? Existing files will not be deleted."))clearDirectoryHandle();};



let emailAttachments=[];

function resetEmailAttachments(){
  emailAttachments=[];
  renderSelectedAttachments();
  const picker=$("loanAttachmentPicker");
  if(picker){
    picker.classList.add("hidden");
    picker.innerHTML="";
  }
  const input=$("emailAttachmentInput");
  if(input)input.value="";
}

function attachmentSize(bytes){
  return fileSize(Number(bytes||0));
}

function renderSelectedAttachments(){
  const box=$("selectedAttachments");
  if(!box)return;
  box.innerHTML=emailAttachments.length?emailAttachments.map((item,index)=>`
    <div class="selected-attachment-row">
      <div>
        <strong>${esc(item.name||"Attachment")}</strong>
        <small>${esc(item.sourceLabel||item.source||"File")} · ${attachmentSize(item.size||0)}</small>
      </div>
      <button type="button" onclick="removeEmailAttachment(${index})">Remove</button>
    </div>`).join(""):'<div class="empty-docs">No attachments selected.</div>';
}

window.removeEmailAttachment=function(index){
  emailAttachments.splice(index,1);
  renderSelectedAttachments();
};

async function fileAsBase64(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addComputerAttachments(files){
  for(const file of files){
    const base64=await fileAsBase64(file);
    emailAttachments.push({
      source:"upload",
      sourceLabel:"Uploaded from computer",
      name:file.name,
      mimeType:file.type||"application/octet-stream",
      size:file.size,
      base64
    });
  }
  renderSelectedAttachments();
}

async function loadDriveAttachmentChoices(){
  const loan=currentLoan();
  const picker=$("loanAttachmentPicker");
  if(!loan){
    alert("Save or open a loan first.");
    return;
  }
  if(!cloudConfigured()){
    alert("Google Apps Script is not connected.");
    return;
  }
  if(!loan.driveFolderId){
    alert("This loan does not yet have a Google Drive folder. Prepare the client folder first.");
    return;
  }

  picker.classList.remove("hidden");
  picker.innerHTML='<div class="empty-docs">Loading loan files...</div>';

  try{
    const out=await cloudCall("listFiles",{folderId:loan.driveFolderId});
    const files=out.files||[];
    picker.innerHTML=files.length?files.map(file=>`
      <label class="loan-attachment-choice">
        <input type="checkbox"
          data-id="${esc(file.id)}"
          data-name="${esc(file.name)}"
          data-size="${Number(file.size||0)}"
          data-mime="${esc(file.mimeType||"application/octet-stream")}" />
        <span>
          <strong>${esc(file.name)}</strong>
          <small>${esc(file.category||"Drive")} · ${attachmentSize(file.size||0)}</small>
        </span>
      </label>`).join("")+'<button type="button" id="addCheckedLoanFilesBtn" class="primary">Add Selected Files</button>'
      :'<div class="empty-docs">No files are currently stored in this loan folder.</div>';

    const addButton=$("addCheckedLoanFilesBtn");
    if(addButton)addButton.onclick=()=>{
      picker.querySelectorAll('input[type="checkbox"]:checked').forEach(cb=>{
        if(emailAttachments.some(a=>a.source==="drive"&&a.fileId===cb.dataset.id))return;
        emailAttachments.push({
          source:"drive",
          sourceLabel:"From loan files",
          fileId:cb.dataset.id,
          name:cb.dataset.name,
          size:Number(cb.dataset.size||0),
          mimeType:cb.dataset.mime||"application/octet-stream"
        });
      });
      renderSelectedAttachments();
      picker.classList.add("hidden");
    };
  }catch(error){
    picker.innerHTML=`<div class="empty-docs">${esc(error.message)}</div>`;
  }
}

// ===== BearCrest Version 4.3: Google Email + Loan Communication History =====
function currentLoan(){
  return loans.find(x=>x.loanId===$("loanId").value)||null;
}
function emailDate(value){
  try{return new Date(value).toLocaleString();}
  catch{return value||"";}
}
function renderEmailActivity(){
  const box=$("emailActivityList");
  if(!box)return;
  const loan=currentLoan();
  if(!loan){
    box.innerHTML='<div class="empty-docs">Save or open a loan to view email activity.</div>';
    return;
  }
  const activity=Array.isArray(loan.emailActivity)?[...loan.emailActivity].sort((a,b)=>String(b.sentAt||"").localeCompare(String(a.sentAt||""))):[];
  box.innerHTML=activity.length?activity.map(item=>`
    <div class="email-activity-row">
      <div>
        <strong>${esc(item.subject||"Email")}</strong>
        <small>To: ${esc(item.to||"")} · ${esc(emailDate(item.sentAt))}${item.attachments?.length?` · ${item.attachments.length} attachment${item.attachments.length===1?"":"s"}`:""}</small>
      </div>
      <div><span class="email-status-pill">${esc(item.status||"Sent")}</span></div>
    </div>`).join(""):'<div class="empty-docs">No emails have been sent from this loan yet.</div>';
}
function missingNeedsItems(loan){
  const items=DOCS.filter(d=>!loan.documents?.[d]);
  if(loan.missingDocs?.trim())items.push(...loan.missingDocs.split(/\n|;/).map(x=>x.trim()).filter(Boolean));
  return items;
}
function emailTemplateContent(template,loan){
  const a=getAdminSettings();
  const borrower=loan.borrowerName||"there";
  const property=loan.propertyAddress||"the subject property";
  const loanNumber=loan.loanNumber||"";
  const amount=money(loan.loanAmount)||"";
  const signature=a.emailSignature||ADMIN_DEFAULTS.emailSignature;
  const needs=missingNeedsItems(loan);
  const templates={
    general:{subject:`BearCrest Funding — ${property}`,body:`Hello ${borrower},\n\nI am reaching out regarding your financing request for ${property}.\n\n\n\n${signature}`},
    received:{subject:`Application Received — ${property}`,body:`Hello ${borrower},\n\nWe received your financing application for ${property}${loanNumber?` (Loan ${loanNumber})`:""}. We are reviewing the information and will contact you if anything else is needed.\n\n${signature}`},
    needs:{subject:`Items Needed — ${property}`,body:`Hello ${borrower},\n\nTo continue reviewing your financing request for ${property}, please provide the following:\n\n${needs.length?needs.map(x=>`• ${x}`).join("\n"):"• No outstanding items are currently listed in the CRM."}\n\nPlease send clear and complete copies. Additional documentation may be requested as underwriting progresses.\n\n${signature}`},
    preapproval:{subject:`Preliminary Approval — ${property}`,body:`Hello ${borrower},\n\nYour financing request for ${property} has received preliminary approval${amount?` for up to ${amount}`:""} under the ${loan.program||"applicable"} program.\n\nThis is not a commitment or guarantee to lend. Final terms remain subject to underwriting, valuation, title, insurance, required documentation, and final lender approval.\n\n${signature}`},
    conditions:{subject:`Additional Information Needed — ${property}`,body:`Hello ${borrower},\n\nWe are continuing to work on your financing request for ${property}. The following additional information or conditions are needed:\n\n${loan.termConditions?.trim()||"Please review the outstanding document needs listed for your loan."}\n\n${signature}`},
    termSheet:{subject:`Term Sheet Ready — ${property}`,body:`Hello ${borrower},\n\nYour preliminary term sheet for ${property}${loanNumber?` (Loan ${loanNumber})`:""} is ready for review.\n\nPlease contact me with any questions. The proposed terms remain subject to underwriting and final lender approval.\n\n${signature}`},
    closing:{subject:`Closing Update — ${property}`,body:`Hello ${borrower},\n\nCongratulations. Your financing for ${property} is moving toward closing${loan.targetClosing?` with a target closing date of ${longDate(loan.targetClosing)}`:""}.\n\nWe will keep you updated on any final items needed.\n\n${signature}`},
    decline:{subject:`Loan Request Decision — ${property}`,body:`Hello ${borrower},\n\nThank you for allowing BearCrest Funding to review your financing request for ${property}.\n\nAt this time, we are unable to approve the request under the program guidelines available to us.${loan.declineReason?.trim()?`\n\nPrimary reason: ${loan.declineReason.trim()}`:""}\n\nThis decision applies only to the current request. You are welcome to submit updated information or a different transaction for consideration.\n\n${signature}`}
  };
  return templates[template]||templates.general;
}
function composeEmailUrl(data){
  const params=new URLSearchParams();
  if(data.to)params.set("to",data.to);
  if(data.cc)params.set("cc",data.cc);
  if(data.bcc)params.set("bcc",data.bcc);
  if(data.subject)params.set("su",data.subject);
  if(data.body)params.set("body",data.body);
  return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
}
function getEmailFormData(){
  const loan=currentLoan();
  let body=$("emailBody").value;
  if($("includeDriveLink").checked&&loan?.driveFolderUrl&&!body.includes(loan.driveFolderUrl)){
    body+=`\n\nLoan documents folder:\n${loan.driveFolderUrl}`;
  }
  return {to:$("emailTo").value.trim(),cc:$("emailCc").value.trim(),bcc:$("emailBcc").value.trim(),subject:$("emailSubject").value.trim(),body,loan};
}
function applyEmailTemplate(){
  const loan=currentLoan();
  if(!loan)return;
  const content=emailTemplateContent($("emailTemplate").value,loan);
  $("emailSubject").value=content.subject;
  $("emailBody").value=content.body;
}
function openEmailComposer(template="general"){
  const loan=currentLoan();
  if(!loan){
    alert("Save the loan before sending an email.");
    return;
  }
  $("emailLoanContext").textContent=`${loan.borrowerName||"Borrower"} · ${loan.propertyAddress||"No property address"} · ${loan.loanNumber||""}`;
  $("emailTo").value=loan.email||"";
  $("emailCc").value="";
  $("emailBcc").value="";
  $("emailTemplate").value=template;
  $("includeDriveLink").checked=false;
  $("emailSendStatus").textContent="";
  resetEmailAttachments();
  applyEmailTemplate();
  $("emailDialog").showModal();
}
function plainTextToHtml(text){
  return esc(text).replace(/\n/g,"<br>");
}
function recordEmailActivity(loanId,item){
  const loan=loans.find(x=>x.loanId===loanId);
  if(!loan)return;
  if(!Array.isArray(loan.emailActivity))loan.emailActivity=[];
  loan.emailActivity.unshift(item);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(loans));
  renderEmailActivity();
  render();
}
if($("composeEmailBtn"))$("composeEmailBtn").onclick=()=>openEmailComposer("general");
if($("loadLoanFilesBtn"))$("loadLoanFilesBtn").onclick=loadDriveAttachmentChoices;
if($("emailAttachmentInput"))$("emailAttachmentInput").addEventListener("change",async e=>{
  try{
    await addComputerAttachments([...e.target.files]);
  }catch(error){
    alert(`Attachment could not be added: ${error.message}`);
  }finally{
    e.target.value="";
  }
});
if($("closeEmailDialogBtn"))$("closeEmailDialogBtn").onclick=()=>$("emailDialog").close();
if($("cancelEmailBtn"))$("cancelEmailBtn").onclick=()=>$("emailDialog").close();
if($("emailTemplate"))$("emailTemplate").onchange=applyEmailTemplate;
if($("openGmailBtn"))$("openGmailBtn").onclick=()=>{
  const data=getEmailFormData();
  window.open(composeEmailUrl(data),"_blank");
};
if($("emailForm"))$("emailForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const data=getEmailFormData();
  if(!data.loan)return;
  if(!data.to){
    alert("Enter the recipient's email address.");
    return;
  }
  if(!cloudConfigured()){
    alert("Google Apps Script is not connected. Open Settings and test the connection first.");
    return;
  }
  const settings=getAdminSettings();
  const button=$("sendEmailBtn");
  try{
    button.disabled=true;
    button.textContent="Sending...";
    $("emailSendStatus").textContent="Sending through Google...";
    const out=await cloudCall("sendEmail",{
      to:data.to,cc:data.cc,bcc:data.bcc,subject:data.subject,plainBody:data.body,
      htmlBody:plainTextToHtml(data.body),senderName:settings.emailSenderName||settings.companyName,
      replyTo:settings.emailReplyTo||settings.email,loanNumber:data.loan.loanNumber,
      borrowerName:data.loan.borrowerName,propertyAddress:data.loan.propertyAddress,
      attachments:emailAttachments.map(item=>({
        source:item.source,
        fileId:item.fileId||"",
        name:item.name||"Attachment",
        mimeType:item.mimeType||"application/octet-stream",
        base64:item.base64||""
      }))
    });
    recordEmailActivity(data.loan.loanId,{
      id:uuid(),sentAt:new Date().toISOString(),to:data.to,cc:data.cc,bcc:data.bcc,
      subject:data.subject,template:$("emailTemplate").value,status:"Sent",messageId:out.messageId||"",
      attachments:emailAttachments.map(item=>item.name)
    });
    $("emailSendStatus").textContent="Email sent successfully.";
    setTimeout(()=>$("emailDialog").close(),500);
  }catch(error){
    $("emailSendStatus").textContent=`Email was not sent: ${error.message}`;
    alert(error.message);
  }finally{
    button.disabled=false;
    button.textContent="Send Email";
  }
});

// ===== BearCrest Version 4.0: Funding Partner Management =====
const LENDER_STORAGE_KEY="bearcrest_lenders_v4_1_clean";
const DEFAULT_LENDER_NAMES=[
  "Unitas Funding","Kiavi","Visio Lending","Ternus Lending","Quickline Capital",
  "RCN Capital","Easy Street Capital","IceCap Group","New Silver","Rock Capital",
  "Velocity Mortgage Capital","Deephaven Mortgage","Groundfloor","Anchor Loans",
  "Constructive Capital","EquityMax","First Equity Funding","Capital Funding",
  "Lendo One","ABL Funding","A&D Mortgages","Tidal Loans","Cogo Capital",
  "Private Capital","Other"
];
let lenders=[];

function normalizeLender(x={},index=0){
  return {
    id:x.id||uuid(),
    name:String(x.name||"").trim(),
    active:x.active!==false,
    order:Number(x.order||index+1),
    contactName:String(x.contactName||""),
    email:String(x.email||""),
    phone:String(x.phone||""),
    portalUrl:String(x.portalUrl||""),
    notes:String(x.notes||""),
    createdAt:x.createdAt||new Date().toISOString(),
    updatedAt:x.updatedAt||new Date().toISOString()
  };
}
function defaultLenders(){
  return DEFAULT_LENDER_NAMES.map((name,index)=>normalizeLender({name},index));
}
function getLocalLenders(){
  try{
    const stored=JSON.parse(localStorage.getItem(LENDER_STORAGE_KEY)||"null");
    if(Array.isArray(stored)&&stored.length)return stored.map(normalizeLender);
  }catch(e){}
  const initial=defaultLenders();
  localStorage.setItem(LENDER_STORAGE_KEY,JSON.stringify(initial));
  return initial;
}
function saveLocalLenders(){
  localStorage.setItem(LENDER_STORAGE_KEY,JSON.stringify(lenders));
}
function sortLenders(){
  lenders.sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||a.name.localeCompare(b.name));
}
async function loadLenders(showMessage=false){
  try{
    if(cloudConfigured()){
      const out=await cloudCall("listLenders",{activeOnly:false});
      lenders=(out.lenders||[]).map(normalizeLender);
      localStorage.setItem(LENDER_STORAGE_KEY,JSON.stringify(lenders));
      if(showMessage)$("lenderAdminStatus").textContent="Lenders synchronized with Google Apps Script.";
    }else{
      lenders=getLocalLenders();
      if(showMessage)$("lenderAdminStatus").textContent="Lenders are saved in this browser until Google Apps Script is connected.";
    }
  }catch(error){
    lenders=getLocalLenders();
    if(showMessage)$("lenderAdminStatus").textContent=`Cloud lender list unavailable. Using browser copy: ${error.message}`;
  }
  sortLenders();
  populateLenderDropdowns();
  renderLenderAdmin();
}
function populateLenderDropdown(selectId,prompt){
  const select=$(selectId);
  if(!select)return;
  const current=select.value;
  const options=lenders.filter(l=>l.active!==false||l.name===current);
  select.innerHTML=`<option value="">${prompt}</option>`+options.map(l=>`<option value="${esc(l.name)}">${esc(l.name)}</option>`).join("");
  if(current && !options.some(l=>l.name===current)){
    select.insertAdjacentHTML("beforeend",`<option value="${esc(current)}">${esc(current)} (inactive)</option>`);
  }
  select.value=current;
}
function populateLenderDropdowns(){
  populateLenderDropdown("lender","Select lender...");
  populateLenderDropdown("finalLender","Not yet funded...");
}
function lenderLoanStats(name){
  const assigned=loans.filter(l=>l.lender===name).length;
  const approved=loans.filter(l=>l.lender===name&&["Approved","Closing","Closed"].includes(l.status)).length;
  const funded=loans.filter(l=>(l.finalLender||l.lender)===name&&l.status==="Closed");
  const volume=funded.reduce((sum,l)=>sum+Number(l.loanAmount||0),0);
  return {assigned,approved,funded:funded.length,volume};
}
function renderLenderAdmin(){
  const list=$("lenderList"),summary=$("lenderSummary");
  if(!list||!summary)return;
  const active=lenders.filter(l=>l.active!==false);
  const fundedLoans=loans.filter(l=>l.status==="Closed"&&(l.finalLender||l.lender));
  const fundedVolume=fundedLoans.reduce((sum,l)=>sum+Number(l.loanAmount||0),0);
  summary.innerHTML=`
    <div><strong>${active.length}</strong><span>Active Lenders</span></div>
    <div><strong>${lenders.length-active.length}</strong><span>Inactive</span></div>
    <div><strong>${fundedLoans.length}</strong><span>Funded Loans</span></div>
    <div><strong>${money(fundedVolume)||"$0"}</strong><span>Funded Volume</span></div>`;
  list.innerHTML=lenders.map((l,index)=>{
    const s=lenderLoanStats(l.name);
    return `<div class="lender-row ${l.active===false?"inactive":""}">
      <div class="lender-main">
        <div class="lender-name-line"><strong>${esc(l.name)}</strong>${l.active===false?'<span class="inactive-pill">Inactive</span>':""}</div>
        <div class="lender-contact">${esc(l.contactName||"No contact saved")}${l.email?` · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`:""}${l.phone?` · ${esc(l.phone)}`:""}</div>
        <div class="lender-performance">${s.assigned} assigned · ${s.approved} approved/closing · ${s.funded} funded · ${money(s.volume)||"$0"} volume</div>
        ${l.notes?`<div class="lender-notes">${esc(l.notes)}</div>`:""}
      </div>
      <div class="lender-row-actions">
        ${l.portalUrl?`<button type="button" onclick="window.open('${esc(l.portalUrl)}','_blank')">Portal</button>`:""}
        <button type="button" onclick="moveLender('${l.id}',-1)" ${index===0?"disabled":""}>↑</button>
        <button type="button" onclick="moveLender('${l.id}',1)" ${index===lenders.length-1?"disabled":""}>↓</button>
        <button type="button" onclick="editLender('${l.id}')">Edit</button>
        <button type="button" onclick="toggleLender('${l.id}')">${l.active===false?"Activate":"Deactivate"}</button>
      </div>
    </div>`;
  }).join("")||'<div class="empty-state">No lenders have been added.</div>';
}
function clearLenderEditor(){
  ["lenderEditId","lenderName","lenderContactName","lenderEmail","lenderPhone","lenderPortalUrl","lenderNotes"].forEach(id=>{if($(id))$(id).value="";});
  $("lenderEditor")?.classList.add("hidden");
}
function openLenderEditor(lender=null){
  $("lenderEditor")?.classList.remove("hidden");
  $("lenderEditId").value=lender?.id||"";
  $("lenderName").value=lender?.name||"";
  $("lenderContactName").value=lender?.contactName||"";
  $("lenderEmail").value=lender?.email||"";
  $("lenderPhone").value=lender?.phone||"";
  $("lenderPortalUrl").value=lender?.portalUrl||"";
  $("lenderNotes").value=lender?.notes||"";
  setTimeout(()=>$("lenderName")?.focus(),0);
}
window.editLender=id=>openLenderEditor(lenders.find(l=>l.id===id));
async function persistLender(payload){
  if(cloudConfigured()){
    const out=await cloudCall("saveLender",payload);
    lenders=(out.lenders||lenders).map(normalizeLender);
  }else{
    const now=new Date().toISOString();
    let lender=lenders.find(l=>l.id===payload.id);
    if(!lender){
      lender=normalizeLender({id:uuid(),order:lenders.length+1,createdAt:now});
      lenders.push(lender);
    }
    const duplicate=lenders.find(l=>l.id!==lender.id&&l.name.toLowerCase()===payload.name.toLowerCase());
    if(duplicate)throw new Error("A lender with that name already exists.");
    Object.assign(lender,payload,{id:lender.id,updatedAt:now});
    saveLocalLenders();
  }
  sortLenders();
  localStorage.setItem(LENDER_STORAGE_KEY,JSON.stringify(lenders));
  populateLenderDropdowns();
  renderLenderAdmin();
}
window.toggleLender=async id=>{
  const lender=lenders.find(l=>l.id===id);if(!lender)return;
  try{
    if(cloudConfigured()){
      const out=await cloudCall("setLenderActive",{id,active:lender.active===false});
      lenders=(out.lenders||lenders).map(normalizeLender);
    }else{
      lender.active=lender.active===false;
      lender.updatedAt=new Date().toISOString();
      saveLocalLenders();
    }
    populateLenderDropdowns();renderLenderAdmin();
  }catch(e){alert(e.message);}
};
window.moveLender=async(id,direction)=>{
  sortLenders();
  const index=lenders.findIndex(l=>l.id===id),newIndex=index+direction;
  if(index<0||newIndex<0||newIndex>=lenders.length)return;
  [lenders[index],lenders[newIndex]]=[lenders[newIndex],lenders[index]];
  lenders.forEach((l,i)=>l.order=i+1);
  try{
    if(cloudConfigured()){
      const out=await cloudCall("reorderLenders",{ids:lenders.map(l=>l.id)});
      lenders=(out.lenders||lenders).map(normalizeLender);
    }else saveLocalLenders();
    populateLenderDropdowns();renderLenderAdmin();
  }catch(e){alert(e.message);}
};
if($("newLenderBtn"))$("newLenderBtn").onclick=()=>openLenderEditor();
if($("cancelLenderBtn"))$("cancelLenderBtn").onclick=clearLenderEditor;
if($("saveLenderBtn"))$("saveLenderBtn").onclick=async()=>{
  const name=$("lenderName").value.trim();
  if(!name){alert("Enter the lender name.");$("lenderName").focus();return;}
  const payload={
    id:$("lenderEditId").value||undefined,
    name,
    contactName:$("lenderContactName").value.trim(),
    email:$("lenderEmail").value.trim(),
    phone:$("lenderPhone").value.trim(),
    portalUrl:$("lenderPortalUrl").value.trim(),
    notes:$("lenderNotes").value.trim(),
    active:true
  };
  try{
    $("saveLenderBtn").disabled=true;
    await persistLender(payload);
    clearLenderEditor();
    $("lenderAdminStatus").textContent=`${name} saved.`;
  }catch(e){alert(e.message);}
  finally{$("saveLenderBtn").disabled=false;}
};

// Preserve selected dropdown values whenever a loan is opened or cleared.
const v4ClearForm=clearForm;
clearForm=function(){
  v4ClearForm();
  populateLenderDropdowns();
};
const v4EditLoan=window.editLoan;
window.editLoan=function(id){
  v4EditLoan(id);
  populateLenderDropdowns();
  const loan=loans.find(x=>x.loanId===id);
  if(loan){
    $("lender").value=loan.lender||"";
    $("finalLender").value=loan.finalLender||"";
  }
};

// Refresh lender list when Settings opens.
const v4CloudSetupClick=$("cloudSetupBtn").onclick;
$("cloudSetupBtn").onclick=async()=>{
  if(v4CloudSetupClick)v4CloudSetupClick();
  await loadLenders(true);
};

// Keep lender reporting current after loan saves.
const v4Save=save;
save=function(){
  v4Save();
  renderLenderAdmin();
};

loadLenders();

loadDirectoryHandle().then(()=>updateLocalDriveStatus());


// ===== BearCrest Version 5.0 Dashboard Shell =====
const V5_PLACEHOLDERS={
  calendar:["Calendar","Closing dates and follow-up dates will be organized here.","Calendar"],
  tasks:["Tasks","A focused task center for outstanding loan work.","Tasks"],
  contacts:["Contacts","Borrowers, brokers, Realtors, title contacts, and insurance contacts.","Contacts"],
  lenders:["Lenders","Manage lender contacts and guidelines from Settings.","Funding Partners"],
  documents:["Documents","Loan documents remain accessible inside each loan file.","Documents"],
  communication:["Communication","Sent-email activity is stored inside each loan.","Communication"],
  reports:["Reports","Production and lender-performance reporting will live here.","Reports"],
  archive:["Archive","Use Archived Loans in the pipeline to review inactive records.","Archive"]
};

function v5ShowView(name){
  document.querySelectorAll(".app-view").forEach(view=>view.classList.remove("active-view"));
  document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));

  if(name==="dashboard"){
    $("dashboardView").classList.add("active-view");
    document.querySelector('[data-view="dashboard"]')?.classList.add("active");
    $("viewSubtitle").textContent="Business-purpose lending operations dashboard";
    archiveOnly=false;
    $("statusFilter").value="";
    render();
    return;
  }

  if(name==="pipeline"||name==="loans"){
    $("pipelineView").classList.add("active-view");
    document.querySelector(`[data-view="${name}"]`)?.classList.add("active");
    $("viewSubtitle").textContent=name==="loans"?"All loan records":"Active loan pipeline";
    if(name==="loans"){archiveOnly=false;$("statusFilter").value="";}
    render();
    return;
  }

  $("placeholderView").classList.add("active-view");
  document.querySelector(`[data-view="${name}"]`)?.classList.add("active");
  const info=V5_PLACEHOLDERS[name]||["Module","This module is ready for future expansion.","Module"];
  $("placeholderTitle").textContent=info[0];
  $("placeholderText").textContent=info[1];
  $("placeholderCardTitle").textContent=info[2];
  $("viewSubtitle").textContent=info[0];
  if(name==="lenders"){
    fillAdminSettings();
    $("cloudSetupDialog").showModal();
    setTimeout(()=>document.querySelector(".lender-management-section")?.scrollIntoView({behavior:"smooth"}),100);
  }
  if(name==="archive"){
    archiveOnly=true;
    $("statusFilter").value="Archived";
    v5ShowView("pipeline");
  }
}

document.querySelectorAll(".nav-item[data-view]").forEach(button=>{
  button.addEventListener("click",()=>v5ShowView(button.dataset.view));
});
document.querySelectorAll("[data-go]").forEach(button=>{
  button.addEventListener("click",()=>v5ShowView(button.dataset.go));
});
if($("sidebarSettingsBtn"))$("sidebarSettingsBtn").onclick=()=>$("cloudSetupBtn").click();
if($("v5AddLoanBtn"))$("v5AddLoanBtn").onclick=()=>openAdd();
if($("v5SyncBtn"))$("v5SyncBtn").onclick=()=>$("syncApplicationsBtn").click();
if($("v5OpenStorageBtn"))$("v5OpenStorageBtn").onclick=()=>{
  const first=loans.find(l=>l.driveFolderUrl);
  if(first?.driveFolderUrl)window.open(first.driveFolderUrl,"_blank");
  else alert("Open a loan and prepare its client folder first.");
};

function v5StatusCount(status){
  return loans.filter(l=>l.status===status).length;
}
function v5RenderPipelineBars(){
  const box=$("v5PipelineBars");
  if(!box)return;
  const statuses=["New Lead","Reviewing","Submitted","Approved","Closing","Closed"];
  const max=Math.max(1,...statuses.map(v5StatusCount));
  box.innerHTML=statuses.map(status=>{
    const count=v5StatusCount(status);
    return `<div class="pipeline-bar-row"><span>${esc(status)}</span><div><i style="width:${Math.max(4,(count/max)*100)}%"></i></div><strong>${count}</strong></div>`;
  }).join("");
}
function v5RenderRecentLoans(){
  const box=$("v5RecentLoans");
  if(!box)return;
  const recent=[...loans].sort((a,b)=>String(b.dateReceived||"").localeCompare(String(a.dateReceived||""))).slice(0,6);
  box.innerHTML=recent.length?recent.map(l=>`
    <button class="recent-loan-row" onclick="editLoan('${l.loanId}')">
      <span><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||"No property address")}</small></span>
      <span><small>${esc(l.status||"")}</small><strong>${money(l.loanAmount)||"—"}</strong></span>
    </button>`).join(""):'<div class="empty-state">No loans yet. Add your first loan or sync Jotform.</div>';
}
function v5RenderFollowups(){
  const box=$("v5FollowupPreview");
  if(!box)return;
  const due=loans.filter(l=>isDueToday(l.nextFollowUp,l.status)).sort((a,b)=>String(a.nextFollowUp||"").localeCompare(String(b.nextFollowUp||""))).slice(0,5);
  box.innerHTML=due.length?due.map(l=>`
    <button class="preview-row" onclick="editLoan('${l.loanId}')">
      <span class="preview-icon">✓</span>
      <span><strong>${esc(l.borrowerName)}</strong><small>${esc(l.nextFollowUp||"Today")} · ${esc(l.propertyAddress||"")}</small></span>
    </button>`).join(""):'<div class="empty-state compact-empty">Nothing due today.</div>';
}
function v5RenderCommunication(){
  const box=$("v5CommunicationPreview");
  if(!box)return;
  const activity=[];
  loans.forEach(loan=>(loan.emailActivity||[]).forEach(item=>activity.push({...item,loan})));
  activity.sort((a,b)=>String(b.sentAt||"").localeCompare(String(a.sentAt||"")));
  box.innerHTML=activity.slice(0,5).map(item=>`
    <button class="preview-row" onclick="editLoan('${item.loan.loanId}')">
      <span class="preview-icon">✉</span>
      <span><strong>${esc(item.subject||"Email")}</strong><small>${esc(item.loan.borrowerName||"")} · ${esc(emailDate(item.sentAt))}</small></span>
    </button>`).join("")||'<div class="empty-state compact-empty">No email activity yet.</div>';
}
function v5RenderShell(){
  v5RenderPipelineBars();
  v5RenderRecentLoans();
  v5RenderFollowups();
  v5RenderCommunication();

  const configured=cloudConfigured();
  if($("v5CloudStatus"))$("v5CloudStatus").textContent=configured?"Connected":"Not Connected";
  document.querySelector(".status-dot")?.classList.toggle("offline",!configured);

  const meta=typeof getSyncMeta==="function"?getSyncMeta():{};
  if($("v5SyncTime"))$("v5SyncTime").textContent=meta.lastSync?`Last sync: ${new Date(meta.lastSync).toLocaleString()}`:"Smart Sync ready";

  const settings=getAdminSettings();
  if($("v5StorageName"))$("v5StorageName").textContent=settings.rootFolder||"BearCrest CRM Documents";

  const active=loans.filter(l=>!["Closed","Dead","Archived"].includes(l.status)).length;
  if($("v5FooterStats"))$("v5FooterStats").textContent=`Total Loans: ${loans.length}   ·   Active: ${active}   ·   Approved: ${v5StatusCount("Approved")}   ·   Closed: ${v5StatusCount("Closed")}`;
}

const v5OriginalRender=render;
render=function(){
  v5OriginalRender();
  v5RenderShell();
};

v5RenderShell();


// ===== BearCrest Version 5.2: Calendar + Task Operations Center =====
const TASK_STORAGE_KEY="bearcrest_tasks_v5_2";
const EVENT_STORAGE_KEY="bearcrest_calendar_events_v5_2";
let calendarCursor=new Date();
calendarCursor.setDate(1);
let tasks=loadTasks();
let calendarEvents=loadCalendarEvents();

function loadTasks(){try{return JSON.parse(localStorage.getItem(TASK_STORAGE_KEY)||"[]");}catch{return [];}}
function saveTasks(){localStorage.setItem(TASK_STORAGE_KEY,JSON.stringify(tasks));renderTaskCenter();v5RenderShell();}
function loadCalendarEvents(){try{return JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY)||"[]");}catch{return [];}}
function saveCalendarEvents(){localStorage.setItem(EVENT_STORAGE_KEY,JSON.stringify(calendarEvents));renderCalendar();}
function populateLoanSelector(selectId,selected=""){
  const select=$(selectId);if(!select)return;
  select.innerHTML='<option value="">General / No Loan</option>'+loans.map(l=>`<option value="${l.loanId}">${esc(l.loanNumber||"")} · ${esc(l.borrowerName||"")} · ${esc(l.propertyAddress||"")}</option>`).join("");
  select.value=selected||"";
}
function taskLoan(task){return loans.find(l=>l.loanId===task.loanId);}
function taskIsOverdue(task){return task.status!=="Completed"&&task.dueDate&&task.dueDate<today();}
function taskDueToday(task){return task.status!=="Completed"&&task.dueDate===today();}
function renderTaskStats(){
  const box=$("taskStats");if(!box)return;
  box.innerHTML=`
    <div><strong>${tasks.filter(t=>t.status!=="Completed").length}</strong><span>Open Tasks</span></div>
    <div><strong>${tasks.filter(taskDueToday).length}</strong><span>Due Today</span></div>
    <div><strong>${tasks.filter(taskIsOverdue).length}</strong><span>Overdue</span></div>
    <div><strong>${tasks.filter(t=>t.status==="Completed").length}</strong><span>Completed</span></div>`;
}
function filteredTasks(){
  const q=($("taskSearch")?.value||"").toLowerCase().trim(),status=$("taskStatusFilter")?.value||"",priority=$("taskPriorityFilter")?.value||"";
  return tasks.filter(task=>{
    const loan=taskLoan(task),hay=[task.title,task.notes,task.category,task.assignedTo,loan?.borrowerName,loan?.propertyAddress,loan?.loanNumber].join(" ").toLowerCase();
    const statusMatch=status==="all"?true:status==="completed"?task.status==="Completed":status==="overdue"?taskIsOverdue(task):status==="today"?taskDueToday(task):task.status!=="Completed";
    return (!q||hay.includes(q))&&statusMatch&&(!priority||task.priority===priority);
  }).sort((a,b)=>taskIsOverdue(a)!==taskIsOverdue(b)?(taskIsOverdue(a)?-1:1):String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999")));
}
function renderTaskCenter(){
  renderTaskStats();const box=$("taskList");if(!box)return;const list=filteredTasks();
  box.innerHTML=list.length?list.map(task=>{const loan=taskLoan(task);return `<div class="task-row ${taskIsOverdue(task)?"task-overdue":""} ${task.status==="Completed"?"task-completed":""}">
    <button class="task-check" onclick="toggleTaskComplete('${task.id}')">${task.status==="Completed"?"✓":""}</button>
    <div class="task-body" onclick="editTask('${task.id}')"><div class="task-title-line"><strong>${esc(task.title)}</strong><span class="priority-pill ${String(task.priority).toLowerCase()}">${esc(task.priority)}</span></div>
    <small>${esc(task.category)} · Due ${esc(task.dueDate||"Not set")} · ${esc(task.assignedTo||"Unassigned")}</small>${loan?`<small>${esc(loan.loanNumber||"")} · ${esc(loan.borrowerName||"")} · ${esc(loan.propertyAddress||"")}</small>`:""}</div>
    <button onclick="editTask('${task.id}')">Open</button></div>`;}).join(""):'<div class="empty-state">No tasks match this view.</div>';
}
function openTaskDialog(task=null,loanId=""){
  populateLoanSelector("taskLoanId",task?.loanId||loanId);
  $("taskId").value=task?.id||"";$("taskTitle").value=task?.title||"";$("taskDueDate").value=task?.dueDate||today();$("taskPriority").value=task?.priority||"Medium";$("taskAssignedTo").value=task?.assignedTo||"Joel Vazquez";$("taskCategory").value=task?.category||"Follow-Up";$("taskStatus").value=task?.status||"Open";$("taskNotes").value=task?.notes||"";$("taskAddToCalendar").checked=task?.addToCalendar===true;
  $("taskDialogTitle").textContent=task?"Edit Task":"New Task";$("deleteTaskBtn").classList.toggle("hidden",!task);$("taskDialog").showModal();
}
window.editTask=id=>openTaskDialog(tasks.find(t=>t.id===id));
window.toggleTaskComplete=id=>{const task=tasks.find(t=>t.id===id);if(!task)return;task.status=task.status==="Completed"?"Open":"Completed";saveTasks();};
$("newTaskBtn").onclick=()=>openTaskDialog();
$("addLoanTaskBtn").onclick=()=>openTaskDialog(null,$("loanId").value);
$("closeTaskDialogBtn").onclick=()=>$("taskDialog").close();
$("cancelTaskBtn").onclick=()=>$("taskDialog").close();
$("taskSearch").oninput=renderTaskCenter;$("taskStatusFilter").onchange=renderTaskCenter;$("taskPriorityFilter").onchange=renderTaskCenter;
$("taskForm").addEventListener("submit",e=>{
  e.preventDefault();const id=$("taskId").value||uuid(),existing=tasks.find(t=>t.id===id);
  const task={id,title:$("taskTitle").value.trim(),dueDate:$("taskDueDate").value,priority:$("taskPriority").value,assignedTo:$("taskAssignedTo").value.trim(),loanId:$("taskLoanId").value,category:$("taskCategory").value,status:$("taskStatus").value,notes:$("taskNotes").value.trim(),addToCalendar:$("taskAddToCalendar").checked,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(existing)Object.assign(existing,task);else tasks.unshift(task);
  const eventId=`task_${task.id}`;
  if(task.addToCalendar){const ev=calendarEvents.find(x=>x.id===eventId),data={id:eventId,title:task.title,date:task.dueDate,time:"09:00",type:"Task",loanId:task.loanId,notes:task.notes,source:"task"};if(ev)Object.assign(ev,data);else calendarEvents.push(data);}
  else calendarEvents=calendarEvents.filter(ev=>ev.id!==eventId);
  $("taskDialog").close();saveTasks();saveCalendarEvents();
});
$("deleteTaskBtn").onclick=()=>{const id=$("taskId").value;if(!id||!confirm("Delete this task?"))return;tasks=tasks.filter(t=>t.id!==id);calendarEvents=calendarEvents.filter(ev=>ev.id!==`task_${id}`);$("taskDialog").close();saveTasks();saveCalendarEvents();};

function automaticLoanEvents(){
  const events=[];loans.forEach(loan=>{
    if(loan.nextFollowUp)events.push({id:`followup_${loan.loanId}`,title:`Follow-Up: ${loan.borrowerName||loan.loanNumber}`,date:loan.nextFollowUp,time:"09:00",type:"Follow-Up",loanId:loan.loanId,source:"loan"});
    if(loan.targetClosing)events.push({id:`closing_${loan.loanId}`,title:`Closing: ${loan.borrowerName||loan.loanNumber}`,date:loan.targetClosing,time:"10:00",type:"Closing",loanId:loan.loanId,source:"loan"});
    if(loan.termExpiration)events.push({id:`expiration_${loan.loanId}`,title:`Term Expires: ${loan.borrowerName||loan.loanNumber}`,date:loan.termExpiration,time:"09:00",type:"Expiration",loanId:loan.loanId,source:"loan"});
  });return events;
}
function allCalendarEvents(){const map=new Map();[...automaticLoanEvents(),...calendarEvents].forEach(ev=>map.set(ev.id,ev));return [...map.values()];}
function eventClass(type){const t=String(type||"").toLowerCase();if(t.includes("closing"))return"closing";if(t.includes("expiration"))return"expiration";if(t.includes("follow")||t==="task")return"followup";return"custom";}
function renderCalendar(){
  const grid=$("calendarGrid");if(!grid)return;const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  $("calendarMonthTitle").textContent=calendarCursor.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const firstDay=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),prevDays=new Date(year,month,0).getDate(),events=allCalendarEvents(),cells=[];
  for(let i=0;i<42;i++){let d,muted=false;if(i<firstDay){d=new Date(year,month-1,prevDays-firstDay+i+1);muted=true;}else if(i>=firstDay+days){d=new Date(year,month+1,i-firstDay-days+1);muted=true;}else d=new Date(year,month,i-firstDay+1);
    const key=d.toISOString().slice(0,10),dayEvents=events.filter(ev=>ev.date===key).slice(0,4);
    cells.push(`<div class="calendar-cell ${muted?"muted-day":""} ${key===today()?"today-cell":""}" data-date="${key}"><div class="calendar-day-number">${d.getDate()}</div><div class="calendar-events">${dayEvents.map(ev=>`<button class="calendar-event ${eventClass(ev.type)}" onclick="openCalendarItem('${ev.id}','${ev.source||"custom"}')">${esc(ev.time||"")} ${esc(ev.title)}</button>`).join("")}</div></div>`);
  }
  grid.innerHTML=cells.join("");grid.querySelectorAll(".calendar-cell").forEach(cell=>cell.addEventListener("dblclick",()=>openCalendarEventDialog(null,"",cell.dataset.date)));
}
function openCalendarEventDialog(event=null,loanId="",date=""){
  populateLoanSelector("calendarEventLoanId",event?.loanId||loanId);$("calendarEventId").value=event?.id||"";$("calendarEventTitle").value=event?.title||"";$("calendarEventDate").value=event?.date||date||today();$("calendarEventTime").value=event?.time||"09:00";$("calendarEventType").value=event?.type||"Follow-Up";$("calendarEventNotes").value=event?.notes||"";$("calendarGoogleSync").checked=false;$("calendarEventDialogTitle").textContent=event?"Edit Calendar Event":"New Calendar Event";$("deleteCalendarEventBtn").classList.toggle("hidden",!event||event.source==="loan");$("calendarEventDialog").showModal();
}
window.openCalendarItem=(id,source)=>{if(source==="loan"){editLoan(id.split("_").slice(1).join("_"));return;}if(source==="task"){editTask(id.replace("task_",""));return;}openCalendarEventDialog(calendarEvents.find(ev=>ev.id===id));};
$("newCalendarEventBtn").onclick=()=>openCalendarEventDialog();
$("addLoanCalendarBtn").onclick=()=>openCalendarEventDialog(null,$("loanId").value);
$("closeCalendarEventBtn").onclick=()=>$("calendarEventDialog").close();
$("cancelCalendarEventBtn").onclick=()=>$("calendarEventDialog").close();
$("calendarPrevBtn").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();};
$("calendarNextBtn").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();};
$("calendarTodayBtn").onclick=()=>{calendarCursor=new Date();calendarCursor.setDate(1);renderCalendar();};
$("calendarEventForm").addEventListener("submit",async e=>{
  e.preventDefault();const id=$("calendarEventId").value||uuid(),existing=calendarEvents.find(ev=>ev.id===id);
  const event={id,title:$("calendarEventTitle").value.trim(),date:$("calendarEventDate").value,time:$("calendarEventTime").value||"09:00",type:$("calendarEventType").value,loanId:$("calendarEventLoanId").value,notes:$("calendarEventNotes").value.trim(),source:"custom",googleEventId:existing?.googleEventId||""};
  if($("calendarGoogleSync").checked&&cloudConfigured()){try{const loan=loans.find(l=>l.loanId===event.loanId),result=await cloudCall("createCalendarEvent",{title:event.title,date:event.date,time:event.time,description:[event.notes,loan?`Loan: ${loan.loanNumber}\nBorrower: ${loan.borrowerName}\nProperty: ${loan.propertyAddress}`:""].filter(Boolean).join("\n\n")});event.googleEventId=result.eventId||"";event.googleEventUrl=result.eventUrl||"";}catch(error){alert(`CRM event saved, but Google Calendar sync failed: ${error.message}`);}}
  if(existing)Object.assign(existing,event);else calendarEvents.push(event);$("calendarEventDialog").close();saveCalendarEvents();
});
$("deleteCalendarEventBtn").onclick=()=>{const id=$("calendarEventId").value;if(!id||!confirm("Delete this calendar event?"))return;calendarEvents=calendarEvents.filter(ev=>ev.id!==id);$("calendarEventDialog").close();saveCalendarEvents();};

const v52OldShowView=v5ShowView;
v5ShowView=function(name){
  if(name==="calendar"||name==="tasks"){
    document.querySelectorAll(".app-view").forEach(view=>view.classList.remove("active-view"));document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));
    $(name==="calendar"?"calendarView":"tasksView").classList.add("active-view");document.querySelector(`[data-view="${name}"]`)?.classList.add("active");$("viewSubtitle").textContent=name==="calendar"?"Calendar and loan deadlines":"Daily task and follow-up operations";
    name==="calendar"?renderCalendar():renderTaskCenter();return;
  }
  v52OldShowView(name);
};
function v52DashboardPreview(){
  const box=$("v5FollowupPreview");if(!box)return;
  const combined=[...tasks.filter(t=>t.status!=="Completed").map(t=>({kind:"task",id:t.id,title:t.title,date:t.dueDate,subtitle:t.category})),...loans.filter(l=>isDueToday(l.nextFollowUp,l.status)).map(l=>({kind:"loan",id:l.loanId,title:`Follow up: ${l.borrowerName}`,date:l.nextFollowUp,subtitle:l.propertyAddress}))].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).slice(0,6);
  box.innerHTML=combined.length?combined.map(item=>`<button class="preview-row" onclick="${item.kind==="task"?`editTask('${item.id}')`:`editLoan('${item.id}')`}"><span class="preview-icon">${item.kind==="task"?"☑":"✓"}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.date||"")} · ${esc(item.subtitle||"")}</small></span></button>`).join(""):'<div class="empty-state compact-empty">Nothing due today.</div>';
}
const v52OldShell=v5RenderShell;
v5RenderShell=function(){v52OldShell();v52DashboardPreview();};
renderTaskCenter();renderCalendar();


// ===== BearCrest Version 5.3: Contacts + Reusable Document Library =====
const CONTACT_STORAGE_KEY="bearcrest_contacts_v5_3";
let contacts=loadContacts();
let pendingLibraryFiles=[];

function loadContacts(){try{return JSON.parse(localStorage.getItem(CONTACT_STORAGE_KEY)||"[]");}catch{return [];}}
function saveContacts(){localStorage.setItem(CONTACT_STORAGE_KEY,JSON.stringify(contacts));renderContacts();}
function contactName(c){return [c.firstName,c.lastName].filter(Boolean).join(" ").trim()||c.company||"Unnamed Contact";}
function renderContactStats(){
  const box=$("contactStats");if(!box)return;
  const counts={Borrower:0,Broker:0,Realtor:0,Lender:0};
  contacts.forEach(c=>{if(counts[c.type]!==undefined)counts[c.type]++;});
  box.innerHTML=`
    <div><strong>${contacts.length}</strong><span>Total Contacts</span></div>
    <div><strong>${counts.Borrower}</strong><span>Borrowers</span></div>
    <div><strong>${counts.Broker+counts.Realtor}</strong><span>Brokers & Realtors</span></div>
    <div><strong>${counts.Lender}</strong><span>Lender Contacts</span></div>`;
}
function filteredContacts(){
  const q=($("contactSearch")?.value||"").toLowerCase().trim(),type=$("contactTypeFilter")?.value||"";
  return contacts.filter(c=>{
    const hay=[contactName(c),c.company,c.email,c.phone,c.phone2,c.type,c.city,c.state,c.notes].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!type||c.type===type);
  }).sort((a,b)=>contactName(a).localeCompare(contactName(b)));
}
function renderContacts(){
  renderContactStats();const box=$("contactList");if(!box)return;const list=filteredContacts();
  box.innerHTML=list.length?list.map(c=>{
    const loan=loans.find(l=>l.loanId===c.loanId);
    return `<div class="contact-row">
      <div class="contact-avatar">${esc((c.firstName||c.company||"?").slice(0,1).toUpperCase())}</div>
      <div class="contact-main" onclick="editContact('${c.id}')">
        <div class="contact-title-line"><strong>${esc(contactName(c))}</strong><span>${esc(c.type||"Other")}</span></div>
        <small>${esc(c.company||"")}${c.company&&c.email?" · ":""}${esc(c.email||"")}${(c.company||c.email)&&c.phone?" · ":""}${esc(c.phone||"")}</small>
        ${loan?`<small>Loan: ${esc(loan.loanNumber||"")} · ${esc(loan.propertyAddress||"")}</small>`:""}
      </div>
      <div class="contact-actions">
        ${c.email?`<button onclick="window.location.href='mailto:${esc(c.email)}'">Email</button>`:""}
        ${c.phone?`<button onclick="window.location.href='tel:${esc(c.phone)}'">Call</button>`:""}
        <button onclick="editContact('${c.id}')">Open</button>
      </div>
    </div>`;
  }).join(""):'<div class="empty-state">No contacts yet. Add your first contact or import a CSV.</div>';
}
function populateContactLoanSelector(selected=""){
  const select=$("contactLoanId");if(!select)return;
  select.innerHTML='<option value="">No Related Loan</option>'+loans.map(l=>`<option value="${l.loanId}">${esc(l.loanNumber||"")} · ${esc(l.borrowerName||"")} · ${esc(l.propertyAddress||"")}</option>`).join("");
  select.value=selected||"";
}
function openContactDialog(contact=null){
  populateContactLoanSelector(contact?.loanId||"");
  $("contactId").value=contact?.id||"";
  $("contactFirstName").value=contact?.firstName||"";
  $("contactLastName").value=contact?.lastName||"";
  $("contactType").value=contact?.type||"Borrower";
  $("contactCompany").value=contact?.company||"";
  $("contactEmail").value=contact?.email||"";
  $("contactPhone").value=contact?.phone||"";
  $("contactPhone2").value=contact?.phone2||"";
  $("contactWebsite").value=contact?.website||"";
  $("contactAddress").value=contact?.address||"";
  $("contactCity").value=contact?.city||"";
  $("contactState").value=contact?.state||"";
  $("contactZip").value=contact?.zip||"";
  $("contactNotes").value=contact?.notes||"";
  $("contactDialogTitle").textContent=contact?"Edit Contact":"New Contact";
  $("deleteContactBtn").classList.toggle("hidden",!contact);
  $("contactDialog").showModal();
}
window.editContact=id=>openContactDialog(contacts.find(c=>c.id===id));
$("newContactBtn").onclick=()=>openContactDialog();
$("closeContactDialogBtn").onclick=()=>$("contactDialog").close();
$("cancelContactBtn").onclick=()=>$("contactDialog").close();
$("contactSearch").oninput=renderContacts;
$("contactTypeFilter").onchange=renderContacts;
$("contactForm").addEventListener("submit",e=>{
  e.preventDefault();
  const id=$("contactId").value||uuid(),existing=contacts.find(c=>c.id===id);
  const contact={id,firstName:$("contactFirstName").value.trim(),lastName:$("contactLastName").value.trim(),type:$("contactType").value,company:$("contactCompany").value.trim(),email:$("contactEmail").value.trim(),phone:$("contactPhone").value.trim(),phone2:$("contactPhone2").value.trim(),website:$("contactWebsite").value.trim(),address:$("contactAddress").value.trim(),city:$("contactCity").value.trim(),state:$("contactState").value.trim(),zip:$("contactZip").value.trim(),loanId:$("contactLoanId").value,notes:$("contactNotes").value.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(existing)Object.assign(existing,contact);else contacts.push(contact);
  $("contactDialog").close();saveContacts();
});
$("deleteContactBtn").onclick=()=>{
  const id=$("contactId").value;if(!id||!confirm("Delete this contact?"))return;
  contacts=contacts.filter(c=>c.id!==id);$("contactDialog").close();saveContacts();
};
$("exportContactsBtn").onclick=()=>{
  const headers=["First Name","Last Name","Type","Company","Email","Phone","Secondary Phone","Website","Address","City","State","ZIP","Notes"];
  const rows=contacts.map(c=>[c.firstName,c.lastName,c.type,c.company,c.email,c.phone,c.phone2,c.website,c.address,c.city,c.state,c.zip,c.notes]);
  const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  downloadFile("BearCrest_Contacts.csv",csv,"text/csv");
};
$("importContactsFile").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  const rows=parseCSV(await file.text());
  if(rows.length<2){alert("No contacts found in the CSV.");return;}
  const headers=rows[0].map(h=>h.toLowerCase().trim());
  const find=(row,names)=>{for(const name of names){const i=headers.indexOf(name);if(i>=0)return row[i]||"";}return"";};
  let added=0;
  for(const row of rows.slice(1)){
    if(!row.some(Boolean))continue;
    contacts.push({id:uuid(),firstName:find(row,["first name","firstname"]),lastName:find(row,["last name","lastname"]),type:find(row,["type","contact type"])||"Other",company:find(row,["company"]),email:find(row,["email"]),phone:find(row,["phone"]),phone2:find(row,["secondary phone","phone 2"]),website:find(row,["website"]),address:find(row,["address"]),city:find(row,["city"]),state:find(row,["state"]),zip:find(row,["zip","zipcode"]),notes:find(row,["notes"]),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    added++;
  }
  saveContacts();alert(`${added} contacts imported.`);e.target.value="";
});

async function fileToBase64(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function renderPendingLibraryFiles(){
  const box=$("librarySelectedFiles");if(!box)return;
  box.innerHTML=pendingLibraryFiles.map(f=>`<div class="pending-library-file"><strong>${esc(f.name)}</strong><small>${fileSize(f.size)}</small></div>`).join("");
}
$("libraryDocumentInput").addEventListener("change",e=>{
  pendingLibraryFiles=[...e.target.files];
  if(!pendingLibraryFiles.length)return;
  renderPendingLibraryFiles();
  $("libraryUploadDialog").showModal();
  e.target.value="";
});
$("closeLibraryUploadBtn").onclick=()=>$("libraryUploadDialog").close();
$("cancelLibraryUploadBtn").onclick=()=>$("libraryUploadDialog").close();
$("libraryUploadForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!cloudConfigured()){alert("Connect Google Apps Script first.");return;}
  if(!pendingLibraryFiles.length){alert("Choose at least one file.");return;}
  const category=$("libraryUploadCategory").value,description=$("libraryUploadDescription").value.trim();
  try{
    $("documentLibraryStatus").textContent="Uploading documents...";
    for(const file of pendingLibraryFiles){
      await cloudCall("uploadLibraryFile",{name:file.name,mimeType:file.type||"application/octet-stream",base64:await fileToBase64(file),category,description,rootFolder:getAdminSettings().rootFolder});
    }
    pendingLibraryFiles=[];$("libraryUploadDialog").close();await loadDocumentLibrary();
  }catch(error){alert(error.message);}
});
async function loadDocumentLibrary(){
  const box=$("documentLibraryList"),status=$("documentLibraryStatus");
  if(!box||!status)return;
  if(!cloudConfigured()){status.textContent="Connect Google Apps Script to use the document library.";box.innerHTML="";return;}
  status.textContent="Loading library...";
  try{
    const out=await cloudCall("listLibraryFiles",{rootFolder:getAdminSettings().rootFolder});
    window.documentLibraryFiles=out.files||[];
    status.textContent=`${window.documentLibraryFiles.length} documents in library`;
    renderDocumentLibrary();
  }catch(error){status.textContent=error.message;box.innerHTML="";}
}
function renderDocumentLibrary(){
  const box=$("documentLibraryList"),files=window.documentLibraryFiles||[];
  if(!box)return;
  const q=($("documentLibrarySearch")?.value||"").toLowerCase().trim(),category=$("documentLibraryCategory")?.value||"";
  const filtered=files.filter(f=>(!q||[f.name,f.category,f.description].join(" ").toLowerCase().includes(q))&&(!category||f.category===category));
  const stats=$("documentLibraryStats");
  if(stats){
    const categories=new Set(files.map(f=>f.category).filter(Boolean));
    stats.innerHTML=`<div><strong>${files.length}</strong><span>Total Documents</span></div><div><strong>${categories.size}</strong><span>Categories</span></div><div><strong>${files.filter(f=>f.category==="Rehab Budgets").length}</strong><span>Rehab Budgets</span></div><div><strong>${files.filter(f=>f.category==="Track Records").length}</strong><span>Track Records</span></div>`;
  }
  box.innerHTML=filtered.length?filtered.map(f=>`<div class="library-file-row">
    <div class="library-file-icon">▧</div>
    <div class="library-file-main"><strong>${esc(f.name)}</strong><small>${esc(f.category||"Other")} · ${fileSize(f.size||0)} · ${esc(f.modified||"")}</small>${f.description?`<small>${esc(f.description)}</small>`:""}</div>
    <div class="library-file-actions"><button onclick="window.open('${esc(f.url)}','_blank')">Open</button><button onclick="copyLibraryLink('${esc(f.url)}')">Copy Link</button><button onclick="deleteLibraryDocument('${f.id}')">Delete</button></div>
  </div>`).join(""):'<div class="empty-state">No reusable documents match this view.</div>';
}
window.copyLibraryLink=async url=>{await navigator.clipboard.writeText(url);alert("Document link copied.");};
window.deleteLibraryDocument=async id=>{
  if(!confirm("Delete this document from the library?"))return;
  try{await cloudCall("deleteLibraryFile",{fileId:id});await loadDocumentLibrary();}catch(error){alert(error.message);}
};
$("refreshDocumentLibraryBtn").onclick=loadDocumentLibrary;
$("documentLibrarySearch").oninput=renderDocumentLibrary;
$("documentLibraryCategory").onchange=renderDocumentLibrary;

const v53OldShowView=v5ShowView;
v5ShowView=function(name){
  if(name==="contacts"||name==="documents"){
    document.querySelectorAll(".app-view").forEach(view=>view.classList.remove("active-view"));
    document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));
    $(name==="contacts"?"contactsView":"documentsView").classList.add("active-view");
    document.querySelector(`[data-view="${name}"]`)?.classList.add("active");
    $("viewSubtitle").textContent=name==="contacts"?"CRM contact directory":"Reusable client document library";
    if(name==="contacts")renderContacts();else loadDocumentLibrary();
    return;
  }
  v53OldShowView(name);
};

renderContacts();


// ===== BearCrest Version 5.4: Mobile PWA + Shared Cloud Database =====
const MOBILE_SYNC_SETTINGS_KEY="bearcrest_mobile_sync_settings_v5_4";
let deferredInstallPrompt=null;
let mobileCloudSyncTimer=null;

function getMobileSyncSettings(){
  try{return {auto:"on",minutes:5,...JSON.parse(localStorage.getItem(MOBILE_SYNC_SETTINGS_KEY)||"{}")};}
  catch{return {auto:"on",minutes:5};}
}
function saveMobileSyncSettings(values){
  localStorage.setItem(MOBILE_SYNC_SETTINGS_KEY,JSON.stringify({...getMobileSyncSettings(),...values}));
}
function collectCRMDatabase(){
  const keys=[
    STORAGE_KEY,
    ADMIN_SETTINGS_KEY,
    LENDER_STORAGE_KEY,
    "bearcrest_tasks_v5_2",
    "bearcrest_calendar_events_v5_2",
    "bearcrest_contacts_v5_3",
    "bearcrest_sync_meta_v4_2"
  ];
  const data={version:"5.4",savedAt:new Date().toISOString(),storage:{}};
  keys.forEach(key=>data.storage[key]=localStorage.getItem(key));
  return data;
}
function applyCRMDatabase(database){
  if(!database||!database.storage)throw new Error("The cloud CRM database is not valid.");
  Object.entries(database.storage).forEach(([key,value])=>{
    if(value===null||value===undefined)localStorage.removeItem(key);
    else localStorage.setItem(key,value);
  });
}
async function uploadCRMDatabase(showMessage=true){
  if(!cloudConfigured())throw new Error("Connect Google Apps Script in Settings first.");
  const result=await cloudCall("saveCRMDatabase",{
    rootFolder:getAdminSettings().rootFolder,
    database:collectCRMDatabase()
  });
  const status=$("cloudDatabaseStatus");
  if(status)status.textContent=`Uploaded ${new Date().toLocaleString()}`;
  if(showMessage)alert("This device's CRM data was uploaded to Google Drive.");
  return result;
}
async function downloadCRMDatabase(showMessage=true){
  if(!cloudConfigured())throw new Error("Connect Google Apps Script in Settings first.");
  const result=await cloudCall("loadCRMDatabase",{rootFolder:getAdminSettings().rootFolder});
  if(!result.exists){
    if(showMessage)alert("No shared CRM database exists yet. Upload the desktop CRM first.");
    return false;
  }
  applyCRMDatabase(result.database);
  const status=$("cloudDatabaseStatus");
  if(status)status.textContent=`Downloaded ${new Date().toLocaleString()}`;
  if(showMessage)alert("Cloud CRM data downloaded. The app will reload now.");
  location.reload();
  return true;
}
function scheduleMobileCloudSync(){
  if(mobileCloudSyncTimer)clearInterval(mobileCloudSyncTimer);
  const settings=getMobileSyncSettings();
  if(settings.auto!=="on")return;
  const minutes=Math.max(2,Number(settings.minutes||5));
  mobileCloudSyncTimer=setInterval(()=>{
    if(cloudConfigured())uploadCRMDatabase(false).catch(console.warn);
  },minutes*60*1000);
}
function fillMobileSyncSettings(){
  const settings=getMobileSyncSettings();
  if($("adminAutoCloudSync"))$("adminAutoCloudSync").value=settings.auto;
  if($("adminCloudSyncMinutes"))$("adminCloudSyncMinutes").value=String(settings.minutes);
}
function saveMobileSettingsFromForm(){
  saveMobileSyncSettings({
    auto:$("adminAutoCloudSync")?.value||"on",
    minutes:Number($("adminCloudSyncMinutes")?.value||5)
  });
  scheduleMobileCloudSync();
}

window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  $("installAppBtn")?.classList.remove("hidden");
});
if($("installAppBtn"))$("installAppBtn").onclick=async()=>{
  if(!deferredInstallPrompt){
    alert("On Android, open the browser menu and choose 'Add to Home screen' or 'Install app'.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;
  $("installAppBtn").classList.add("hidden");
};

if($("mobileMenuBtn"))$("mobileMenuBtn").onclick=()=>{
  document.querySelector(".sidebar")?.classList.toggle("mobile-open");
  $("mobileNavBackdrop")?.classList.toggle("hidden");
};
if($("mobileNavBackdrop"))$("mobileNavBackdrop").onclick=()=>{
  document.querySelector(".sidebar")?.classList.remove("mobile-open");
  $("mobileNavBackdrop").classList.add("hidden");
};
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{
  if(window.innerWidth<=800){
    document.querySelector(".sidebar")?.classList.remove("mobile-open");
    $("mobileNavBackdrop")?.classList.add("hidden");
  }
}));
if($("mobileQuickAddBtn"))$("mobileQuickAddBtn").onclick=()=>openAdd();

if($("downloadCloudDataBtn"))$("downloadCloudDataBtn").onclick=()=>downloadCRMDatabase(true).catch(error=>alert(error.message));
if($("uploadCloudDataBtn"))$("uploadCloudDataBtn").onclick=()=>uploadCRMDatabase(true).catch(error=>alert(error.message));
if($("adminAutoCloudSync"))$("adminAutoCloudSync").onchange=saveMobileSettingsFromForm;
if($("adminCloudSyncMinutes"))$("adminCloudSyncMinutes").onchange=saveMobileSettingsFromForm;

const v54OldFillAdmin=fillAdminSettings;
fillAdminSettings=function(){
  v54OldFillAdmin();
  fillMobileSyncSettings();
};

const v54OldSave=save;
save=function(){
  v54OldSave();
  const settings=getMobileSyncSettings();
  if(settings.auto==="on"&&cloudConfigured())uploadCRMDatabase(false).catch(console.warn);
};

fillMobileSyncSettings();
scheduleMobileCloudSync();


// ===== BearCrest Version 6.0 Phone-First Mobile Companion =====
let v6PendingFieldAction="";
function v6IsMobile(){return window.matchMedia("(max-width:800px)").matches;}
function v6ActiveLoans(){return loans.filter(l=>!["Closed","Dead","Archived"].includes(l.status));}
function v6ShowView(name){
  if(name==="mobilehome"){
    document.querySelectorAll(".app-view").forEach(v=>v.classList.remove("active-view"));
    document.querySelectorAll(".nav-item").forEach(v=>v.classList.remove("active"));
    $("mobileHomeView")?.classList.add("active-view");
    v6RenderMobileHome();
  }else v5ShowView(name);
  document.querySelectorAll("[data-mobile-nav]").forEach(b=>b.classList.toggle("active",b.dataset.mobileNav===name));
  window.scrollTo({top:0,behavior:"smooth"});
}
function v6LoanSubtitle(l){return [l.program,l.status].filter(Boolean).join(" · ")||"Loan record";}
function v6DueLoans(){
  const today=new Date().toISOString().slice(0,10);
  return v6ActiveLoans().filter(l=>l.nextFollowUp&&l.nextFollowUp<=today).sort((a,b)=>String(a.nextFollowUp).localeCompare(String(b.nextFollowUp)));
}
function v6RenderMobileHome(){
  if(!$("mobileHomeView"))return;
  const now=new Date();
  $("mobileTodayLabel").textContent=now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
  const active=v6ActiveLoans(), due=v6DueLoans(), closing=loans.filter(l=>l.status==="Closing").length, approved=loans.filter(l=>l.status==="Approved").length;
  $("mobileMetricStrip").innerHTML=`
    <button onclick="v6ShowView('pipeline')"><strong>${active.length}</strong><span>Active</span></button>
    <button onclick="v6ShowView('tasks')"><strong>${due.length}</strong><span>Due</span></button>
    <button onclick="v6ShowView('pipeline')"><strong>${approved}</strong><span>Approved</span></button>
    <button onclick="v6ShowView('pipeline')"><strong>${closing}</strong><span>Closing</span></button>`;
  const attention=due.slice(0,5);
  $("mobileAttentionList").innerHTML=attention.length?attention.map(l=>`
    <button class="mobile-loan-row attention" onclick="editLoan('${l.loanId}')">
      <span class="mobile-status-icon">!</span><span class="mobile-loan-main"><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||"No property address")}</small></span>
      <span class="mobile-loan-side"><b>${esc(l.nextFollowUp||"Today")}</b><small>${esc(l.status||"")}</small></span>
    </button>`).join(""):'<div class="mobile-empty">You are caught up. Nothing overdue.</div>';
  const recent=[...loans].sort((a,b)=>String(b.dateReceived||"").localeCompare(String(a.dateReceived||""))).slice(0,6);
  $("mobileRecentList").innerHTML=recent.length?recent.map(l=>`
    <div class="mobile-loan-row">
      <button class="mobile-loan-open" onclick="editLoan('${l.loanId}')"><span class="mobile-loan-badge">${esc((l.borrowerName||"B").trim().charAt(0).toUpperCase())}</span><span class="mobile-loan-main"><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||"No property address")}</small><em>${esc(v6LoanSubtitle(l))}</em></span></button>
      <div class="mobile-inline-actions">${l.phone?`<a href="tel:${esc(l.phone)}" aria-label="Call">☎</a><a href="sms:${esc(l.phone)}" aria-label="Text">✉</a>`:""}${l.propertyAddress?`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.propertyAddress)}" target="_blank" aria-label="Map">⌖</a>`:""}</div>
    </div>`).join(""):'<div class="mobile-empty">No loans yet. Tap New Loan to begin.</div>';
}
function v6SearchLoans(query){
  const q=String(query||"").trim().toLowerCase();
  if(!q)return [];
  return loans.filter(l=>[l.borrowerName,l.propertyAddress,l.loanNumber,l.phone,l.email,l.program].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,8);
}
function v6RenderGlobalSearch(){
  const box=$("mobileSearchResults"), q=$("mobileGlobalSearch").value, results=v6SearchLoans(q);
  if(!q.trim()){box.classList.add("hidden");return;}
  box.innerHTML=results.length?results.map(l=>`<button onclick="editLoan('${l.loanId}');$('mobileSearchResults').classList.add('hidden')"><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||v6LoanSubtitle(l))}</small></button>`).join(""):'<div class="mobile-empty">No matching loans.</div>';
  box.classList.remove("hidden");
}
function v6OpenPicker(action,title){
  v6PendingFieldAction=action;$("mobilePickerTitle").textContent=title;$("mobilePickerSearch").value="";v6RenderPicker();$("mobileLoanPickerDialog").showModal();
}
function v6RenderPicker(){
  const q=$("mobilePickerSearch")?.value||"";
  const list=q.trim()?v6SearchLoans(q):v6ActiveLoans().slice(0,20);
  $("mobilePickerList").innerHTML=list.map(l=>`<button onclick="v6RunFieldAction('${l.loanId}')"><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||v6LoanSubtitle(l))}</small></button>`).join("")||'<div class="mobile-empty">No matching active loans.</div>';
}
function v6RunFieldAction(id){
  const l=loans.find(x=>x.loanId===id);if(!l)return;
  $("mobileLoanPickerDialog").close();
  if(v6PendingFieldAction==="call")return l.phone?location.href=`tel:${l.phone}`:alert("No phone number is saved for this borrower.");
  if(v6PendingFieldAction==="text")return l.phone?location.href=`sms:${l.phone}`:alert("No phone number is saved for this borrower.");
  if(v6PendingFieldAction==="map")return l.propertyAddress?window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.propertyAddress)}`,"_blank"):alert("No property address is saved.");
  editLoan(id);setTimeout(()=>$("notes")?.focus(),250);
}
function v6HandleCameraFile(file){
  if(!file)return;
  alert(`${file.name} is ready. Open the correct loan, then use its Documents section to upload it to Google Drive.`);
}

document.querySelectorAll("[data-mobile-nav]").forEach(b=>b.onclick=()=>v6ShowView(b.dataset.mobileNav));
document.querySelectorAll("[data-mobile-go]").forEach(b=>b.onclick=()=>v6ShowView(b.dataset.mobileGo));
if($("mobileBottomAdd"))$("mobileBottomAdd").onclick=()=>openAdd();
if($("mobileNewLoanAction"))$("mobileNewLoanAction").onclick=()=>openAdd();
if($("mobileSyncAction"))$("mobileSyncAction").onclick=()=>$("syncApplicationsBtn").click();
if($("mobileScanAction"))$("mobileScanAction").onclick=()=>$("mobileCameraInput").click();
if($("mobileContactsAction"))$("mobileContactsAction").onclick=()=>v6ShowView("contacts");
if($("mobileCameraInput"))$("mobileCameraInput").onchange=e=>v6HandleCameraFile(e.target.files?.[0]);
if($("mobileGlobalSearch"))$("mobileGlobalSearch").oninput=v6RenderGlobalSearch;
if($("mobileAvatarBtn"))$("mobileAvatarBtn").onclick=()=>$("cloudSetupBtn").click();
if($("fieldCallBtn"))$("fieldCallBtn").onclick=()=>v6OpenPicker("call","Call a borrower");
if($("fieldTextBtn"))$("fieldTextBtn").onclick=()=>v6OpenPicker("text","Text a borrower");
if($("fieldMapBtn"))$("fieldMapBtn").onclick=()=>v6OpenPicker("map","Open property directions");
if($("fieldNoteBtn"))$("fieldNoteBtn").onclick=()=>v6OpenPicker("note","Add a quick note");
if($("closeMobilePicker"))$("closeMobilePicker").onclick=()=>$("mobileLoanPickerDialog").close();
if($("mobilePickerSearch"))$("mobilePickerSearch").oninput=v6RenderPicker;

const v6OldRender=render;
render=function(){v6OldRender();v6RenderMobileHome();};
window.addEventListener("resize",()=>{if(v6IsMobile()&&!document.querySelector(".app-view.active-view"))v6ShowView("mobilehome");});
setTimeout(()=>{if(v6IsMobile())v6ShowView("mobilehome");else v5ShowView("dashboard");},0);
