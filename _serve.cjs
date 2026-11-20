const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.mp4':'video/mp4','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(root,p);
  fs.readFile(fp,(e,d)=>{
    if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(d);
  });
}).listen(8123,()=>console.log('up'));
