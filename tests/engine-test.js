const { app, BrowserWindow } = require('electron'); const path=require('path'); const fs=require('fs');
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,webPreferences:{offscreen:true}}); const errs=[];
  w.webContents.on('console-message',(_e,l,m)=>{ if(l>=2) errs.push(m); });
  await w.loadFile(path.join(__dirname,'engine.html'));
  const res=await w.webContents.executeJavaScript(`runTest(${JSON.stringify((process.env.FMTS||'4x5').split(','))}, ${JSON.stringify(process.env.GAME||'')})`);
  fs.mkdirSync(path.join(__dirname,'..','out','v2'),{recursive:true});
  for(const [k,v] of Object.entries(res)){ fs.writeFileSync(path.join(__dirname,'..','out','v2',k+'.png'),Buffer.from(v.url.split(',')[1],'base64')); console.log(k,v.ms+'ms'); }
  console.log('ERRORS',JSON.stringify(errs.slice(0,8))); app.quit();
});
