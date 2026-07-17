const AUTH_KEY="bearcrest_auth_v4_1_clean";
const SESSION_KEY="bearcrest_session_v4_1_clean";

function authDefaults(){
  return {username:"admin",password:"BearCrest2026!",mustChange:true,timeoutMinutes:60};
}
function getAuth(){
  try{return {...authDefaults(),...JSON.parse(localStorage.getItem(AUTH_KEY)||"{}")};}
  catch{return authDefaults();}
}
function saveAuth(value){localStorage.setItem(AUTH_KEY,JSON.stringify({...getAuth(),...value}));}
function sessionValid(){
  try{const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");return !!s&&Date.now()<s.expiresAt;}
  catch{return false;}
}
function startSession(){
  const a=getAuth();
  sessionStorage.setItem(SESSION_KEY,JSON.stringify({expiresAt:Date.now()+Number(a.timeoutMinutes||60)*60000}));
}
function unlock(){
  document.body.classList.remove("auth-locked");
  document.getElementById("loginScreen")?.classList.add("hidden");
}
function lock(){
  document.body.classList.add("auth-locked");
  document.getElementById("loginScreen")?.classList.remove("hidden");
}
function validPassword(v){return String(v||"").length>=10;}

document.addEventListener("DOMContentLoaded",()=>{
  const loginForm=document.getElementById("loginForm");
  const loginError=document.getElementById("loginError");
  const username=document.getElementById("loginUsername");
  const password=document.getElementById("loginPassword");
  const toggle=document.getElementById("togglePasswordBtn");
  const logout=document.getElementById("logoutBtn");
  const changeForm=document.getElementById("passwordChangeForm");

  if(sessionValid())unlock();
  else{lock();if(username)username.value=getAuth().username;}

  if(toggle)toggle.onclick=()=>{
    const visible=password.type==="text";
    password.type=visible?"password":"text";
    toggle.textContent=visible?"Show":"Hide";
  };

  if(loginForm)loginForm.addEventListener("submit",e=>{
    e.preventDefault();
    const a=getAuth();
    if(username.value.trim()!==a.username||password.value!==a.password){
      loginError.textContent="The username or password is incorrect.";
      return;
    }
    loginError.textContent="";
    startSession();
    unlock();
    password.value="";
    if(a.mustChange){
      const d=document.getElementById("passwordChangeDialog");
      if(d&&!d.open)d.showModal();
    }
  });

  if(changeForm)changeForm.addEventListener("submit",e=>{
    e.preventDefault();
    const p1=document.getElementById("firstNewPassword").value;
    const p2=document.getElementById("firstConfirmPassword").value;
    const error=document.getElementById("passwordChangeError");
    if(!validPassword(p1)){error.textContent="Use at least 10 characters.";return;}
    if(p1!==p2){error.textContent="The passwords do not match.";return;}
    saveAuth({password:p1,mustChange:false});
    error.textContent="";
    document.getElementById("passwordChangeDialog").close();
    alert("Your new password has been saved.");
  });

  if(logout)logout.onclick=()=>{
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  };

  document.getElementById("cloudSetupBtn")?.addEventListener("click",()=>{
    const a=getAuth();
    const u=document.getElementById("adminLoginUsername");
    const t=document.getElementById("adminSessionTimeout");
    if(u)u.value=a.username;
    if(t)t.value=String(a.timeoutMinutes||60);
  });

  document.getElementById("cloudSetupForm")?.addEventListener("submit",()=>{
    const a=getAuth();
    const u=document.getElementById("adminLoginUsername")?.value.trim()||a.username;
    const timeout=Number(document.getElementById("adminSessionTimeout")?.value||60);
    const p1=document.getElementById("adminNewPassword")?.value||"";
    const p2=document.getElementById("adminConfirmPassword")?.value||"";
    if(p1||p2){
      if(!validPassword(p1)){alert("The new password must contain at least 10 characters.");return;}
      if(p1!==p2){alert("The new passwords do not match.");return;}
      saveAuth({username:u,password:p1,mustChange:false,timeoutMinutes:timeout});
    }else saveAuth({username:u,timeoutMinutes:timeout});
  },true);
});
