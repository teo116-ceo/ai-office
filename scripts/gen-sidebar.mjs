import { readFileSync, writeFileSync } from 'fs'
import { inflateSync } from 'zlib'

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c}
function decodePNG(filePath) {
  const buf = readFileSync(filePath)
  let width,height,ch; const idatChunks=[]; let pos=8
  while(pos<buf.length){
    const len=buf.readUInt32BE(pos);pos+=4
    const type=buf.subarray(pos,pos+4).toString('ascii');pos+=4
    const data=buf.subarray(pos,pos+len);pos+=len+4
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);const ct=data[9];ch={0:1,2:3,4:2,6:4}[ct]}
    else if(type==='IDAT')idatChunks.push(Buffer.from(data))
    else if(type==='IEND')break
  }
  const stride=width*ch,raw=inflateSync(Buffer.concat(idatChunks)),pixels=Buffer.alloc(height*stride)
  let rawPos=0
  for(let y=0;y<height;y++){
    const filter=raw[rawPos++],src=raw.subarray(rawPos,rawPos+stride);rawPos+=stride
    const dst=pixels.subarray(y*stride,(y+1)*stride)
    const prev=y>0?pixels.subarray((y-1)*stride,y*stride):null
    for(let x=0;x<stride;x++){
      const a=x>=ch?dst[x-ch]:0,b=prev?prev[x]:0,c=x>=ch&&prev?prev[x-ch]:0
      let v;switch(filter){
        case 0:v=src[x];break;case 1:v=(src[x]+a)&0xff;break;case 2:v=(src[x]+b)&0xff;break
        case 3:v=(src[x]+Math.floor((a+b)/2))&0xff;break;case 4:v=(src[x]+paeth(a,b,c))&0xff;break
      }
      dst[x]=v
    }
  }
  return {width,height,ch,stride,pixels}
}

function sample(img,nx,ny){
  const fx=Math.max(0,Math.min(1,nx))*(img.width-1),fy=Math.max(0,Math.min(1,ny))*(img.height-1)
  const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(x0+1,img.width-1),y1=Math.min(y0+1,img.height-1)
  const dx=fx-x0,dy=fy-y0
  function px(x,y){const o=y*img.stride+x*img.ch;const r=img.pixels[o],g=img.ch>=3?img.pixels[o+1]:r,b=img.ch>=3?img.pixels[o+2]:r,a=img.ch===4?img.pixels[o+3]:img.ch===2?img.pixels[o+1]:255;return[r,g,b,a]}
  const p00=px(x0,y0),p10=px(x1,y0),p01=px(x0,y1),p11=px(x1,y1)
  return[0,1,2,3].map(i=>Math.round(p00[i]*(1-dx)*(1-dy)+p10[i]*dx*(1-dy)+p01[i]*(1-dx)*dy+p11[i]*dx*dy))
}

function isBg(r,g,b,a){return a<40||(r>200&&g>200&&b>200)}
function blend(fg,bg,alpha){return fg.map((c,i)=>Math.round(bg[i]+(c-bg[i])*alpha))}

function makeBMP(width,height,pixelFn){
  const rowStride=Math.ceil(width*3/4)*4,pixBytes=rowStride*height
  const buf=Buffer.alloc(54+pixBytes,0)
  buf[0]=0x42;buf[1]=0x4d
  buf.writeUInt32LE(54+pixBytes,2);buf.writeUInt32LE(54,10);buf.writeUInt32LE(40,14)
  buf.writeInt32LE(width,18);buf.writeInt32LE(height,22)
  buf.writeUInt16LE(1,26);buf.writeUInt16LE(24,28);buf.writeUInt32LE(pixBytes,34)
  buf.writeInt32LE(2835,38);buf.writeInt32LE(2835,42)
  for(let fy=0;fy<height;fy++){
    const ly=height-1-fy
    for(let x=0;x<width;x++){
      const [r,g,b]=pixelFn(x,ly).map(v=>Math.max(0,Math.min(255,Math.round(v))))
      const off=54+fy*rowStride+x*3
      buf[off]=b;buf[off+1]=g;buf[off+2]=r
    }
  }
  return buf
}

const logo = decodePNG('dist/KakaoTalk_20260426_224715938.png')
console.log(`로고 원본: ${logo.width}x${logo.height}`)

const TEAL_BG   = [27, 95, 88]
const TEAL_DARK = [14, 56, 52]
const WHITE     = [255, 255, 255]
const W = 164, H = 314

// 원본 비율(679:530 ≈ 1.28:1) 유지, 가로 90px 기준
const logoW = 90
const logoH = Math.round(logoW * logo.height / logo.width)  // ≈ 94px
const logoX = Math.round((W - logoW) / 2)
const logoY = Math.round((H - logoH) / 2) - 10  // 약간 위

console.log(`로고 렌더: ${logoW}x${logoH} at (${logoX}, ${logoY})`)

const buf = makeBMP(W, H, (x, y) => {
  const t = y / (H - 1)
  const bg = TEAL_BG.map((c, i) => Math.round(c + (TEAL_DARK[i] - c) * t))

  if (x >= logoX && x < logoX + logoW && y >= logoY && y < logoY + logoH) {
    const nx = (x - logoX) / logoW
    const ny = (y - logoY) / logoH
    const [r, g, b, a] = sample(logo, nx, ny)
    if (!isBg(r, g, b, a)) {
      return blend(WHITE, bg, (a / 255) * 0.92)
    }
  }

  if (x === W - 1) return bg.map((c, i) => Math.round(c + (WHITE[i] - c) * 0.12))
  return bg
})

writeFileSync('build/installer-sidebar.bmp', buf)
console.log('installer-sidebar.bmp 생성 완료')
