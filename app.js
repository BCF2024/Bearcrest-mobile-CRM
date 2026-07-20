
const $=id=>document.getElementById(id);
const CFG_KEY="bearcrest_v8_config";
let config=JSON.parse(localStorage.getItem(CFG_KEY)||'{"webAppUrl":""}');
let loans=[], applications=[], lenders=[], currentDocuments=[];
const FALLBACK_LENDERS=["ABL Funding","Anchor Loans","Congo Capital","Constructive Capital","Deephaven Mortgage","Easy Street Capital","EquityMax","First Equity Funding","Groundfloor","IceCap Group","Kiavi","Lima One Capital","New Silver","Quickline Capital","RCN Capital","ROC360","Rock Capital","Ternus Lending","Tidal Loans","Unitas Funding","Velocity Mortgage Capital","Visio Lending"];
const today=()=>new Date().toISOString().slice(0,10);
const money=v=>v?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v)):"";
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fields=["recordId","loanNumber","dateReceived","borrowerName","entityName","phone","email","program","propertyAddress","loanAmount","purchasePrice","rehabBudget","arv","status","lender","nextFollowUp","targetClosing","missingDocs","notes"];

function setSync(text,good=false){$("syncStatus").textContent=text;$("syncStatus").style.color=good?"#c9f2dc":"#f4dfad"}
function renderLenderOptions(selected=""){
 const select=$("lender");
 if(!select) return;
 const current=selected || select.value || "";
 const live=(lenders||[]).map(x=>typeof x==="string"?x:(x.name||x.lenderName||"")).filter(Boolean);
 const names=[...new Set([...FALLBACK_LENDERS,...live])].sort((a,b)=>a.localeCompare(b));
 select.innerHTML='<option value="">Select a lender…</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")+'<option value="__OTHER__">Other / Add New</option>';
 if(current && names.includes(current)) select.value=current;
 else if(current){
   const opt=document.createElement("option");opt.value=current;opt.textContent=current;select.insertBefore(opt,select.lastElementChild);select.value=current;
 }
}

function requireUrl(){if(!config.webAppUrl){openSettings();throw new Error("Connection required")}}
async function api(action,payload={}){
  requireUrl(); setSync("Syncing…");
  const res=await fetch(config.webAppUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload})});
  if(!res.ok) throw new Error("Connection failed");
  const data=await res.json();
  if(!data.ok) throw new Error(data.error||"Request failed");
  setSync("Google connected",true);
  return data.data;
}
function setView(name){
 document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===name+"View"));
 document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));

async function loadAll(){
 try{
  const data=await api("getAll");
  loans=data.loans||[]; applications=data.applications||[]; lenders=(data.lenders&&data.lenders.length)?data.lenders:FALLBACK_LENDERS.map(name=>({name}));
  renderLenderOptions();
  renderAll();
 }catch(e){lenders=FALLBACK_LENDERS.map(name=>({name}));renderLenderOptions();renderAll();setSync("Offline lender list loaded"); if(config.webAppUrl) alert(e.message)}
}
const overdue=l=>l.nextFollowUp&&l.nextFollowUp<today()&&!["Closed","Dead"].includes(l.status);
const due=l=>l.nextFollowUp&&l.nextFollowUp<=today()&&!["Closed","Dead"].includes(l.status);

function renderStats(){
 const active=loans.filter(l=>!["Closed","Dead"].includes(l.status)).length;
 const follow=loans.filter(due).length;
 const approved=loans.filter(l=>l.status==="Approved").length;
 const closing=loans.filter(l=>l.status==="Closing").length;
 const closed=loans.filter(l=>l.status==="Closed").length;
 const volume=loans.filter(l=>l.status!=="Dead").reduce((a,l)=>a+Number(l.loanAmount||0),0);
 $("stats").innerHTML=[[active,"Active Loans"],[follow,"Follow-Ups Due"],[approved,"Approved"],[closing,"Closing"],[closed,"Closed"],[money(volume),"Loan Volume"]].map(x=>`<div class="stat"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join("");
}
function quickItem(l){return `<div class="listitem"><div><strong>${esc(l.borrowerName||l.loanNumber)}</strong><small>${esc(l.propertyAddress||l.program)} · ${esc(l.status)}</small></div><button onclick="openLoan('${l.recordId}')">Open</button></div>`}
function renderHome(){
 $("todayList").innerHTML=loans.filter(due).slice(0,6).map(quickItem).join("")||'<p class="notice">Nothing due today.</p>';
 $("recentList").innerHTML=[...loans].sort((a,b)=>(b.dateReceived||"").localeCompare(a.dateReceived||"")).slice(0,6).map(quickItem).join("")||'<p class="notice">No loans yet.</p>';
}
function filtered(){
 const q=$("searchInput").value.toLowerCase().trim(),s=$("statusFilter").value;
 return loans.filter(l=>(!s||l.status===s)&&(!q||Object.values(l).join(" ").toLowerCase().includes(q)));
}
function actions(l){
 const phone=(l.phone||"").replace(/[^\d+]/g,""),addr=encodeURIComponent(l.propertyAddress||"");
 return `<div class="loan-card-actions"><a href="tel:${phone}">Call</a><a href="sms:${phone}">Text</a><a href="https://maps.google.com/?q=${addr}" target="_blank">Map</a><button onclick="openLoan('${l.recordId}')">Open</button></div>`;
}
function renderPipeline(){
 const list=filtered();
 $("loanRows").innerHTML=list.map(l=>`<tr><td>${esc(l.loanNumber)}</td><td><strong>${esc(l.borrowerName)}</strong><br><small>${esc(l.phone||"")}</small></td><td>${esc(l.program)}</td><td>${esc(l.propertyAddress)}</td><td><span class="badge">${esc(l.status)}</span></td><td>${money(l.loanAmount)}</td><td class="${overdue(l)?"overdue":""}">${esc(l.nextFollowUp||"")}</td><td><button onclick="openLoan('${l.recordId}')">Open</button></td></tr>`).join("")||'<tr><td colspan="8">No matching loans.</td></tr>';
 $("mobileCards").innerHTML=list.map(l=>`<article class="loan-card"><div class="loan-card-top"><div><h3>${esc(l.borrowerName||l.loanNumber)}</h3><p>${esc(l.loanNumber)} · ${esc(l.program)}</p></div><span class="badge">${esc(l.status)}</span></div><p>${esc(l.propertyAddress||"No property address")}</p><p><strong>${money(l.loanAmount)}</strong> · Follow-up: <span class="${overdue(l)?"overdue":""}">${esc(l.nextFollowUp||"Not set")}</span></p>${actions(l)}</article>`).join("");
}
function renderApplications(){
 $("applicationList").innerHTML=applications.map(a=>`<article><h3>${esc(a.borrowerName||"Unnamed applicant")}</h3><p>${esc(a.propertyAddress||"No property address")}</p><p>${esc(a.program||"")} · ${esc(a.phone||"")} · ${esc(a.email||"")}</p><button onclick="importApplication('${a.applicationId}')">Create Loan</button></article>`).join("")||'<p class="notice">No unimported applications.</p>';
}
function renderFollowups(){
 const list=loans.filter(l=>!["Closed","Dead"].includes(l.status)).sort((a,b)=>(a.nextFollowUp||"9999").localeCompare(b.nextFollowUp||"9999"));
 $("followupList").innerHTML=list.map(l=>`<article><h3>${esc(l.borrowerName||l.loanNumber)}</h3><p>${esc(l.propertyAddress||l.program)}</p><p class="${overdue(l)?"overdue":""}">Next follow-up: ${esc(l.nextFollowUp||"Not scheduled")}</p><button onclick="openLoan('${l.recordId}')">Open Loan</button></article>`).join("");
}
function renderContacts(){
 $("contactList").innerHTML=loans.filter(l=>l.borrowerName).sort((a,b)=>a.borrowerName.localeCompare(b.borrowerName)).map(l=>`<article><h3>${esc(l.borrowerName)}</h3><p>${esc(l.phone||"No phone")} · ${esc(l.email||"No email")}</p><p>${esc(l.entityName||l.propertyAddress||"")}</p>${actions(l)}</article>`).join("");
}
function renderAll(){renderStats();renderHome();renderPipeline();renderApplications();renderFollowups();renderContacts()}
function updateLinks(l){
 const p=(l.phone||"").replace(/[^\d+]/g,"");$("callLink").href=`tel:${p}`;$("textLink").href=`sms:${p}`;$("emailLink").href=`mailto:${l.email||""}`;$("mapLink").href=`https://maps.google.com/?q=${encodeURIComponent(l.propertyAddress||"")}`;
}
function renderDocuments(){
 $("documentList").innerHTML=currentDocuments.map(d=>`<div class="doc"><a href="${esc(d.url)}" target="_blank">${esc(d.name)}</a><button type="button" onclick="deleteDocument('${esc(d.fileId)}')">Remove</button></div>`).join("")||"<p>No documents uploaded yet.</p>";
}
async function openNew(prefill={}){
 loanSaveInProgress=false;
 if($("saveLoanBtn")){$("saveLoanBtn").disabled=false;$("saveLoanBtn").textContent="Save Loan";}
 $("loanForm").reset();renderLenderOptions();$("recordId").value="";$("dialogTitle").textContent="New Loan";$("dateReceived").value=today();$("program").value=prefill.program||"Fix & Flip";$("status").value="New Lead";
 Object.entries(prefill).forEach(([k,v])=>$(k)&&($(k).value=v||""));
 $("loanNumber").value=prefill.loanNumber||await api("getNextLoanNumber");
 $("deleteBtn").style.visibility="hidden";currentDocuments=[];renderDocuments();updateLinks(prefill);$("loanDialog").showModal();
}
window.openLoan=async id=>{
 loanSaveInProgress=false;
 if($("saveLoanBtn")){$("saveLoanBtn").disabled=false;$("saveLoanBtn").textContent="Save Loan";}
 const l=loans.find(x=>x.recordId===id);if(!l)return;
 renderLenderOptions(l.lender||"");
 fields.forEach(f=>$(f).value=l[f]||"");$("dialogTitle").textContent=l.loanNumber||"Loan";$("deleteBtn").style.visibility="visible";updateLinks(l);
 currentDocuments=await api("getDocuments",{recordId:id});renderDocuments();$("loanDialog").showModal();
}
window.importApplication=async id=>{
 const a=applications.find(x=>x.applicationId===id); if(!a)return;
 await openNew({...a,recordId:"",loanNumber:"",status:"New Lead"});
 $("notes").value=(a.notes||"")+(a.applicationId?`\nImported from application ${a.applicationId}`:"");
 $("loanDialog").dataset.applicationId=id;
}
window.deleteDocument=async fileId=>{
 if(!confirm("Remove this document?"))return;
 await api("deleteDocument",{fileId}); currentDocuments=currentDocuments.filter(d=>d.fileId!==fileId);renderDocuments();
}
let loanSaveInProgress=false;
$("loanForm").onsubmit=async e=>{
 e.preventDefault();
 if(loanSaveInProgress) return;
 loanSaveInProgress=true;
 const saveBtn=$("saveLoanBtn");
 const originalText=saveBtn.textContent;
 saveBtn.disabled=true;
 saveBtn.textContent="Saving…";
 const data={};fields.forEach(f=>data[f]=$(f).value);
 const applicationId=$("loanDialog").dataset.applicationId||"";
 try{
  const saved=await api("saveLoan",{loan:data,applicationId});
  $("recordId").value=saved.recordId||$("recordId").value;
  delete $("loanDialog").dataset.applicationId;
  $("loanDialog").close();
  await loadAll();
 }catch(err){
  alert(err.message);
 }finally{
  loanSaveInProgress=false;
  saveBtn.disabled=false;
  saveBtn.textContent=originalText;
 }
}
$("deleteBtn").onclick=async()=>{const id=$("recordId").value;if(id&&confirm("Delete this loan?")){await api("deleteLoan",{recordId:id});$("loanDialog").close();await loadAll()}}
$("closeDialog").onclick=$("cancelBtn").onclick=()=>{$("loanDialog").close();delete $("loanDialog").dataset.applicationId}
["newLoanBtn","newLoanHero","mobileAdd"].forEach(id=>$(id).onclick=()=>openNew());
$("searchInput").oninput=renderPipeline;$("statusFilter").onchange=renderPipeline;
$("refreshBtn").onclick=loadAll;$("syncAppsBtn").onclick=async()=>{await api("syncApplications");await loadAll()};
$("documentInput").onchange=async e=>{
 const recordId=$("recordId").value;
 if(!recordId){alert("Save the loan first, then upload documents.");e.target.value="";return}
 for(const file of e.target.files){
   const data=await file.arrayBuffer();
   const bytes=Array.from(new Uint8Array(data));
   const base64=btoa(bytes.map(b=>String.fromCharCode(b)).join(""));
   await api("uploadDocument",{recordId,fileName:file.name,mimeType:file.type||"application/octet-stream",base64});
 }
 e.target.value="";currentDocuments=await api("getDocuments",{recordId});renderDocuments();
}
function openSettings(){$("webAppUrl").value=config.webAppUrl||"";renderLenderManager();$("settingsDialog").showModal()}
$("settingsBtn").onclick=openSettings;
$("settingsForm").onsubmit=e=>{e.preventDefault();config.webAppUrl=$("webAppUrl").value.trim();localStorage.setItem(CFG_KEY,JSON.stringify(config));$("settingsDialog").close();loadAll()}
$("closeSettings").onclick=$("closeSettings2").onclick=()=>$("settingsDialog").close();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js");
lenders=FALLBACK_LENDERS.map(name=>({name}));
renderLenderOptions();
renderAll();
if(config.webAppUrl)loadAll();else{setSync("Connection needed");setTimeout(openSettings,300)}

$("lender").onchange=async()=>{
 if($("lender").value==="__OTHER__"){
   const name=prompt("Enter the lender name:");
   if(name && name.trim()){
     const saved=await addManagedLender(name.trim());
     if(saved) renderLenderOptions(name.trim()); else $("lender").value="";
   }else{
     $("lender").value="";
   }
 }
};

function lenderNames(){
 return [...new Set((lenders||[]).map(x=>typeof x==="string"?x:(x.name||x.lenderName||"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
function renderLenderManager(){
 const box=$("lenderManagerList");
 if(!box) return;
 const names=lenderNames();
 box.innerHTML=names.map(name=>`<div class="manager-item"><strong>${esc(name)}</strong><button type="button" class="rename-lender" data-name="${esc(name)}">Rename</button><button type="button" class="remove-lender" data-name="${esc(name)}">Remove</button></div>`).join("")||'<div class="manager-empty">No lenders are available.</div>';
 box.querySelectorAll(".rename-lender").forEach(btn=>btn.onclick=()=>renameManagedLender(btn.dataset.name));
 box.querySelectorAll(".remove-lender").forEach(btn=>btn.onclick=()=>removeManagedLender(btn.dataset.name));
}
async function addManagedLender(name){
 name=String(name||"").trim();
 if(!name){alert("Enter a lender name.");return false}
 try{
  await api("addLender",{name});
  await loadAll();
  renderLenderManager();
  return true;
 }catch(err){alert(err.message);return false}
}
async function renameManagedLender(oldName){
 const newName=prompt("Rename lender:",oldName);
 if(newName===null||!newName.trim()||newName.trim()===oldName) return;
 try{await api("renameLender",{oldName,newName:newName.trim()});await loadAll();renderLenderManager()}catch(err){alert(err.message)}
}
async function removeManagedLender(name){
 if(!confirm(`Remove ${name} from future lender lists? Existing loan records will keep the lender name.`)) return;
 try{await api("deleteLender",{name});await loadAll();renderLenderManager()}catch(err){alert(err.message)}
}
if($("addLenderBtn")) $("addLenderBtn").onclick=async()=>{
 const input=$("newLenderName");
 if(await addManagedLender(input.value)) input.value="";
};
if($("newLenderName")) $("newLenderName").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("addLenderBtn").click()}};
