// adrian-postcall — Retell call_analyzed → GHL (Pitman Seller Pipeline) enrichment.
// Forwards to Sympana, then: moves opp to disposition stage, names/values/assigns the opp,
// writes AI custom fields, and drops a clean per-line note + transcript. Reads GHL_PIT/GHL_PID env.
// Also auto-resolves the Dispatch AI property lead when Adrian confirms the right-party owner.

const B="https://services.leadconnectorhq.com", V="2021-07-28";
const LOC=Deno.env.get("GHL_LOCATION_ID")||"0EGiH3UWUq06uTO3U90A";
const PIPE=Deno.env.get("PITMAN_PIPELINE_NAME")||"Pitman Seller Pipeline";
const SYMPANA=Deno.env.get("SYMPANA_FORWARD_URL")||"https://api.sympana.ai/api/webhooks/retell";
const OWNER=Deno.env.get("ADRIAN_OWNER_ID")||"1BSYZsXSANXR3xFzOwrJ";
const FOLLOWERS=(Deno.env.get("ADRIAN_FOLLOWER_IDS")||"DdyJJ9lwpjL47bia4RHU,gFvDj6FfwoKvnfwQPMrs").split(",");
const F={disp:"ae7WIplrgQCUTX45meek",sent:"d28uIlmY401hhRdyaPOH",summ:"RQ9HU5tHQ9flD42KbrHW",rec:"y9GqcoUL730ceoECSLrg",
        dursec:"cTgj5oJ60aXYPzoaJm4C",tr:"PR1KZikXEcokhvrjuquU",dur:"T3QQrOpxZEpmKMEa0CwF",dt:"xFvlyShRI56CFOD0Giqc"};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type"};
const H=()=>{const p=Deno.env.get("GHL_PIT")||Deno.env.get("GHL_PID");if(!p)throw new Error("no GHL_PIT/GHL_PID");
  return{Authorization:`Bearer ${p}`,Version:V,"Content-Type":"application/json",Accept:"application/json"};};
async function ghl(path:string,init:RequestInit={}){const r=await fetch(B+path,{...init,headers:{...H(),...(init.headers||{})}});
  const t=await r.text();let j:any=null;try{j=t?JSON.parse(t):null;}catch{j=t;}
  if(!r.ok)console.warn("ghl",r.status,path,(typeof j==="string"?j:JSON.stringify(j)).slice(0,200));return{ok:r.ok,json:j};}

type D={key:string;stage:string;tag:string;days:number|null;label?:string};
const DI:Record<string,D>={
 no_answer:{key:"no_answer",stage:"No Answer - Attempt 1",tag:"adrian: no answer",days:2},
 voicemail:{key:"voicemail",stage:"Voicemail Left",tag:"adrian: voicemail",days:2},
 wrong_number:{key:"wrong_number",stage:"Wrong Number",tag:"adrian: wrong number",days:null},
 broker:{key:"broker",stage:"Broker",tag:"adrian: broker/realtor",days:null},
 dnc:{key:"dnc",stage:"Do NOT Call",tag:"adrian: dnc",days:null},
 not_interested:{key:"not_interested",stage:"Not Interested",tag:"adrian: not interested",days:30},
 callback:{key:"callback",stage:"Callback Scheduled",tag:"adrian: callback",days:1},
 possibly:{key:"possibly",stage:"Possibly Interested",tag:"adrian: possibly interested",days:3},
 interested:{key:"interested",stage:"Very Interested",tag:"adrian: interested",days:1},
 appointment:{key:"appointment",stage:"Confirmed Initial Appointment",tag:"adrian: appointment set",days:1},
 contacted:{key:"contacted",stage:"Initiated Contact",tag:"adrian: contacted",days:3}};
function norm(x?:string){if(!x)return null;const s=String(x).toLowerCase();
 if(s.includes("do not call")||s.includes("dnc"))return"dnc";if(s.includes("wrong number"))return"wrong_number";
 if(s.includes("broker")||s.includes("realtor"))return"broker";if(s.includes("appointment")||s.includes("booked"))return"appointment";
 if(s.includes("very interested")||s.includes("motivated"))return"interested";if(s.includes("possibly")||s.includes("maybe"))return"possibly";
 if(s.includes("not interested"))return"not_interested";if(s.includes("callback")||s.includes("call back"))return"callback";
 if(s.includes("voicemail"))return"voicemail";if(s.includes("no answer")||s.includes("no-answer"))return"no_answer";
 if(s.includes("interested"))return"interested";if(s.includes("contacted")||s.includes("connected"))return"contacted";return null;}
function infer(c:any):D{const a=c?.call_analysis||{},cu=a?.custom_analysis_data||{};
 const e=norm(cu.disposition)||norm(cu.call_disposition)||norm(cu.outcome);if(e)return DI[e];
 if(cu.appointment_booked===true||cu.appointment_set===true)return DI.appointment;
 if(c?.in_voicemail===true)return DI.voicemail;const dr=String(c?.disconnection_reason||"").toLowerCase();
 if(dr.includes("voicemail"))return DI.voicemail;
 if(dr.includes("no_answer")||dr.includes("busy")||dr==="dial_no_answer")return DI.no_answer;
 if(dr.includes("dial_failed")||dr.includes("invalid"))return DI.wrong_number;
 const se=String(a?.user_sentiment||"").toLowerCase();
 if(se==="negative")return DI.not_interested;if(se==="positive"&&a?.call_successful!==false)return DI.interested;
 if(se==="neutral")return DI.possibly;return DI.contacted;}
const durS=(ms:number)=>{const s=Math.round((+ms||0)/1000);return`${Math.floor(s/60)}m ${(s%60).toString().padStart(2,"0")}s`;};
const inDays=(n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString();};
function money(cu:any){for(const k of["asking_price","price","owner_asking","asking"]){const v=cu?.[k];
 if(v!=null){const n=Number(String(v).replace(/[^0-9.]/g,""));if(Number.isFinite(n)&&n>0)return n;}}return null;}
function attemptsFromTags(tags:string[]){let m=0;for(const t of tags){const s=String(t).toLowerCase();
 const mm=s.match(/no answer\s*-\s*attempt\s*(\d+)/);if(mm){const n=parseInt(mm[1],10);if(n>m)m=n;}
 if(s.includes("no answer - exhausted"))m=Math.max(m,4);}return m;}
function escalate(prev:number,wasVoicemail:boolean):{d:D;extra:string[]}{
 const n=prev+1;const vm=wasVoicemail?["adrian: voicemail"]:[];
 if(n>=4)return{d:{key:"no_answer_exhausted",stage:"Not Interested Seller",tag:"No Answer - Exhausted",
   days:null,label:"No Answer - Exhausted (3x no contact)"},extra:[...vm,"No Answer - Exhausted"]};
 const stage=n===1?"No Answer - Attempt 1":n===2?"No Answer - Attempt 2":"No Answer - Attempt 3+";
 return{d:{key:`no_answer_${n}`,stage,tag:`No Answer - Attempt ${n}`,days:2,
   label:wasVoicemail?`${stage} (voicemail left)`:stage},extra:vm};}

async function pipeline(){const r=await ghl(`/opportunities/pipelines?locationId=${LOC}`);
 return(r.json?.pipelines||[]).find((p:any)=>String(p.name||"").toLowerCase()===PIPE.toLowerCase())||null;}
function stageOf(p:any,name:string){const st=p?.stages||[],n=name.toLowerCase();
 return st.find((s:any)=>String(s.name||"").toLowerCase()===n)||st.find((s:any)=>String(s.name||"").toLowerCase().includes(n))||st[0]||null;}
function dirOf(c:any):"inbound"|"outbound"{const d=String(c?.direction||c?.call_type||"").toLowerCase();
 if(d.includes("inbound"))return"inbound";if(d.includes("outbound"))return"outbound";
 const adrian=(Deno.env.get("ADRIAN_NUMBER")||"+19544668132").replace(/[^0-9]/g,"");
 const to=String(c?.to_number||"").replace(/[^0-9]/g,"");
 if(adrian&&to&&to.endsWith(adrian.slice(-10)))return"inbound";return"outbound";}
async function contactId(c:any,dir:string){const m=c?.metadata||{},dy=c?.retell_llm_dynamic_variables||c?.dynamic_variables||{};
 const id=m.contact_id||m.contactId||dy.contact_id||dy.contactId;if(id)return String(id);
 const ph=dir==="inbound"?(c?.from_number||c?.to_number):(c?.to_number||c?.from_number);if(!ph)return null;
 const r=await ghl(`/contacts/?locationId=${LOC}&query=${encodeURIComponent(ph)}`);return(r.json?.contacts||[])[0]?.id||null;}

// Right-party auto-resolution: tell dispatch-api to confirm this number as the owner and retire
// the sibling numbers on the same property. Fire-and-forget; never blocks the webhook response.
function reachedOwner(d:D,cu:any):boolean{
 const rp=cu?.right_party_contact===true||cu?.spoke_to_owner===true||cu?.is_owner===true||
          cu?.owner_confirmed===true||cu?.reached_owner===true||cu?.identity_confirmed===true||cu?.decision_maker===true;
 const disps=(Deno.env.get("ADRIAN_OWNER_DISPOSITIONS")||"appointment,interested").split(",").map(s=>s.trim()).filter(Boolean);
 return rp||disps.includes(d.key);}
async function autoResolve(phone:string){
 const base=Deno.env.get("DISPATCH_API_URL")||"https://sezigczgwezeecgobuqd.supabase.co/functions/v1/dispatch-api";
 const key=Deno.env.get("DIAL_SECRET")||"bb-adrian-dial-9x27";
 const r=await fetch(`${base}?action=lead.resolve`,{method:"POST",
   headers:{"Content-Type":"application/json","x-internal-key":key},
   body:JSON.stringify({phone,source:"auto"})});
 const t=await r.text();console.log("auto-resolve",r.status,t.slice(0,160));}

function noteHtml(c:any,d:D,ask:number|null,tr:string,dir:string){const a=c?.call_analysis||{};
 const rec=c?.recording_url||"";const dt=c?.start_timestamp?new Date(+c.start_timestamp).toUTCString():"";
 const label=d.label||d.stage;
 const dirTxt=dir==="inbound"?"&#128228; Inbound (owner called in)":"&#128229; Outbound (Adrian dialed out)";
 return['<div style="line-height:1.7">',`<h2>&#128222; Adrian AI Call &mdash; ${label}</h2>`,
  `<p><strong>Direction:</strong> ${dirTxt}</p>`,
  dt?`<p><strong>Call Date &amp; Time:</strong> ${dt}</p>`:"",
  `<p><strong>Duration:</strong> ${durS(c?.duration_ms)}</p>`,
  `<p><strong>Sentiment:</strong> ${a.user_sentiment||"n/a"}</p>`,
  `<p><strong>Disposition:</strong> ${label}</p>`,
  ask?`<p><strong>Asking Price (owner):</strong> $${ask.toLocaleString()}</p>`:"",
  `<p><strong>Summary:</strong> ${a.call_summary||"(none)"}</p>`,
  rec?`<p><strong>&#9654; Recording:</strong> <a href="${rec}">Play / Download</a></p>`:"",
  '<hr><p><strong>Transcript:</strong></p>',`<div style="white-space:pre-wrap">${tr||"(none)"}</div>`,'</div>'].join("");}

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const ok=(b:unknown)=>new Response(JSON.stringify(b),{headers:{...cors,"Content-Type":"application/json"}});
 const raw=await req.text();
 const fwd=fetch(SYMPANA,{method:"POST",headers:{"Content-Type":"application/json","x-retell-signature":req.headers.get("x-retell-signature")||""},body:raw}).catch(e=>console.warn("fwd",e?.message));
 try{(globalThis as any).EdgeRuntime?.waitUntil?.(fwd);}catch{}
 try{let p:any={};try{p=raw?JSON.parse(raw):{};}catch{}
  const ev=p?.event,c=p?.call||p;if(ev&&ev!=="call_analyzed")return ok({skipped:ev,forwarded:true});
  const dir=dirOf(c);
  let d=infer(c);const cid=await contactId(c,dir);if(!cid)return ok({error:"contact_not_found",disposition:d.key,direction:dir,forwarded:true});
  const a=c?.call_analysis||{},cu=a?.custom_analysis_data||{};
  const dy=c?.retell_llm_dynamic_variables||c?.dynamic_variables||{},meta=c?.metadata||{};
  let addr=String(dy.listing_address||meta.listing_address||dy.property_address||"").trim();
  const tr=String(c?.transcript||"").trim();const rec=c?.recording_url||"";const dsec=Math.round((+c?.duration_ms||0)/1000);
  const ask=money(cu);const res:Record<string,unknown>={disposition:d.key,direction:dir,contactId:cid,forwarded:true};
  const cg=await ghl(`/contacts/${cid}`);const ct=cg.json?.contact||{};
  const nm=(ct.contactName||ct.name||`${ct.firstName||""} ${ct.lastName||""}`).trim()||"Adrian Seller Lead";
  const ph=ct.phone||(dir==="inbound"?c?.from_number:c?.to_number)||"";
  if(!addr){const cf=ct.customFields||ct.customField||[];
   const byId=(id:string)=>{const f=(cf||[]).find((x:any)=>x.id===id||x.customFieldId===id);return f?String(f.value??f.fieldValue??"").trim():"";};
   addr=byId("yUXrLod4dbSPWmnCbaSH")||byId("LHfGDHAAofUr7o85ci5a")||"";}
  let extraTags:string[]=[];
  if(d.key==="no_answer"||d.key==="voicemail"){
   const prior=attemptsFromTags((ct.tags||[]).map((x:any)=>String(x)));
   const esc=escalate(prior,d.key==="voicemail");d=esc.d;extraTags=esc.extra;
   res.attempt=prior+1;res.disposition=d.key;}
  await ghl(`/contacts/${cid}`,{method:"PUT",body:JSON.stringify({customFields:[
   {id:F.disp,value:d.label||d.stage},{id:F.sent,value:a.user_sentiment||""},{id:F.summ,value:a.call_summary||""},
   {id:F.rec,value:rec},{id:F.dursec,value:dsec},{id:F.tr,value:tr},{id:F.dur,value:durS(c?.duration_ms)},
   {id:F.dt,value:c?.start_timestamp?new Date(+c.start_timestamp).toUTCString():""}]})});
  const pl=await pipeline();
  if(pl){const st=stageOf(pl,d.stage);
   const search=await ghl(`/opportunities/search?location_id=${LOC}&contact_id=${cid}&pipeline_id=${pl.id}`);
   const ex=(search.json?.opportunities||[])[0];const oname=`${nm} | ${ph} | ${addr}`.replace(/\s\|\s$/,"");
   const ob:any={pipelineId:pl.id,pipelineStageId:st.id,name:oname,assignedTo:OWNER};if(ask)ob.monetaryValue=ask;
   let oid=ex?.id;
   if(oid){await ghl(`/opportunities/${oid}`,{method:"PUT",body:JSON.stringify(ob)});}
   else{const cr=await ghl(`/opportunities/`,{method:"POST",body:JSON.stringify({...ob,locationId:LOC,contactId:cid,status:"open"})});oid=cr.json?.opportunity?.id;}
   if(oid)await ghl(`/opportunities/${oid}/followers`,{method:"POST",body:JSON.stringify({followers:FOLLOWERS})});
   res.opportunity={stage:st?.name,name:oname,value:ask};}
  else res.opportunity={error:`pipeline not found`};
  const dirTag=dir==="inbound"?"Adrian: Inbound Call":"Adrian: Outbound Call";
  await ghl(`/contacts/${cid}/tags`,{method:"POST",body:JSON.stringify({tags:[d.tag,dirTag,...extraTags].filter((v,i,arr)=>v&&arr.indexOf(v)===i)})});
  await ghl(`/contacts/${cid}/notes`,{method:"POST",body:JSON.stringify({body:noteHtml(c,d,ask,tr,dir)})});
  if(d.days!=null)await ghl(`/contacts/${cid}/tasks`,{method:"POST",body:JSON.stringify({title:`Follow up (${d.stage})${addr?` — ${addr}`:""}`,body:`Auto by Adrian. Disposition: ${d.stage}. Review call note + recording, decide next step.`,dueDate:inDays(d.days),completed:false})});
  // Auto-resolve the Dispatch AI property lead when this call confirms the right-party owner.
  const resolvePhone=(dir==="inbound"?c?.from_number:c?.to_number)||ph;
  if(reachedOwner(d,cu)&&resolvePhone){
   res.autoResolve={triggered:true,phone:resolvePhone,disposition:d.key};
   const rr=autoResolve(String(resolvePhone)).catch((e)=>console.warn("auto-resolve err",e?.message||e));
   try{(globalThis as any).EdgeRuntime?.waitUntil?.(rr);}catch{}
  }
  console.log("adrian-postcall done",JSON.stringify(res));return ok(res);
 }catch(e:any){console.error("adrian-postcall err",e?.message||e);return ok({error:String(e?.message||e),forwarded:true});}
});
