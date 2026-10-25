const { app, BrowserWindow } = require('electron'); const path=require('path'); const fs=require('fs');
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,webPreferences:{offscreen:true, webSecurity:false}}); const errs=[];
  w.webContents.on('console-message',(_e,l,m)=>{ if(l>=2) errs.push(m); });
  await w.loadFile(path.join(__dirname,'model.html'));
  const jobs=JSON.parse(process.env.JOBS);
  for (const [name,file,pose,rot] of jobs) {
    const r=await w.webContents.executeJavaScript(`runModel(${JSON.stringify('models/'+file)}, ${JSON.stringify(pose)}, ${rot||0}, true)`).catch(e=>({err:String(e)}));
    if (r.err) { console.log(name, r.err); continue; }
    fs.writeFileSync(path.join(__dirname,'..','out',name+'.png'),Buffer.from(r.url.split(',')[1],'base64')); console.log(name, JSON.stringify(r.info));
  }
  console.log('ERRORS',JSON.stringify(errs.slice(0,5))); app.quit();
});
