
const CONFIG = {
  SPREADSHEET_ID: 'PASTE_GOOGLE_SHEET_ID_HERE',
  ROOT_DRIVE_FOLDER_ID: 'PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE',
  LOANS_SHEET: 'Loans',
  APPLICATIONS_SHEET: 'Applications',
  ACTIVITY_SHEET: 'Activity Log',
  SETTINGS_SHEET: 'Settings',
  LENDERS_SHEET: 'Lenders'
};

const LOAN_HEADERS = [
  'recordId','loanNumber','dateReceived','borrowerName','entityName','phone','email',
  'program','propertyAddress','loanAmount','purchasePrice','rehabBudget','arv','status',
  'lender','nextFollowUp','targetClosing','missingDocs','notes','driveFolderId',
  'createdAt','updatedAt'
];

function doGet() {
  return json_({ok:true,data:{message:'BearCrest CRM V8 backend is live'}});
}

function doPost(e) {
  try {
    const req = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = req.action;
    const payload = req.payload || {};
    let data;
    switch (action) {
      case 'getAll': data = getAll_(); break;
      case 'getNextLoanNumber': data = getNextLoanNumber_(); break;
      case 'saveLoan': data = saveLoan_(payload.loan || {}, payload.applicationId || ''); break;
      case 'deleteLoan': data = deleteLoan_(payload.recordId); break;
      case 'syncApplications': data = syncApplications_(); break;
      case 'getDocuments': data = getDocuments_(payload.recordId); break;
      case 'uploadDocument': data = uploadDocument_(payload); break;
      case 'deleteDocument': data = deleteDocument_(payload.fileId); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return json_({ok:true,data});
  } catch (err) {
    return json_({ok:false,error:String(err.message || err)});
  }
}

function setupBearCrestCRM() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ensureSheet_(ss, CONFIG.LOANS_SHEET, LOAN_HEADERS);
  ensureSheet_(ss, CONFIG.ACTIVITY_SHEET, ['timestamp','action','recordId','loanNumber','details']);
  ensureSheet_(ss, CONFIG.SETTINGS_SHEET, ['key','value']);
  ensureSheet_(ss, CONFIG.LENDERS_SHEET, ['Lender Name','Active']);
  const settings = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (settings.getLastRow() < 2) {
    settings.getRange(2,1,3,2).setValues([
      ['loanPrefix','BCF'],
      ['nextLoanNumber','1001'],
      ['lastBackupDate','']
    ]);
  }
  const lendersSheet = ss.getSheetByName(CONFIG.LENDERS_SHEET);
  if (lendersSheet.getLastRow() < 2) {
    lendersSheet.getRange(2,1,22,2).setValues([
      ['Unitas Funding','Yes'],['Visio Lending','Yes'],['Kiavi','Yes'],['Congo Capital','Yes'],
      ['Easy Street Capital','Yes'],['Rock Capital','Yes'],['RCN Capital','Yes'],['Lima One Capital','Yes'],
      ['New Silver','Yes'],['Quickline Capital','Yes'],['Ternus Lending','Yes'],['Tidal Loans','Yes'],
      ['IceCap Group','Yes'],['Groundfloor','Yes'],['ABL Funding','Yes'],['EquityMax','Yes'],
      ['Anchor Loans','Yes'],['Velocity Mortgage Capital','Yes'],['Deephaven Mortgage','Yes'],
      ['Constructive Capital','Yes'],['ROC360','Yes'],['First Equity Funding','Yes']
    ]);
  }
  if (!ss.getSheetByName(CONFIG.APPLICATIONS_SHEET)) {
    ensureSheet_(ss, CONFIG.APPLICATIONS_SHEET, [
      'Timestamp','Borrower Name','Phone','Email','Property Address','Loan Program Requested',
      'Estimated Loan Amount Requested','Purchase Price','Estimated Rehab Budget',
      'Estimated ARV','Entity','Notes','Imported','Application ID'
    ]);
  } else {
    ensureApplicationTrackingColumns_();
  }
  return 'BearCrest CRM V8 setup complete.';
}

function getAll_() {
  ensureReady_();
  return {
    loans: readObjects_(CONFIG.LOANS_SHEET),
    applications: getUnimportedApplications_(),
    lenders: getLenders_()
  };
}


function getLenders_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.LENDERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getDataRange().getDisplayValues();
  const headers = data[0].map(String);
  const nameIdx = headers.indexOf('Lender Name');
  const activeIdx = headers.indexOf('Active');
  const out = [];
  for (let i=1;i<data.length;i++) {
    const name = nameIdx >= 0 ? String(data[i][nameIdx]).trim() : '';
    const active = activeIdx >= 0 ? String(data[i][activeIdx]).trim().toLowerCase() : 'yes';
    if (name && !['no','false','inactive'].includes(active)) out.push({name:name});
  }
  return out;
}

function getNextLoanNumber_() {
  ensureReady_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const settings = getSettings_();
    const prefix = settings.loanPrefix || 'BCF';
    const next = Number(settings.nextLoanNumber || 1001);
    setSetting_('nextLoanNumber', String(next + 1));
    return prefix + '-' + next;
  } finally {
    lock.releaseLock();
  }
}

function saveLoan_(loan, applicationId) {
  ensureReady_();
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.LOANS_SHEET);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const now = new Date().toISOString();
  if (!loan.recordId) loan.recordId = Utilities.getUuid();
  let rowIndex = -1;
  for (let i=1;i<values.length;i++) if (String(values[i][0]) === String(loan.recordId)) rowIndex = i + 1;
  let existing = {};
  if (rowIndex > 0) existing = rowToObject_(headers, values[rowIndex-1]);
  const folderId = existing.driveFolderId || createLoanFolder_(loan);
  const record = {};
  LOAN_HEADERS.forEach(h => record[h] = loan[h] !== undefined ? loan[h] : (existing[h] || ''));
  record.driveFolderId = folderId;
  record.createdAt = existing.createdAt || now;
  record.updatedAt = now;
  const row = LOAN_HEADERS.map(h=>record[h]);
  if (rowIndex > 0) sh.getRange(rowIndex,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
  if (applicationId) markApplicationImported_(applicationId);
  log_('SAVE', record.recordId, record.loanNumber, record.borrowerName + ' | ' + record.status);
  return record;
}

function deleteLoan_(recordId) {
  ensureReady_();
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.LOANS_SHEET);
  const values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (String(values[i][0]) === String(recordId)) {
      const loanNumber = values[i][1];
      sh.deleteRow(i+1);
      log_('DELETE', recordId, loanNumber, 'Loan deleted');
      return true;
    }
  }
  return false;
}

function syncApplications_() {
  ensureApplicationTrackingColumns_();
  return {unimported:getUnimportedApplications_().length};
}

function getUnimportedApplications_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.APPLICATIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getDataRange().getDisplayValues();
  const headers = data[0].map(x=>String(x).trim());
  const idx = name => headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());
  const importedIdx = idx('Imported');
  const appIdIdx = idx('Application ID');
  const pick = (row,names) => {
    for (const n of names) {
      const i=idx(n);
      if(i>=0 && row[i] !== '') return row[i];
    }
    return '';
  };
  const out=[];
  for(let r=1;r<data.length;r++){
    const row=data[r];
    if(importedIdx>=0 && String(row[importedIdx]).toLowerCase()==='yes') continue;
    let applicationId=appIdIdx>=0?row[appIdIdx]:'';
    if(!applicationId){
      applicationId=Utilities.getUuid();
      if(appIdIdx>=0) sh.getRange(r+1,appIdIdx+1).setValue(applicationId);
    }
    out.push({
      applicationId,
      dateReceived: pick(row,['Timestamp']),
      borrowerName: pick(row,['Borrower Name','Name']),
      phone: pick(row,['Phone','Phone Number']),
      email: pick(row,['Email']),
      propertyAddress: pick(row,['Property Address']),
      program: pick(row,['Loan Program Requested','Program']),
      loanAmount: pick(row,['Estimated Loan Amount Requested','Loan Amount']),
      purchasePrice: pick(row,['Purchase Price']),
      rehabBudget: pick(row,['Estimated Rehab Budget','Rehab Budget']),
      arv: pick(row,['Estimated ARV','ARV']),
      entityName: pick(row,['Entity','Entity Name','Do You Have an Entity?']),
      notes: pick(row,['Notes','Anything Else','Project Description'])
    });
  }
  return out.reverse();
}

function markApplicationImported_(applicationId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.APPLICATIONS_SHEET);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  const importedIdx = headers.indexOf('Imported');
  const idIdx = headers.indexOf('Application ID');
  for(let r=1;r<data.length;r++){
    if(String(data[r][idIdx])===String(applicationId)){
      sh.getRange(r+1,importedIdx+1).setValue('Yes');
      return;
    }
  }
}

function uploadDocument_(p) {
  if (!p.recordId || !p.base64 || !p.fileName) throw new Error('Missing upload information.');
  const loan = readObjects_(CONFIG.LOANS_SHEET).find(x=>String(x.recordId)===String(p.recordId));
  if (!loan) throw new Error('Loan not found.');
  const folder = DriveApp.getFolderById(loan.driveFolderId || createLoanFolder_(loan));
  const bytes = Utilities.base64Decode(p.base64);
  const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.fileName);
  const file = folder.createFile(blob);
  log_('UPLOAD', loan.recordId, loan.loanNumber, p.fileName);
  return {fileId:file.getId(),name:file.getName(),url:file.getUrl()};
}

function getDocuments_(recordId) {
  const loan = readObjects_(CONFIG.LOANS_SHEET).find(x=>String(x.recordId)===String(recordId));
  if (!loan || !loan.driveFolderId) return [];
  const folder = DriveApp.getFolderById(loan.driveFolderId);
  const files = folder.getFiles();
  const out=[];
  while(files.hasNext()){
    const f=files.next();
    out.push({fileId:f.getId(),name:f.getName(),url:f.getUrl(),mimeType:f.getMimeType()});
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
}

function deleteDocument_(fileId) {
  if (!fileId) return false;
  DriveApp.getFileById(fileId).setTrashed(true);
  return true;
}

function createLoanFolder_(loan) {
  const root = DriveApp.getFolderById(CONFIG.ROOT_DRIVE_FOLDER_ID);
  const safe = [loan.loanNumber, loan.borrowerName, loan.propertyAddress].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|#%]/g,' ');
  const folder = root.createFolder(safe || ('Loan ' + new Date().getTime()));
  return folder.getId();
}

function ensureReady_() {
  if (CONFIG.SPREADSHEET_ID.indexOf('PASTE_')===0 || CONFIG.ROOT_DRIVE_FOLDER_ID.indexOf('PASTE_')===0) {
    throw new Error('Add your Google Sheet ID and Drive folder ID in CONFIG, then run setupBearCrestCRM().');
  }
}

function ensureApplicationTrackingColumns_() {
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh=ss.getSheetByName(CONFIG.APPLICATIONS_SHEET);
  if(!sh) return;
  const last=Math.max(sh.getLastColumn(),1);
  const headers=sh.getRange(1,1,1,last).getValues()[0].map(String);
  if(!headers.includes('Imported')) sh.getRange(1,sh.getLastColumn()+1).setValue('Imported');
  const updated=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  if(!updated.includes('Application ID')) sh.getRange(1,sh.getLastColumn()+1).setValue('Application ID');
}

function ensureSheet_(ss,name,headers) {
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  else {
    const existing=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0].map(String);
    headers.forEach(h=>{if(!existing.includes(h)){sh.getRange(1,sh.getLastColumn()+1).setValue(h);existing.push(h)}});
  }
  sh.setFrozenRows(1);
  return sh;
}

function readObjects_(sheetName) {
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh=ss.getSheetByName(sheetName);
  if(!sh || sh.getLastRow()<2) return [];
  const values=sh.getDataRange().getDisplayValues();
  const headers=values[0].map(String);
  return values.slice(1).filter(r=>r.some(v=>v!=='')).map(r=>rowToObject_(headers,r));
}

function rowToObject_(headers,row) {
  const o={};headers.forEach((h,i)=>o[h]=row[i]===undefined?'':row[i]);return o;
}

function getSettings_() {
  const rows=readObjects_(CONFIG.SETTINGS_SHEET);
  const out={};rows.forEach(r=>out[r.key]=r.value);return out;
}

function setSetting_(key,value) {
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh=ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++){
    if(String(values[i][0])===String(key)){sh.getRange(i+1,2).setValue(value);return}
  }
  sh.appendRow([key,value]);
}

function log_(action,recordId,loanNumber,details) {
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ss.getSheetByName(CONFIG.ACTIVITY_SHEET).appendRow([new Date(),action,recordId,loanNumber,details]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
