
const FALLBACK_FB={apiKey:'PASTE_YOUR_API_KEY_HERE',authDomain:'demo.local',projectId:'kollej-neon-demo',storageBucket:'demo.local',messagingSenderId:'1234567890',appId:'1:1234567890:web:demo'};
const FB_GLOBAL=typeof window!=='undefined'&&window.FB?window.FB:FALLBACK_FB;
const real=!!(FB_GLOBAL && FB_GLOBAL.apiKey && !FB_GLOBAL.apiKey.startsWith('PASTE') && typeof firebase!=='undefined');

function safeJsonParse(v,d){try{return JSON.parse(v)||d}catch{return d}}
const DEMO_KEY='kollej_neon_demo_data';
function loadDemoData(){return safeJsonParse(localStorage.getItem(DEMO_KEY),{users:[],teachers:[],tests:[],results:[],meta:{},admins:[],groupTeachers:[]})}
function saveDemoData(data){localStorage.setItem(DEMO_KEY,JSON.stringify(data))}

function buildDemoCollection(name){
  const read=()=>loadDemoData();
  const write=(next)=>saveDemoData(next);
  const listFromStore=()=>{
    const data=read();const value=data[name];
    if(Array.isArray(value))return value;
    if(value&&typeof value==='object')return Object.entries(value).map(([id,val])=>({id,...val}));
    return [];
  };
  const saveList=(list)=>{
    const data=read();
    if(Array.isArray(data[name]))data[name]=list;
    else if(data[name]&&typeof data[name]==='object'){
      const out={};for(const item of list){const key=String(item.id||item.uid||'item');out[key]=Object.assign({},item);delete out[key].id;delete out[key].uid;}
      data[name]=out;
    }else data[name]=list;
    write(data);
  };
  return {
    doc(id){
      return {
        async get(){
          const data=read();const table=data[name];
          let item=null;
          if(Array.isArray(table))item=table.find(x=>String(x.id||x.uid)===String(id))||null;
          else if(table&&typeof table==='object')item=table[String(id)]||null;
          return {exists:!!item,data:()=>item||{},id};
        },
        async set(val){
          const data=read();const table=data[name]||[];
          if(Array.isArray(table)){
            const item=table.find(x=>String(x.id||x.uid)===String(id));
            if(item){Object.assign(item,val)}else{table.push({id,...val})}
            data[name]=table;
          }else if(table&&typeof table==='object'){
            data[name]=Object.assign({},table,{[String(id)]:val});
          }else{data[name]=[{id,...val}]}
          write(data);return {id};
        },
        async update(val){
          const data=read();const table=data[name]||[];
          if(Array.isArray(table)){
            const idx=table.findIndex(x=>String(x.id||x.uid)===String(id));
            if(idx>=0){table[idx]=Object.assign({},table[idx],val);data[name]=table;write(data);}
          }else if(table&&typeof table==='object'){
            if(table[String(id)]){data[name]=Object.assign({},table,{[String(id)]:Object.assign({},table[String(id)],val)});write(data);}
          }
          return {id};
        },
        async delete(){
          const data=read();const table=data[name]||[];
          if(Array.isArray(table))data[name]=table.filter(x=>String(x.id||x.uid)!==String(id));
          else if(table&&typeof table==='object'){delete data[name][String(id)];}
          write(data);return true;
        }
      };
    },
    add(val){
      const data=read();const list=listFromStore();const item=Object.assign({id:(Date.now()+Math.random()).toString(36)},val);list.push(item);saveList(list);return Promise.resolve({id:item.id});
    },
    where(field,op,value){
      const list=listFromStore();
      return {
        onSnapshot(cb){
          const docs=list.filter(item=>{const v=item[field];if(op==='==')return v===value;return true;}).map(item=>({id:String(item.id||item.uid),data:()=>item}));
          cb({docs});
          return ()=>{};
        }
      };
    },
    onSnapshot(cb){
      cb({docs:listFromStore().map(item=>({id:String(item.id||item.uid),data:()=>item}))});
      return ()=>{};
    }
  };
}

let db=null,au=null;
if(real){firebase.initializeApp(FB_GLOBAL);db=firebase.firestore();au=firebase.auth();}
else{
  const demoData=loadDemoData();
  if(!demoData.meta?.setup){demoData.meta={setup:{at:Date.now()}};saveDemoData(demoData)}
  db={
    collection(name){return buildDemoCollection(name);}
  };
  au={
    currentUser:null,
    listeners:[],
    onAuthStateChanged(cb){this.listeners.push(cb);cb(this.currentUser);},
    async createUserWithEmailAndPassword(email,password){
      if(!email||!password||password.length<6){throw new Error('Login va parol noto\'g\'ri');}
      const data=loadDemoData();const uid='u-'+Date.now()+Math.random().toString(36).slice(2);const user={uid,email,displayName:email.replace(/@.*/,''),password};
      data.users=data.users||[];data.users.push(user);saveDemoData(data);this.currentUser=user;this.listeners.forEach(cb=>cb(user));return {user};
    },
    async signInWithEmailAndPassword(email,password){
      const data=loadDemoData();const user=(data.users||[]).find(u=>u.email===email && u.password===password);
      if(!user) throw new Error('Email or password is invalid');
      this.currentUser=user;this.listeners.forEach(cb=>cb(user));return {user};
    },
    async signOut(){this.currentUser=null;this.listeners.forEach(cb=>cb(null));}
  };
}
const newApp=()=>real?firebase.initializeApp(FB_GLOBAL,'s'+Date.now()):null;
const D={users:[],teachers:[],tests:[],results:[]};
const EM=l=>l+'@kollej.uz',col=n=>db.collection(n);
let unsubs=[],busy=false,needSetup=false;
function listen(){unsubs.forEach(f=>f());unsubs=[];
 const w=(q,k,m)=>unsubs.push(q.onSnapshot(s=>{D[k]=s.docs.map(d=>Object.assign({},d.data(),m?m(d):{}));if(k==='results')D.results.sort((a,b)=>a.date-b.date);refresh()},e=>console.warn(k,e.message)));
 w(col('tests'),'tests',d=>({id:d.id}));w(col('groupTeachers'),'teachers');
 if(me.role==='oquvchi')w(col('results').where('uid','==',me.uid),'results');
 else if(me.role==='oqituvchi'){w(col('results').where('group','==',me.group),'results');w(col('users').where('group','==',me.group),'users',d=>({uid:d.id}))}
 else{w(col('results'),'results');w(col('users'),'users',d=>({uid:d.id}))}}
function refresh(){if(view==='home'||view==='teacher'||(view==='admin'&&ctx.tab==='a3'))render()}
function logout(){adm=false;reg=false;if(au)au.signOut()}
function showErr(m){err=m;const e=$('#er');if(e)e.textContent=m}
function eye(){const p=$('#ps');p.type=p.type==='password'?'text':'password'}
let fails=0,lock=0;
function locked(){if(Date.now()<lock){showErr('Juda ko\'p urinish. '+Math.ceil((lock-Date.now())/1000)+' soniya kuting.');return true}return false}
function bad(m){fails++;if(fails>=5){fails=0;lock=Date.now()+30000;m='5 marta xato. 30 soniya kuting.'}showErr(m)}
async function enter(u){
 if(!u){unsubs.forEach(f=>f());unsubs=[];me=null;view=needSetup?'first':'auth';return render()}
 try{const a=await col('admins').doc(u.uid).get();
  if(a.exists){me={uid:u.uid,name:'Admin',login:'admin',role:'admin'};ctx.tab='a1';listen();return go('admin')}
  const p=await col('users').doc(u.uid).get();
  if(!p.exists){await au.signOut();return showErr('Profil topilmadi')}
  const d=p.data();me={uid:u.uid,name:d.name,login:d.login,role:d.role,group:d.group};listen();
  go(d.role==='oqituvchi'?'teacher':(d.group?'home':'kurs'))}catch(e){showErr('Xato: '+e.message)}}
async function boot(){if(!db){view='setup';return render()}view='load';render();
 try{const s=await col('meta').doc('setup').get();if(!s.exists){needSetup=true;view='first';render()}}catch(e){view='setup';ctx.msg='Xato: '+e.message+' — Firestore Rules joylanganini tekshiring.';return render()}
 au.onAuthStateChanged(u=>{if(!busy)enter(u)})}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=k=>Array.from({length:k==1?17:13},(_,i)=>`${i+1}/${k==1?26:25}`);
const L='ABCD';
let me=null,view='auth',tap=0,adm=false,reg=false,ctx={},err='';
const $=s=>document.querySelector(s);
function go(v,c){view=v;if(c)ctx=Object.assign(ctx,c);err='';render()}
function grade(p){return p>=90?['🏆','A\'lo!','Siz chempionsiz, zo\'r natija!']:p>=70?['🌟','Yaxshi','Juda yaxshi, bir oz qoldi!']:p>=50?['👍','Qoniqarli','Yomon emas, yana takrorlang.']:p>=30?['📚','Past','Mavzuni qayta o\'qib chiqing.']:['💪','Juda past','Taslim bo\'lmang, yana urinib ko\'ring!']}
function logoTap(){if(me||!au)return;tap++;if(tap>=5){tap=0;adm=true;reg=false;go('auth')}setTimeout(()=>tap=0,2500)}
function render(){
 let h=`<div class="logo" onclick="logoTap()">✦ KOLLEJ NEON ✦</div>`;

 if(me)h+=`<div class="row mu"><span>${esc(me.name||me.login)} · ${me.role}</span><button onclick="logout()">Chiqish</button></div>`;
 h+=V[view]?V[view]():'';
 $('#app').innerHTML=h;
}
const V={
auth(){return `<div class="gl auth"><div class="ico">${adm?'🛡️':'🎓'}</div><h2>${adm?'Admin kirish':'Xush kelibsiz'}</h2><p class="mu c">${adm?'Faqat administrator uchun':'Hisobingizga kiring yoki yangi hisob oching'}</p>
${adm?'':`<div class="tabs"><button class="${reg?'':'sel'}" onclick="reg=false;go('auth')">Kirish</button><button class="${reg?'sel':''}" onclick="reg=true;go('auth')">Ro'yxatdan o'tish</button></div>`}
<form onsubmit="event.preventDefault();${reg?'doReg()':'doLogin()'}">
${reg?'<label class="f">👤<input id="nm" placeholder="Ism familiya" autocomplete="name"></label>':''}
<label class="f">🔑<input id="lg" placeholder="Login" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
<label class="f">🔒<input id="ps" type="password" placeholder="Parol" autocomplete="${reg?'new-password':'current-password'}"><span class="eye" onclick="eye()">👁</span></label>
${reg?'<div class="mu">Login: 3+ belgi (lotin harf, raqam, _). Parol: 6+ belgi, harf va raqam.</div>':''}
<div class="err" id="er">${err}</div>
<button class="p w" type="submit">${reg?'Hisob yaratish':'Kirish'}</button></form>
${adm?'<button class="w" onclick="adm=false;go(\'auth\')">← Orqaga</button>':''}</div>`},
setup(){return `<div class="gl"><h2>⚙️ Baza sozlanmagan</h2><p class="mu">${ctx.msg||'script.js faylining boshidagi FB ichiga Firebase kalitlarini yozing.'}</p></div>`},
first(){return `<div class="gl auth"><div class="ico">🛡️</div><h2>Admin o'rnatish</h2><p class="mu c">Birinchi ishga tushirish. Login: <b>admin</b>. Parolni o'zingiz belgilang.</p>
<form onsubmit="event.preventDefault();doSetup()"><label class="f">🔒<input id="ps" type="password" placeholder="Yangi parol"></label><label class="f">🔒<input id="ps2" type="password" placeholder="Parolni takrorlang"></label>
<div class="err" id="er">${err}</div><button class="p w" type="submit">Admin yaratish</button></form></div>`},
load(){return `<div class="gl mu">Yuklanmoqda...</div>`},
kurs(){return `<div class="gl"><h2>Kursingizni tanlang</h2><button class="p" onclick="go('grp',{k:1})">1-kurs</button><button class="p" onclick="go('grp',{k:2})">2-kurs</button></div>`},
grp(){return `<div class="gl"><h2>${ctx.k}-kurs guruhlari</h2><div class="grid">${groups(ctx.k).map(g=>`<button onclick="pickG('${g}')">${g}</button>`).join('')}</div><button onclick="go('kurs')">← Orqaga</button></div>`},
home(){const g=me.group,t=D.teachers.find(x=>x.group===g);
 const ts=D.tests.filter(x=>x.group==='all'||x.group===g);
 return `<div class="gl"><div class="row"><h2>Guruh ${g}</h2><button onclick="go('kurs')">Guruhni o'zgartirish</button></div>
 ${t?`<div class="gl teacher"><div class="mu">O'qituvchi</div><h3>👨‍🏫 ${esc(t.name)}</h3></div>`:'<div class="mu">Bu guruhga o\'qituvchi hali biriktirilmagan.</div>'}</div>
 <h3>📝 Testlar</h3>${ts.length?ts.map(x=>{const r=D.results.filter(y=>y.uid===me.uid&&y.tid===x.id).pop();return `<div class="gl row"><div><b>${esc(x.title)}</b><div class="mu">${x.qs.length} ta savol${r?` · oxirgi: ${r.score}/${r.total} ${grade(r.p)[0]}`:''}</div></div><button class="p" onclick="startT('${x.id}')">${r?'Qayta':'Boshlash'}</button></div>`}).join(''):'<div class="gl mu">Hozircha test yo\'q.</div>'}`},
test(){const t=ctx.t,q=t.qs[ctx.i];return `<div class="gl"><div class="row mu"><span>${esc(t.title)}</span><span>${ctx.i+1}/${t.qs.length}</span></div>
 <div class="bar"><i style="width:${ctx.i/t.qs.length*100}%"></i></div><h3>${esc(q.q)}</h3>
 ${q.o.map((o,i)=>`<button class="opt ${ctx.a[ctx.i]===i?'sel':''}" onclick="ans(${i})">${L[i]}) ${esc(o)}</button>`).join('')}
 <button class="p" onclick="nextQ()">${ctx.i+1<t.qs.length?'Keyingi →':'Yakunlash ✔'}</button></div>`},
res(){const r=ctx.r,g=grade(r.p);return `<div class="gl"><div class="big">${g[0]}</div><h2 style="text-align:center">${g[1]}</h2>
 <p style="text-align:center">To'g'ri javoblar: <b>${r.score}</b> / ${r.total} (${r.p}%)</p><div class="bar"><i style="width:${r.p}%"></i></div><p class="mu" style="text-align:center">${g[2]}</p>
 <button onclick="go('home')">Bosh sahifa</button></div>`},
teacher(){const s=D.users.filter(u=>u.role==='oquvchi'&&u.group===me.group);
 return `<div class="gl"><h2>👨‍🏫 ${esc(me.name)} — guruh ${me.group}</h2><h3>O'quvchilar (${s.length})</h3>${s.map(u=>{const rs=D.results.filter(r=>r.uid===u.uid);return `<div class="row"><span>${esc(u.name)}</span><span class="mu">${rs.length?rs.map(r=>r.score+'/'+r.total).join(', '):'test yo\'q'}</span></div>`}).join('')||'<div class="mu">Hali o\'quvchi yo\'q</div>'}</div>`},
admin(){const tabs=[['a1','Guruh va o\'qituvchi'],['a2','Test yaratish'],['a3','Natijalar']];
 return `<div class="gl"><h2>⚙️ Admin panel</h2>${tabs.map(t=>`<button class="${ctx.tab===t[0]?'sel':''}" onclick="ctx.tab='${t[0]}';render()">${t[1]}</button>`).join('')}</div>${T[ctx.tab||'a1']()}`}
};
const T={
a1(){const g=ctx.ag;return `<div class="gl"><h3>Guruh tanlang</h3>${[1,2].map(k=>`<div class="mu">${k}-kurs</div><div class="grid">${groups(k).map(x=>`<button class="${g===x?'sel':''}" onclick="ctx.ag='${x}';render()">${x}</button>`).join('')}</div>`).join('')}</div>
 ${g?`<div class="gl"><h3>${g} guruhiga o'qituvchi qo'shish</h3><input id="tn" placeholder="O'qituvchi ismi"><input id="tl" placeholder="Login"><input id="tp" placeholder="Parol"><div class="err">${err}</div><button class="p" onclick="addT()">Yaratish</button></div>`:''}
 <div class="gl"><h3>O'qituvchilar</h3>${D.teachers.map((t,i)=>`<div class="row"><span>${esc(t.group)} — ${esc(t.name)} <span class="mu">(${esc(t.login)})</span></span><button onclick="delT(${i})">🗑</button></div>`).join('')||'<div class="mu">Yo\'q</div>'}</div>`},
a2(){const d=ctx.dr||(ctx.dr={title:'',group:'all',qs:[]});
 return `<div class="gl"><h3>Yangi test</h3><input id="tt" placeholder="Test nomi" value="${esc(d.title)}">
 <select id="tg" onchange="ctx.dr.group=this.value"><option value="all">Barcha guruhlar</option>${[1,2].flatMap(groups).map(g=>`<option ${d.group===g?'selected':''}>${g}</option>`).join('')}</select>
 <div class="mu">Savollar: <b style="color:var(--c3)">${d.qs.length}/20</b></div></div>
 <div class="gl"><input id="q" placeholder="Savol matni">${[0,1,2,3].map(i=>`<label class="r"><input type="radio" name="c" value="${i}" ${i==0?'checked':''}><input id="o${i}" placeholder="${L[i]} variant"></label>`).join('')}
 <div class="mu">Radio tugma — to'g'ri javob</div><div class="err">${err}</div><button onclick="addQ()">+ Savol qo'shish</button><button class="p" onclick="saveTest()">💾 Testni saqlash</button></div>
 <div class="gl"><h3>⚡ Tez qo'shish</h3><div class="mu">Savollarni ko'chirib qo'ying. Har savol: 1-qator savol, keyin 4 ta variant, to'g'ri javob oldiga * qo'ying. Savollar orasida bo'sh qator qoldiring.</div><textarea id="bulk" rows="9" placeholder="2+2 nechta?
A) 3
*B) 4
C) 5
D) 6

Poytaxt qaysi?
A) Samarqand
B) Buxoro
*C) Toshkent
D) Xiva"></textarea><button onclick="bulk()">+ Hammasini qo'shish</button></div>
 ${d.qs.length?`<div class="gl">${d.qs.map((q,i)=>`<div class="row mu"><span>${i+1}. ${esc(q.q)} → ${L[q.c]}</span><button onclick="ctx.dr.qs.splice(${i},1);render()">🗑</button></div>`).join('')}</div>`:''}
 <div class="gl"><h3>📊 Baholash mezoni</h3><div class="mu">90–100% 🏆 A'lo · 70–89% 🌟 Yaxshi · 50–69% 👍 Qoniqarli · 30–49% 📚 Past · 0–29% 💪 Juda past<br>Foiz = to'g'ri javoblar ÷ savollar soni (20 ta savolda har biri 5%).</div></div>
 ${D.tests.length?`<div class="gl"><h3>Testlar</h3>${D.tests.map((t,i)=>`<div class="row"><span>${esc(t.title)} · ${t.group} · ${t.qs.length} savol</span><button onclick="delTest(${i})">🗑</button></div>`).join('')}</div>`:''}`},
a3(){return `<div class="gl"><h3>Natijalar</h3>${D.results.slice().reverse().map(r=>{const t=D.tests.find(x=>x.id===r.tid);return `<div class="row"><span>${esc(r.name)} <span class="mu">${r.group} · ${t?esc(t.title):''}</span></span><b>${r.score}/${r.total} ${grade(r.p)[0]}</b></div>`}).join('')||'<div class="mu">Hali natija yo\'q</div>'}</div>`}
};
async function doReg(){const n=$('#nm').value.trim(),l=$('#lg').value.trim().toLowerCase(),p=$('#ps').value.trim();
 if(n.length<3)return showErr('Ism familiyani yozing');
 if(!/^[a-z0-9_]{3,20}$/.test(l)||l==='admin')return showErr('Login: 3-20 belgi, faqat lotin harf, raqam, _');
 if(p.length<6||!/[a-zA-Z]/.test(p)||!/\d/.test(p))return showErr('Parol: 6+ belgi, harf va raqam bo\'lsin');
 busy=true;
 try{const c=await au.createUserWithEmailAndPassword(EM(l),p);await col('users').doc(c.user.uid).set({name:n,login:l,role:'oquvchi',group:''});busy=false;await enter(c.user)}
 catch(e){busy=false;showErr(e.code==='auth/email-already-in-use'?'Bu login band':'Xato: '+e.message)}}
async function doLogin(){if(locked())return;const l=$('#lg').value.trim().toLowerCase(),p=$('#ps').value.trim();
 if(!l||!p)return showErr('Login va parolni kiriting');
 try{await au.signInWithEmailAndPassword(EM(l),p);fails=0}catch(e){bad(e.code==='auth/network-request-failed'?'Internet xatosi':'Login yoki parol xato')}}
async function pickG(g){me.group=g;try{await col('users').doc(me.uid).update({group:g})}catch(e){}go('home')}
async function mkTeacher(n,l,p,g){let sec;try{sec=newApp();const c=await sec.auth().createUserWithEmailAndPassword(EM(l),p),uid=c.user.uid,old=D.teachers.find(t=>t.group===g);
  await col('users').doc(uid).set({name:n,login:l,role:'oqituvchi',group:g});
  await col('groupTeachers').doc(g.replace('/','-')).set({name:n,login:l,uid,group:g});
  if(old&&old.uid)await col('users').doc(old.uid).delete()}finally{try{if(sec){await sec.auth().signOut();await sec.delete()}}catch(e){}}}
async function addT(){const n=$('#tn').value.trim(),l=$('#tl').value.trim().toLowerCase(),p=$('#tp').value.trim();
 if(!n||!/^[a-z0-9_]{3,20}$/.test(l)||p.length<6){err='Ism, login (lotin, 3+) va parol (6+) kerak';return render()}
 try{await mkTeacher(n,l,p,ctx.ag);err='O\'qituvchi yaratildi ✔'}catch(e){err=e.code==='auth/email-already-in-use'?'Bu login band':'Xato: '+e.message}
 render()}
async function doSetup(){const p=$('#ps').value.trim(),p2=$('#ps2').value.trim();
 if(p.length<6||!/[a-zA-Z]/.test(p)||!/\d/.test(p))return showErr('Parol: 6+ belgi, harf va raqam bo\'lsin');
 if(p!==p2)return showErr('Parollar bir xil emas');
 busy=true;
 try{const c=await au.createUserWithEmailAndPassword(EM('admin'),p);
  const b=db.batch();b.set(col('meta').doc('setup'),{at:Date.now()});b.set(col('admins').doc(c.user.uid),{ok:true});await b.commit();needSetup=false;
  try{await mkTeacher('Oytojixon','oytojixon','Oyto#1426','17/26')}catch(e){}
  busy=false;await enter(c.user)}
 catch(e){busy=false;showErr('Xato: '+e.message)}}
function bulk(){const d=ctx.dr;d.title=$('#tt').value;let n=0;
 $('#bulk').value.split(/\n\s*\n/).forEach(b=>{const ls=b.split('\n').map(x=>x.trim()).filter(Boolean);if(ls.length<5)return;
  const q=ls[0].replace(/^\d+[.)]\s*/,''),os=ls.slice(1,5);let c=-1;
  const o=os.map((x,i)=>{if(/^[*+]/.test(x)){c=i;x=x.slice(1).trim()}return x.replace(/^[A-Da-d][).:]\s*/,'')});
  if(c>=0&&d.qs.length<20){d.qs.push({q,o,c});n++}});
 err=n?n+' ta savol qo\'shildi ✔':'Format xato: har savolga 5 qator va to\'g\'ri javob oldiga * kerak';render()}
async function delT(i){const t=D.teachers[i];try{await col('groupTeachers').doc(t.group.replace('/','-')).delete();if(t.uid)await col('users').doc(t.uid).delete()}catch(e){err=e.message}render()}
async function delTest(i){try{await col('tests').doc(D.tests[i].id).delete()}catch(e){err=e.message}render()}
function addQ(){const d=ctx.dr;d.title=$('#tt').value;const q=$('#q').value.trim(),o=[0,1,2,3].map(i=>$('#o'+i).value.trim());
 if(!q||o.some(x=>!x)){err='Savol va 4 ta variantni yozing';return render()}
 if(d.qs.length>=20){err='20 tadan ko\'p bo\'lmasin';return render()}
 d.qs.push({q,o,c:+document.querySelector('input[name=c]:checked').value});err='';render()}
async function saveTest(){const d=ctx.dr;d.title=$('#tt').value.trim();
 const q0=$('#q').value.trim(),o0=[0,1,2,3].map(i=>$('#o'+i).value.trim());
 if(q0&&o0.every(x=>x)&&d.qs.length<20)d.qs.push({q:q0,o:o0,c:+document.querySelector('input[name=c]:checked').value});
 if(!d.title||!d.qs.length){err='Test nomi va kamida 1 ta savol kerak';return render()}
 try{await col('tests').add({title:d.title,group:d.group,qs:d.qs,date:Date.now()});ctx.dr=null;err='Test saqlandi ✔ — o\'quvchilar hozir ishlay oladi'}catch(e){err='Saqlanmadi: '+e.message}render()}
function startT(id){go('test',{t:D.tests.find(x=>x.id===id),i:0,a:[]})}
function ans(i){ctx.a[ctx.i]=i;render()}
async function nextQ(){if(ctx.a[ctx.i]==null)return;
 if(ctx.i+1<ctx.t.qs.length){ctx.i++;return render()}
 const total=ctx.t.qs.length,score=ctx.t.qs.filter((q,i)=>ctx.a[i]===q.c).length,p=Math.round(score/total*100);
 const r={uid:me.uid,name:me.name,group:me.group,tid:ctx.t.id,score,total,p,date:Date.now()};
 try{await col('results').add(r)}catch(e){}
 go('res',{r})}
/* AI yordamchi */
const msgs=[{a:1,t:'Salom! Men AI yordamchiman. Test paytida savolni o\'qib, maslahat va javob bera olaman.'}];
function toggleAI(){$('#aip').classList.toggle('on');drawM()}
function drawM(){$('#ml').innerHTML=msgs.map(m=>`<div class="m ${m.a?'a':'u'}">${esc(m.t)}</div>`).join('');$('#ml').scrollTop=9e9}
function say(t){try{const u=new SpeechSynthesisUtterance(t);u.lang='uz-UZ';speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function ask(x){const i=$('#ai-in'),s=(x||i.value).trim();if(!s)return;i.value='';msgs.push({t:s});
 const l=s.toLowerCase(),q=view==='test'?ctx.t.qs[ctx.i]:null;let a;
 if(!q)a=/test|savol|javob|maslahat/.test(l)?'Testni boshlang, keyin savolni o\'qib, maslahat yoki javob bera olaman.':'Men testlarda yordam beraman: "o\'qi", "maslahat", "javob", "tushuntir" deb yozing.';
 else{const opts=q.o.map((o,i)=>`${L[i]}) ${o}`).join('\n'),cor=`${L[q.c]}) ${q.o[q.c]}`;
  if(/o'qi|oqi|o‘qi|read/.test(l)){a=`Savol: ${q.q}\n${opts}`;say(a)}
  else if(/javob|answer/.test(l))a=`To'g'ri javob: ${cor}`;
  else if(/maslahat|yordam|hint/.test(l)){const w=[0,1,2,3].filter(i=>i!==q.c).sort(()=>Math.random()-.5).slice(0,2).sort();a=`${L[w[0]]} va ${L[w[1]]} variantlar noto'g'ri ko'rinadi. Qolganlaridan birini tanlang.`}
  else if(/tushun|nega|why/.test(l))a=`Savol: "${q.q}". To'g'ri javob ${cor}. Boshqa variantlar savol mazmuniga mos kelmaydi. Mavzuni darslikdan qayta ko'rib chiqing.`;
  else a=`Hozirgi savol: "${q.q}". "o'qi", "maslahat", "javob" yoki "tushuntir" deb yozing.`}
 msgs.push({a:1,t:a});drawM()}
boot();
